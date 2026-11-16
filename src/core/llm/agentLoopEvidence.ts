import { ToolCallRequest } from '../../types/tool-call.types'
import { TOOL_REGISTRY } from '../tools/toolDefinitions'

import type { AgentLoopResult } from './agentLoop'

/** Evidence and response-text facts used by the agent loop (extracted unchanged). */
type EvidenceProgress = {
  discoveredPaths: Map<string, string>
  /** Normalized key -> path as the tool reported it (original casing). */
  inspectedPaths: Map<string, string>
  latestDiscoveryPaths: Set<string>
}

export function mutationTargetKey(call: ToolCallRequest): string {
  if (!call.arguments) return `${call.name}:${call.id}`
  try {
    const parsed = JSON.parse(call.arguments) as Record<string, unknown>
    const target =
      call.name === 'extract_to_file'
        ? parsed.new_path
        : call.name === 'rename_file' || call.name === 'move_file'
          ? (parsed.new_path ?? parsed.path)
          : parsed.path
    return typeof target === 'string' && target.trim()
      ? `${call.name}:${normalizeEvidencePath(target)}`
      : `${call.name}:${call.id}`
  } catch {
    return `${call.name}:${call.id}`
  }
}

export function emptyEvidenceProgress(): EvidenceProgress {
  return {
    discoveredPaths: new Map(),
    inspectedPaths: new Map(),
    latestDiscoveryPaths: new Set(),
  }
}

export function evidenceLedger(
  progress: EvidenceProgress,
): AgentLoopResult['evidence'] {
  return {
    discoveredPaths: [...progress.discoveredPaths.values()],
    inspectedPaths: [...progress.inspectedPaths].map(
      ([normalized, path]) => progress.discoveredPaths.get(normalized) ?? path,
    ),
  }
}

export function normalizeEvidencePath(path: string): string {
  return path.trim().replace(/\\/g, '/').toLowerCase()
}

function toolPath(call: ToolCallRequest): string | null {
  if (!call.arguments) return null
  try {
    const parsed = JSON.parse(call.arguments) as Record<string, unknown>
    return typeof parsed.path === 'string' && parsed.path.trim()
      ? parsed.path.trim()
      : null
  } catch {
    return null
  }
}

/**
 * Ranked discovery tools return one candidate per line with the vault path in
 * the first tab-separated field (optionally prefixed by "1. "). Keep parsing
 * deliberately narrow so snippets containing incidental `.md` text never
 * become completion requirements.
 */
function discoveredMarkdownPaths(toolName: string, result: string): string[] {
  if (TOOL_REGISTRY[toolName]?.evidenceRole !== 'discovery') return []
  const paths: string[] = []
  for (const line of result.split('\n')) {
    const candidate = (line.split('\t')[0] ?? '')
      .trim()
      .replace(/^\d+\.\s+/, '')
    if (!candidate.toLowerCase().endsWith('.md')) continue
    paths.push(candidate)
  }
  return paths
}

export function recordEvidenceProgress(
  progress: EvidenceProgress,
  call: ToolCallRequest,
  result: string,
): void {
  if (TOOL_REGISTRY[call.name]?.evidenceRole === 'discovery') {
    const discovered = discoveredMarkdownPaths(call.name, result)
    progress.latestDiscoveryPaths = new Set(
      discovered.map(normalizeEvidencePath),
    )
    for (const path of discovered) {
      progress.discoveredPaths.set(normalizeEvidencePath(path), path)
    }
  }

  if (TOOL_REGISTRY[call.name]?.evidenceRole === 'reading') {
    if (call.name === 'read_files') {
      for (const match of result.matchAll(
        /^<!-- verbex-read-file:(.+\.md) -->$/gim,
      )) {
        progress.inspectedPaths.set(normalizeEvidencePath(match[1]), match[1])
      }
      return
    }
    const path = toolPath(call)
    if (!path) return
    progress.inspectedPaths.set(normalizeEvidencePath(path), path)
  }
}

export function claimsMutationSuccess(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()
  if (
    /(?:않|못|실패|거부|취소|미적용|적용되지)|\b(?:not|failed|rejected|cancelled|canceled|denied|unable|couldn[’']t|cannot|can[’']t)\b/.test(
      normalized,
    )
  ) {
    return false
  }
  return (
    /(?:추가|수정|변경|편집|갱신|업데이트|반영|저장|작성|생성|삭제|이동).{0,20}(?:했|완료|되었습니다|됐|적용됨)/.test(
      normalized,
    ) ||
    /\b(?:updated|edited|modified|appended|applied|saved|created|written|deleted|moved)\b/.test(
      normalized,
    )
  )
}

export function reportsMutationFailure(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()
  return /(?:거부|취소|실패|미적용|수정되지|변경되지|편집되지|바뀌지|적용되지|적용하지|수정하지|변경하지|편집하지|저장하지)|\b(?:rejected|cancelled|canceled|failed(?: to)?|could not|couldn[’']t|(?:was |were |am |is )?unable to|cannot|can[’']t|not applied|not changed|not saved|not updated|unchanged|denied)\b/.test(
    normalized,
  )
}

/**
 * Some local models mention a tool in prose, or emit a JSON-looking block, but
 * still return `tool_calls: []`. If the prose claims a read/tool already
 * happened, the next turn must be corrective: otherwise the chat can persist a
 * fabricated tool result in history and keep repeating it.
 */
export function looksLikeNoToolExecutionClaim(
  text: string,
  availableToolNames: readonly string[],
): boolean {
  // Chat-only mode intentionally exposes no tools. Do not require an
  // impossible native tool call merely because the prose mentions a tool.
  if (availableToolNames.length === 0) return false
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!normalized) {
    return false
  }

  const mentionsTool =
    /`?(read_frontmatter|find_by_property|read_file|note_outline|read_note_lines|read_note_section|search_vault|obsidian_query|note_context)`?/.test(
      normalized,
    ) ||
    normalized.includes('도구') ||
    /\btools?\b/.test(normalized) ||
    availableToolNames.some((name) => normalized.includes(name.toLowerCase()))
  const claimsExecution =
    /사용하여|사용해서|사용하겠습니다|호출하여|호출해서|호출하겠습니다|실행하여|실행해서|실행하겠습니다|읽었습니다|확인했습니다|조회했습니다|검색했습니다|찾았습니다|목록화했습니다|읽겠습니다|확인하겠습니다|조회하겠습니다|검색하겠습니다|분석하겠습니다|검토하겠습니다/.test(
      normalized,
    ) ||
    /used|called|executed|read|checked|queried|searched|found|will read|will check|will inspect|will analyze|will review|going to read|going to check/.test(
      normalized,
    ) ||
    /\b(?:invoked|ran|updated|applied|saved|created|edited|modified)\b/.test(
      normalized,
    )
  const imitatesToolCall =
    normalized.includes('tool_name') ||
    (normalized.includes('tool_call') && normalized.includes('```json'))
  return mentionsTool && (claimsExecution || imitatesToolCall)
}

export function findSingleMentionedToolName(
  text: string,
  availableToolNames: readonly string[],
): string | undefined {
  const normalized = text.toLowerCase()
  const mentioned = availableToolNames.filter((name) =>
    normalized.includes(name.toLowerCase()),
  )
  return mentioned.length === 1 ? mentioned[0] : undefined
}
