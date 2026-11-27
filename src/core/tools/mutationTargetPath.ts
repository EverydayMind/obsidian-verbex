import { L } from '../../i18n/modelText'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import { assertNotAiPrivate } from '../../security/aiPrivateRefusal'
import {
  assertUserVaultPath,
  isAllowedHiddenConfigPath,
  normalizeVaultPathKey,
} from '../../security/vaultPathPolicy'

import type { ToolExecutionContext } from './localToolCommon'

type MutationTarget =
  | { kind: 'exact'; path: string }
  | { kind: 'redirect'; candidates: [string] }
  | { kind: 'ambiguous'; candidates: string[]; remaining: number }
  | { kind: 'missing' }

function allowedHiddenPath(path: string, ctx: ToolExecutionContext): boolean {
  return (
    !!ctx.configFolders &&
    isAllowedHiddenConfigPath(ctx.app, path, ctx.configFolders)
  )
}

function exactFile(
  path: string,
  ctx: ToolExecutionContext,
  extensions: readonly string[],
) {
  const file = ctx.app.vault.getFileByPath(path)
  return file?.path === path && extensions.includes(file.extension)
    ? file
    : null
}

function visibleCandidate(path: string, ctx: ToolExecutionContext): boolean {
  try {
    assertUserVaultPath(ctx.app, path)
  } catch {
    return false
  }
  return (
    (!isHiddenPath(path) || allowedHiddenPath(path, ctx)) &&
    !isAiPrivatePath(path)
  )
}

function isHiddenPath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower === '.verbex' || lower.startsWith('.verbex/')
}

export function resolveMutationTarget(
  path: string,
  ctx: ToolExecutionContext,
  extensions: readonly string[],
): MutationTarget {
  const normalized = normalizeVaultPathKey(assertUserVaultPath(ctx.app, path))
  if (exactFile(normalized, ctx, extensions))
    return { kind: 'exact', path: normalized }

  const lower = normalized.toLowerCase()
  const priorityFolder = ctx.getPriorityFolder().trim()
  const relative = priorityFolder
    ? normalizeVaultPathKey(`${priorityFolder}/${normalized}`).toLowerCase()
    : null
  const basename = lower.includes('/')
    ? null
    : lower.includes('.')
      ? lower
      : `${lower}.md`
  const candidates = new Set<string>()
  for (const file of ctx.app.vault.getFiles?.() ??
    ctx.app.vault.getMarkdownFiles?.() ??
    []) {
    if (!extensions.includes(file.extension)) continue
    const actual = file.path.toLowerCase()
    const matches =
      actual === lower ||
      actual.endsWith(`/${lower}`) ||
      actual === relative ||
      actual.slice(actual.lastIndexOf('/') + 1) === basename
    if (matches && visibleCandidate(file.path, ctx)) candidates.add(file.path)
  }
  const paths = [...candidates].sort()
  if (!paths.length) return { kind: 'missing' }
  if (paths.length === 1) return { kind: 'redirect', candidates: [paths[0]] }
  return {
    kind: 'ambiguous',
    candidates: paths.slice(0, 5),
    remaining: Math.max(0, paths.length - 5),
  }
}

function candidateMessage(
  path: string,
  target: Extract<MutationTarget, { kind: 'redirect' | 'ambiguous' }>,
): string {
  const paths = target.candidates
    .map((candidate) => `\`${candidate}\``)
    .join(', ')
  if (target.kind === 'redirect') {
    return L({
      ko: `\`${path}\`는 없고 ${paths}가 있습니다. 그 파일이면 path를 그 경로로 다시 부르세요.`,
      en: `\`${path}\` was not found, but ${paths} exists. If that is the intended file, call again with that exact path.`,
    })
  }
  const more = target.remaining
    ? L({
        ko: ` 외 ${target.remaining}개`,
        en: ` and ${target.remaining} more`,
      })
    : ''
  return L({
    ko: `\`${path}\`는 없고 일치하는 파일이 여러 곳에 있습니다: ${paths}${more}. 어느 파일인지 전체 경로로 다시 부르세요.`,
    en: `\`${path}\` was not found. Multiple paths match: ${paths}${more}. Call again with the exact path of the intended file.`,
  })
}

export async function readMutationTarget(
  tool: string,
  requestedPath: string,
  ctx: ToolExecutionContext,
  extensions: readonly string[],
): Promise<
  { path: string; before: string | null } | { kind: 'error'; message: string }
> {
  const path = normalizeVaultPathKey(
    assertUserVaultPath(ctx.app, requestedPath),
  )
  const hidden = isHiddenPath(path)
  if (hidden && !allowedHiddenPath(path, ctx)) {
    return { kind: 'error', message: 'Internal configuration path denied.' }
  }
  const target = resolveMutationTarget(path, ctx, extensions)
  if (target.kind === 'exact') {
    assertNotAiPrivate(target.path)
    const file = exactFile(target.path, ctx, extensions)
    return {
      path: target.path,
      before: file ? await ctx.app.vault.cachedRead(file) : null,
    }
  }
  // Config files can be absent from the Vault index. Check only the supplied path.
  if (
    hidden &&
    extensions.includes(path.split('.').pop()?.toLowerCase() ?? '') &&
    (await ctx.app.vault.adapter.exists(path))
  ) {
    assertNotAiPrivate(path)
    return { path, before: await ctx.app.vault.adapter.read(path) }
  }
  if (target.kind === 'missing') return { path, before: null }
  const createHint =
    tool === 'write_file'
      ? L({
          ko: ' 새 파일을 만들려면 폴더까지 적은 새 경로를 쓰세요.',
          en: ' To create a new file, use a new path that includes its folder.',
        })
      : ''
  return { kind: 'error', message: candidateMessage(path, target) + createHint }
}
