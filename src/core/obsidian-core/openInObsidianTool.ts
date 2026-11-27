import { L } from '../../i18n/modelText'
import { assertNotAiPrivate } from '../../security/aiPrivateRefusal'
import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import { enabledCorePlugin } from '../obsidian-core/internalPlugins'
import {
  type ToolArgs,
  type ToolExecutionContext,
  type ToolResult,
  str,
} from '../tools/localToolCommon'

import { executeObsidianCommand, hasObsidianCommand } from './coreCommands'
import { corePluginLabel } from './corePluginMeta'
import { OPEN_OBSIDIAN_TARGETS, type OpenObsidianTarget } from './coreTools'
import { exactVaultFile } from './exactVaultFile'

export { OPEN_OBSIDIAN_TARGETS, type OpenObsidianTarget }

type TargetSpec = {
  corePluginId: string | null
  commandId: string | null
  needsNote: boolean
  label: () => string
}

const TARGET_SPECS: Record<OpenObsidianTarget, TargetSpec> = {
  graph: {
    corePluginId: 'graph',
    commandId: 'graph:open',
    needsNote: false,
    label: () => L({ ko: '그래프 뷰', en: 'Graph view' }),
  },
  local_graph: {
    corePluginId: 'graph',
    commandId: 'graph:open-local',
    needsNote: true,
    label: () => L({ ko: '로컬 그래프', en: 'Local graph' }),
  },
  search: {
    corePluginId: 'global-search',
    commandId: 'global-search:open',
    needsNote: false,
    label: () => L({ ko: '검색', en: 'Search' }),
  },
  backlinks: {
    corePluginId: 'backlink',
    commandId: 'backlink:open',
    needsNote: true,
    label: () => L({ ko: '백링크', en: 'Backlinks' }),
  },
  outline: {
    corePluginId: 'outline',
    commandId: 'outline:open',
    needsNote: true,
    label: () => L({ ko: '개요', en: 'Outline' }),
  },
  tags: {
    corePluginId: 'tag-pane',
    commandId: 'tag-pane:open',
    needsNote: false,
    label: () => L({ ko: '태그', en: 'Tags' }),
  },
  bookmarks: {
    corePluginId: 'bookmarks',
    commandId: 'bookmarks:open',
    needsNote: false,
    label: () => L({ ko: '북마크', en: 'Bookmarks' }),
  },
  note: {
    corePluginId: null,
    commandId: null,
    needsNote: true,
    label: () => L({ ko: '노트', en: 'Note' }),
  },
}

type GlobalSearchPlugin = {
  openGlobalSearch?: (query: string) => void | Promise<void>
}

export async function executeOpenInObsidianTool(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const rawTarget = str(args, 'target')?.trim()
  if (!rawTarget || !Object.hasOwn(TARGET_SPECS, rawTarget)) {
    return {
      kind: 'error',
      message: L({
        ko: `지원하지 않는 화면 대상입니다: ${rawTarget ?? '(없음)'}. 가능한 값: ${OPEN_OBSIDIAN_TARGETS.join(', ')}`,
        en: `Unsupported target: ${rawTarget ?? '(none)'}. Allowed targets: ${OPEN_OBSIDIAN_TARGETS.join(', ')}`,
      }),
    }
  }

  const target = rawTarget as OpenObsidianTarget
  const spec = TARGET_SPECS[target]

  let plugin: unknown = null
  if (spec.corePluginId) {
    plugin = enabledCorePlugin(ctx.app, spec.corePluginId)
    if (!plugin) {
      return {
        kind: 'error',
        retryAllowed: false,
        message: L({
          ko: `${corePluginLabel(spec.corePluginId, 'ko')} 코어 플러그인이 꺼져 있어 열 수 없습니다.`,
          en: `Cannot open because the ${corePluginLabel(spec.corePluginId, 'en')} core plugin is disabled.`,
        }),
      }
    }
  }

  const searchPlugin =
    target === 'search' ? (plugin as GlobalSearchPlugin | null) : null
  const openGlobalSearch: ((query: string) => void | Promise<void>) | null =
    typeof searchPlugin?.openGlobalSearch === 'function'
      ? (query: string) => searchPlugin.openGlobalSearch?.(query)
      : null
  if (
    spec.commandId &&
    !openGlobalSearch &&
    !hasObsidianCommand(ctx.app, spec.commandId)
  ) {
    return {
      kind: 'error',
      retryAllowed: false,
      message: L({
        ko: `Obsidian 명령(${spec.commandId})을 찾을 수 없어 열 수 없습니다.`,
        en: `Cannot open because Obsidian command '${spec.commandId}' is unavailable.`,
      }),
    }
  }

  let openedNotePath: string | null = null
  if (spec.needsNote) {
    const pathArg = str(args, 'path')?.trim()
    if (pathArg) {
      const valid = assertUserVaultPath(ctx.app, pathArg)
      const file = exactVaultFile(ctx.app, valid)
      if (!file) {
        return {
          kind: 'error',
          message: L({
            ko: `정확한 경로에서 노트를 찾지 못했습니다: ${pathArg}`,
            en: `Note not found at exact path: ${pathArg}`,
          }),
        }
      }
      assertNotAiPrivate(file.path)
      openedNotePath = file.path
    } else {
      const active = ctx.app.workspace?.getActiveFile?.() ?? null
      if (!active) {
        return {
          kind: 'error',
          message: L({
            ko: '열려 있는 활성 노트가 없습니다. path에 정확한 노트 경로를 지정하세요.',
            en: 'No active note is open. Specify an exact note path in "path".',
          }),
        }
      }
      assertNotAiPrivate(active.path)
      openedNotePath = active.path
    }

    if (typeof ctx.app.workspace?.openLinkText !== 'function') {
      return {
        kind: 'error',
        message: L({
          ko: 'Obsidian 작업 공간에서 노트를 열 수 없습니다.',
          en: 'Obsidian workspace cannot open notes.',
        }),
      }
    }
    await ctx.app.workspace.openLinkText(openedNotePath, '', false)
  }

  if (target === 'search' && openGlobalSearch) {
    const query = typeof args.query === 'string' ? args.query : ''
    await openGlobalSearch(query)
  } else if (spec.commandId) {
    if (!executeObsidianCommand(ctx.app, spec.commandId)) {
      return {
        kind: 'error',
        retryAllowed: false,
        message: L({
          ko: `Obsidian 명령(${spec.commandId}) 실행에 실패했습니다.`,
          en: `Failed to execute Obsidian command '${spec.commandId}'.`,
        }),
      }
    }
  }

  const label = spec.label()
  const text =
    target === 'note' && openedNotePath
      ? L({
          ko: `${label}(${openedNotePath}) 화면을 열었습니다(파일 변경 없음).`,
          en: `Opened ${label} (${openedNotePath}) view (no files modified).`,
        })
      : L({
          ko: `${label} 화면을 열었습니다(파일 변경 없음).`,
          en: `Opened ${label} view (no files modified).`,
        })
  return {
    kind: 'read',
    facts: { completeness: 'complete' },
    text,
  }
}
