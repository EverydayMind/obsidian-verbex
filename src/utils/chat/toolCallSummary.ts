import { t } from '../../i18n'
import { hasModelMarker } from '../../i18n/modelMarkers'
import {
  ToolCallRequest,
  ToolCallResponse,
  ToolCallResponseStatus,
} from '../../types/tool-call.types'

const STATUS_LABELS_KO: Record<ToolCallResponseStatus, string> = {
  [ToolCallResponseStatus.PendingApproval]: t(
    'ui.toolCallSummary.awaitingApproval',
  ),
  [ToolCallResponseStatus.Rejected]: t('ui.toolCallSummary.executionDenied'),
  [ToolCallResponseStatus.Running]: t('ui.toolCallSummary.running'),
  [ToolCallResponseStatus.Success]: t('ui.toolCallSummary.completed'),
  [ToolCallResponseStatus.Error]: t('ui.toolCallSummary.error'),
  [ToolCallResponseStatus.Aborted]: t('ui.toolCallSummary.aborted'),
}

function parseToolArgs(args?: string): Record<string, unknown> {
  if (!args) return {}
  try {
    const parsed: unknown = JSON.parse(args)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function countNonEmptyLines(text: string): number {
  return text.split('\n').filter((line: string) => line.trim()).length
}

export function summarizeToolCall(
  request: ToolCallRequest,
  response?: ToolCallResponse,
): string {
  const status = response
    ? response.status
    : ToolCallResponseStatus.PendingApproval
  const statusLabel =
    STATUS_LABELS_KO[status] ?? t('ui.toolCallSummary.pending')
  const args = parseToolArgs(request.arguments)

  const path = typeof args.path === 'string' ? args.path : null
  const folder = typeof args.folder === 'string' ? args.folder : null
  const query =
    typeof args.query === 'string'
      ? args.query
      : Array.isArray(args.keywords)
        ? args.keywords.map(String).join(' ')
        : null

  const isSuccess = status === ToolCallResponseStatus.Success
  let resultText = ''
  if (response && response.status === ToolCallResponseStatus.Success) {
    resultText = response.data.text
  }
  const lines = countNonEmptyLines(resultText)

  switch (request.name) {
    case 'read_file':
      if (isSuccess) {
        return t('ui.toolCallSummary.fileReadCompleteCharacters', {
          p0: path ?? t('ui.toolCallSummary.noPath'),
          p1: resultText.length.toLocaleString(),
        })
      }
      return t('ui.toolCallSummary.readFile', {
        p0: statusLabel,
        p1: path ?? t('ui.toolCallSummary.noPath'),
      })

    case 'read_folder': {
      if (isSuccess) {
        const header = resultText.split('\n').find((line) => line.trim()) ?? ''
        const folderName = folder ?? t('ui.toolCallSummary.noFolder')
        return hasModelMarker(header, 'folderResult')
          ? t('ui.toolCallSummary.folderReadComplete', { p0: header })
          : t('ui.toolCallSummary.folderReadCompleteItems', {
              p0: folderName,
              p1: lines,
            })
      }
      return t('ui.toolCallSummary.readFolder', {
        p0: statusLabel,
        p1: folder ?? t('ui.toolCallSummary.noFolder'),
      })
    }

    case 'list_files':
      if (isSuccess) {
        return t('ui.toolCallSummary.fileListLoadedItems', {
          p0: folder ?? t('ui.toolCallSummary.entireVault'),
          p1: lines,
        })
      }
      return t('ui.toolCallSummary.listFiles', {
        p0: statusLabel,
        p1: folder ?? t('ui.toolCallSummary.entireVault'),
      })

    case 'list_all_notes':
      if (isSuccess) {
        return t('ui.toolCallSummary.noteListLoadedItems', {
          p0: folder ?? t('ui.toolCallSummary.entireVault'),
          p1: lines,
        })
      }
      return t('ui.toolCallSummary.listNotes', {
        p0: statusLabel,
        p1: folder ?? t('ui.toolCallSummary.entireVault'),
      })

    case 'folder_tree':
      if (isSuccess) {
        return t('ui.toolCallSummary.folderTreeBuiltFolders', {
          p0: folder ?? t('ui.toolCallSummary.entireVault'),
          p1: lines,
        })
      }
      return t('ui.toolCallSummary.folderTree', {
        p0: statusLabel,
        p1: folder ?? t('ui.toolCallSummary.entireVault'),
      })

    case 'read_frontmatter':
      if (isSuccess) {
        return t('ui.toolCallSummary.frontmatterReadComplete', {
          p0: path ?? t('ui.toolCallSummary.noPath'),
        })
      }
      return t('ui.toolCallSummary.readFrontmatter', {
        p0: statusLabel,
        p1: path ?? t('ui.toolCallSummary.noPath'),
      })

    case 'parse_links':
      if (isSuccess) {
        return t('ui.toolCallSummary.linksParsedLinks', {
          p0: path ?? t('ui.toolCallSummary.noPath'),
          p1: lines,
        })
      }
      return t('ui.toolCallSummary.parseLinks', {
        p0: statusLabel,
        p1: path ?? t('ui.toolCallSummary.noPath'),
      })

    case 'search_vault':
      if (isSuccess) {
        return t('ui.toolCallSummary.vaultSearchCompleteResults', {
          p0: query ?? '',
          p1: resultText === '(no matches)' ? 0 : lines,
        })
      }
      return t('ui.toolCallSummary.vaultSearch', {
        p0: statusLabel,
        p1: query ?? '',
      })

    case 'semantic_search':
      if (isSuccess) {
        return t('ui.toolCallSummary.semanticSearchCompleteResults', {
          p0: query ?? '',
          p1: resultText === '(no semantic matches)' ? 0 : lines,
        })
      }
      return t('ui.toolCallSummary.semanticSearch', {
        p0: statusLabel,
        p1: query ?? '',
      })

    case 'vault_graph':
      if (isSuccess) {
        return t('ui.toolCallSummary.vaultGraphLoadedEdges', {
          p0: path ?? t('ui.toolCallSummary.entireVault'),
          p1: resultText === '(no resolved links)' ? 0 : lines,
        })
      }
      return t('ui.toolCallSummary.vaultGraph', {
        p0: statusLabel,
        p1: path ?? t('ui.toolCallSummary.entireVault'),
      })

    case 'context_compaction':
      if (isSuccess) {
        return t('ui.toolCallSummary.contextCompacted', { p0: resultText })
      }
      return t('ui.toolCallSummary.contextCompaction', { p0: statusLabel })

    default:
      if (isSuccess) {
        return t('ui.toolCallSummary.toolCompleteResultLines', {
          p0: request.name,
          p1: lines,
        })
      }
      return t('ui.toolCallSummary.toolExecution', {
        p0: statusLabel,
        p1: request.name,
      })
  }
}
