import { L } from '../../i18n/modelText'
import { assertNotAiPrivate } from '../../security/aiPrivateRefusal'
import {
  assertUserVaultPath,
  normalizeVaultPathKey,
} from '../../security/vaultPathPolicy'
import type { ToolExecutionContext, ToolResult } from '../tools/localToolCommon'
import {
  readMutationTarget,
  resolveMutationTarget,
} from '../tools/mutationTargetPath'

export type CanvasObject = Record<string, unknown>

export type CanvasRect = {
  x: number
  y: number
  width: number
  height: number
}

export type CanvasJsonFormat = {
  indent: string | number | undefined
  eol: '\r\n' | '\n'
  trailingNewline: boolean
}

export function isCanvasObject(value: unknown): value is CanvasObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function hasRect(node: CanvasObject): node is CanvasObject & CanvasRect {
  return (
    Number.isFinite(node.x) &&
    Number.isFinite(node.y) &&
    Number.isFinite(node.width) &&
    Number.isFinite(node.height)
  )
}

export function rectContains(outer: CanvasRect, inner: CanvasRect): boolean {
  return (
    outer.width >= 0 &&
    outer.height >= 0 &&
    inner.width >= 0 &&
    inner.height >= 0 &&
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function rectsOverlap(a: CanvasRect, b: CanvasRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function singleLinePreview(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxChars) return collapsed
  return `${collapsed.slice(0, maxChars)}…`
}

export function detectCanvasJsonFormat(raw: string): CanvasJsonFormat {
  const eol: '\r\n' | '\n' = raw.includes('\r\n') ? '\r\n' : '\n'
  const trailingNewline = /\r?\n$/.test(raw)
  const lines = raw.split(/\r?\n/)
  let indent: string | number | undefined
  for (let i = 1; i < lines.length; i += 1) {
    const match = /^([ \t]+)\S/.exec(lines[i])
    if (match) {
      const ws = match[1]
      indent = ws.startsWith('\t') ? '\t' : ws.length
      break
    }
  }
  return { indent, eol, trailingNewline }
}

export function serializeCanvasJson(
  doc: unknown,
  format: CanvasJsonFormat,
): string {
  let out = JSON.stringify(doc, null, format.indent)
  if (format.eol === '\r\n') {
    out = out.replace(/\n/g, '\r\n')
  }
  if (format.trailingNewline) {
    out += format.eol
  }
  return out
}

function redirectGuidance(path: string, candidate: string): string {
  return L({
    ko: `\`${path}\`는 없고 \`${candidate}\`가 있습니다. 그 파일이면 path를 그 경로로 다시 부르세요.`,
    en: `\`${path}\` was not found, but \`${candidate}\` exists. If that is the intended file, call again with that exact path.`,
  })
}

function ambiguousGuidance(
  path: string,
  candidates: readonly string[],
  remaining: number,
): string {
  const paths = candidates.map((c) => `\`${c}\``).join(', ')
  const more = remaining
    ? L({ ko: ` 외 ${remaining}개`, en: ` and ${remaining} more` })
    : ''
  return L({
    ko: `\`${path}\`는 없고 일치하는 파일이 여러 곳에 있습니다: ${paths}${more}. 어느 파일인지 전체 경로로 다시 부르세요.`,
    en: `\`${path}\` was not found. Multiple paths match: ${paths}${more}. Call again with the exact path of the intended file.`,
  })
}

export async function readCanvasTarget(
  tool: string,
  requestedPath: string | null,
  ctx: ToolExecutionContext,
): Promise<
  { path: string; before: string } | Extract<ToolResult, { kind: 'error' }>
> {
  const trimmed = requestedPath?.trim() ?? ''
  if (!trimmed) {
    return {
      kind: 'error',
      message: L({
        ko: `${tool}은(는) path 인자가 필요합니다.`,
        en: `${tool} requires "path".`,
      }),
    }
  }

  let valid: string
  try {
    valid = assertUserVaultPath(ctx.app, trimmed)
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
  const normalized = normalizeVaultPathKey(valid)
  assertNotAiPrivate(normalized)

  if (!normalized.toLowerCase().endsWith('.canvas')) {
    const leaf = normalized.split('/').pop() ?? normalized
    if (!leaf.includes('.')) {
      const candidate = resolveMutationTarget(`${normalized}.canvas`, ctx, [
        'canvas',
      ])
      if (candidate.kind === 'exact') {
        return {
          kind: 'error',
          message: redirectGuidance(normalized, candidate.path),
        }
      }
      if (candidate.kind === 'redirect') {
        return {
          kind: 'error',
          message: redirectGuidance(normalized, candidate.candidates[0]),
        }
      }
      if (candidate.kind === 'ambiguous') {
        return {
          kind: 'error',
          message: ambiguousGuidance(
            normalized,
            candidate.candidates,
            candidate.remaining,
          ),
        }
      }
    }
    return {
      kind: 'error',
      message: L({
        ko: `${tool}은(는) .canvas 파일만 지원합니다: ${normalized}`,
        en: `${tool} supports only .canvas files: ${normalized}`,
      }),
    }
  }

  const target = await readMutationTarget(tool, normalized, ctx, ['canvas'])
  if ('kind' in target) return target
  if (target.before === null) {
    return {
      kind: 'error',
      message: L({
        ko: `캔버스 파일을 찾지 못했습니다: ${target.path}`,
        en: `Canvas file not found: ${target.path}`,
      }),
    }
  }
  return { path: target.path, before: target.before }
}
