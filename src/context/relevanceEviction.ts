import { normalizePath } from 'obsidian'

import { protectedResponsesStart } from '../core/llm/responsesReplay'
import {
  ToolMetadataSource,
  resolveToolMetadata,
} from '../core/tools/toolMetadata'
import {
  MODEL_MARKERS,
  hasModelMarker,
  modelMarker,
} from '../i18n/modelMarkers'
import { L } from '../i18n/modelText'
import { type ConnectorDisclosure, RequestMessage } from '../types/llm/request'

import { compactedDisclosure } from './compaction'
import { olderStructuredPages } from './structuredReadEviction'
import { toolArgPaths } from './toolArgPaths'

/**
 * Relevance-based eviction (the LLM-judged "discard" side of context
 * management).
 *
 * The agentic loop accumulates every read result verbatim. Some of those files
 * turn out to be irrelevant to the goal once the work progresses — but unlike a
 * byte-for-byte duplicate (handled by {@link collapseRedundantToolReads}) or an
 * old turn (handled by age-based compaction), there is no mechanical signal for
 * "read once, no longer needed". The judgement is semantic, so it is delegated
 * to the model: given the goal and a manifest of previously-read files, the LLM
 * marks the ones that no longer matter and their bodies are replaced by a short
 * stub. The model can always re-read an evicted file if it was wrong.
 *
 * Conservative by construction: it only ever touches *read* results (writes are
 * never evicted), never re-stubs an already-collapsed/evicted body, and only
 * offers reads large enough to be worth reclaiming. The message objects are left
 * in place (role, tool_call id, ordering preserved) so provider
 * tool-call/tool-response pairing stays intact — only the superseded `content`
 * string is shortened.
 */

export const EVICTED_READ_STUB_PREFIX = MODEL_MARKERS.evictedRead.ko

/**
 * Counts read-tool messages in the most-recent batch only — i.e. those after
 * the last assistant message, not the entire history. Used to size
 * `recentTurnsToPin` so eviction protects the batch the agent just produced
 * without permanently pinning every read ever made (F-5).
 */
export function countRecentBatchReads(
  messages: RequestMessage[],
  source?: ToolMetadataSource,
): number {
  let count = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role === 'assistant') {
      break
    }
    if (
      message.role === 'tool' &&
      'tool_call' in message &&
      message.tool_call != null &&
      resolveToolMetadata(message.tool_call.name, source)?.category === 'read'
    ) {
      count += 1
    }
  }
  return count
}

/**
 * Fraction of `maxContextTokens` at which relevance eviction starts running.
 * Lower than the age-based compaction trigger (0.9) so we first try to reclaim
 * space by dropping irrelevant reads — targeted and lossless for everything the
 * goal still needs — before falling back to a lossy summary of older turns.
 */
export const EVICTION_TRIGGER_RATIO = 0.6

/** A previously-read file result offered to the judge as an eviction candidate. */
export type EvictionCandidate = {
  /** Stable handle the judge returns to mark this item for eviction. */
  ref: string
  /** The read tool that produced the result (e.g. `read_file`). */
  tool: string
  /** The tool-call arguments (e.g. the note path), for the judge to identify it. */
  args: string
  /** Estimated token size of the result body. */
  tokens: number
  /** Leading slice of the body, so the judge can tell what the file was about. */
  preview: string
  /** Host-only disclosure accounting for the preview, never part of the manifest. */
  disclosure?: ConnectorDisclosure
  /** Newer page with the same structured subject and a different digest exists. */
  superseded?: boolean
  /** Provider-reported input version, not verified disk state. */
  versionSource?: 'provider'
}

export function relevanceDisclosure(candidates: EvictionCandidate[]) {
  return compactedDisclosure(
    candidates.map((candidate) => ({
      role: 'tool',
      content: '',
      disclosure: candidate.disclosure,
    })),
    'context-relevance',
  )
}

export function relevanceManifest(candidates: EvictionCandidate[]): string {
  return candidates
    .map((candidate) =>
      L({
        ko: `[${candidate.ref}] ${candidate.tool}(${candidate.args}) ~${candidate.tokens} tokens${candidate.superseded ? (candidate.versionSource === 'provider' ? ' [플러그인이 동일 조건의 다른 입력 버전을 이후에 보고함]' : ' [동일 조건의 최신 버전 관측 있음]') : ''}\n  ${candidate.preview}`,
        en: `[${candidate.ref}] ${candidate.tool}(${candidate.args}) ~${candidate.tokens} tokens${candidate.superseded ? (candidate.versionSource === 'provider' ? ' [Plugin later reported another input version under the same conditions]' : ' [A newer version under the same conditions was observed]') : ''}\n  ${candidate.preview}`,
      }),
    )
    .join('\n')
}

/**
 * Decides which already-read results are no longer relevant to the goal.
 * Injected (an LLM call in production) so this module stays pure and
 * unit-testable. Returns the refs to evict; refs not in the candidate set are
 * ignored by the caller.
 */
export type EvictionJudge = (input: {
  goal: string
  candidates: EvictionCandidate[]
}) => Promise<Iterable<string>>

export type EvictIrrelevantReadsOptions = {
  toolMetadata?: ToolMetadataSource
  /** The user's task, so the judge can tell what is still needed. */
  goal: string
  countTokens: (text: string) => Promise<number>
  /**
   * Reads smaller than this are not offered as candidates: reclaiming them is
   * not worth a round trip and the stub itself costs tokens.
   */
  minTokens?: number
  /**
   * Paths that must not be evicted regardless of the judge's verdict.
   * Callers can pass any set of file paths that are known to be critical.
   */
  pinnedPaths?: Set<string>
  /**
   * Auto-pin read results from the most recent N tool messages in the
   * conversation, protecting files the agent is actively working with against
   * accidental eviction. Defaults to 3; set to 0 to disable.
   */
  recentTurnsToPin?: number
  /**
   * Tool-call ids produced by the currently-running agent loop. These results
   * must survive at least the next completion; evicting them immediately turns
   * fresh harness instructions into a re-read loop.
   */
  protectedRecentToolCallIds?: Set<string>
  /**
   * Candidate-set signature from the previous call. When the current
   * candidates produce the same signature, the judge is not re-invoked and
   * `previousDecision` is reused instead. Pass the `signature` field of the
   * previous result.
   */
  previousSignature?: string
  /**
   * The judge's decision from the previous call. Reused when the signature
   * matches. Pass the `evictedRefs` field of the previous result.
   */
  previousDecision?: ReadonlySet<string>
}

/**
 * Result returned by {@link evictIrrelevantReads}. Callers should store
 * `signature` and `evictedRefs` and pass them back on the next call as
 * `previousSignature` / `previousDecision` to enable judge memoization.
 */
export type EvictIrrelevantReadsResult = {
  messages: RequestMessage[]
  evictedCount: number
  /**
   * Opaque fingerprint of the candidate set (including the goal). Pass back
   * as `previousSignature` on the next call.
   */
  signature: string
  /**
   * The set of message-index refs the judge decided to evict this call
   * (may be empty). Pass back as `previousDecision` on the next call so the
   * decision can be reused when the candidate set has not changed.
   */
  evictedRefs: ReadonlySet<string>
}

const DEFAULT_MIN_TOKENS = 200
const PREVIEW_LENGTH = 160
/** Default number of most-recent read-tool messages whose paths are auto-pinned. */
const DEFAULT_RECENT_TURNS_TO_PIN = 3

/**
 * Stable fingerprint of the judge's input. goal is included so that if the
 * cache is ever promoted to a cross-turn scope the P2 workflow-step goal
 * change correctly invalidates stale decisions.
 */
function candidateSignature(
  goal: string,
  candidates: EvictionCandidate[],
): string {
  return JSON.stringify([goal, candidates])
}

type ToolMessage = Extract<RequestMessage, { role: 'tool' }>

/** A read-tool result whose body is still present (not already a stub). */
function isEvictableRead(
  message: RequestMessage,
  source?: ToolMetadataSource,
): message is ToolMessage {
  if (message.role !== 'tool' || message.privateTranscript) {
    return false
  }
  const call = message.tool_call
  if (!call || resolveToolMetadata(call.name, source)?.category !== 'read') {
    return false
  }
  const registry = resolveToolMetadata(call.name, source)
  if (registry?.evictable === false || registry?.evictionKind === 'directive') {
    return false
  }
  if (typeof message.content !== 'string') {
    return false
  }
  return (
    !hasModelMarker(message.content, 'evictedRead') &&
    !hasModelMarker(message.content, 'redundantRead')
  )
}

function preview(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH)
}

function stubFor(name: string, args: string): string {
  const where = args ? `${name}(${args})` : name
  return L({
    ko: `${modelMarker('evictedRead')}: 이전에 읽은 ${where} 결과가 현재 작업과 무관하다고 판단되어 본문을 제거했습니다. 다시 필요하면 같은 도구로 재요청하세요.)`,
    en: `${modelMarker('evictedRead', 'en')}: The previously read ${where} result was judged irrelevant to the current task, so its body was removed. Request it again with the same tool if needed.)`,
  })
}

/**
 * Replace the bodies of previously-read results the judge marks irrelevant with
 * a stub, keeping every message object in place. Returns the original array
 * reference unchanged when nothing was evicted, so callers can cheaply detect a
 * no-op by identity (mirrors {@link collapseRedundantToolReads}).
 */
export async function evictIrrelevantReads(
  messages: RequestMessage[],
  judge: EvictionJudge,
  opts: EvictIrrelevantReadsOptions,
): Promise<EvictIrrelevantReadsResult> {
  const minTokens = opts.minTokens ?? DEFAULT_MIN_TOKENS

  // Build the effective pinned-paths set: explicit pins + auto-pinned recent reads.
  const effectivePinned = new Set<string>(
    [...(opts.pinnedPaths ?? [])].map(normalizePath),
  )
  const recentN = opts.recentTurnsToPin ?? DEFAULT_RECENT_TURNS_TO_PIN
  if (recentN > 0) {
    let seen = 0
    for (let i = messages.length - 1; i >= 0 && seen < recentN; i--) {
      const msg = messages[i]
      if (!isEvictableRead(msg, opts.toolMetadata)) continue
      const paths = toolArgPaths(
        msg.tool_call.arguments ?? '',
        resolveToolMetadata(msg.tool_call.name, opts.toolMetadata),
      )
      paths.forEach((path) => effectivePinned.add(path))
      if (paths.length) seen++
    }
  }

  const candidates: EvictionCandidate[] = []
  const candidateRefs = new Set<string>()
  const olderPages = olderStructuredPages(messages)

  for (let index = 0; index < messages.length; index += 1) {
    if (index >= protectedResponsesStart(messages)) continue
    const message = messages[index]
    if (!isEvictableRead(message, opts.toolMetadata)) {
      continue
    }
    if (opts.protectedRecentToolCallIds?.has(message.tool_call.id)) {
      continue
    }
    const tokens = await opts.countTokens(message.content)
    if (tokens < minTokens) {
      continue
    }
    const args = message.tool_call.arguments ?? ''
    const paths = toolArgPaths(
      args,
      resolveToolMetadata(message.tool_call.name, opts.toolMetadata),
    )
    if (checkExplicitTarget(opts.goal, args, paths)) {
      continue
    }
    // Skip paths the caller has pinned or that were auto-pinned from recent reads.
    if (paths.some((path) => effectivePinned.has(path))) continue
    const ref = String(index)
    candidateRefs.add(ref)
    candidates.push({
      ref,
      ...(olderPages.has(index) ? { superseded: true } : {}),
      ...(olderPages.get(index) === 'provider'
        ? { versionSource: 'provider' as const }
        : {}),
      tool: message.tool_call.name,
      args: message.tool_call.arguments ?? '',
      tokens,
      preview: preview(message.content),
      ...(message.disclosure
        ? { disclosure: structuredClone(message.disclosure) }
        : {}),
    })
  }

  if (candidates.length === 0) {
    return {
      messages,
      evictedCount: 0,
      signature: '',
      evictedRefs: new Set<string>(),
    }
  }

  candidates.sort(
    (a, b) => Number(b.superseded === true) - Number(a.superseded === true),
  )
  const signature = candidateSignature(opts.goal, candidates)

  // F-2 memoization: reuse the previous decision when the candidate set is
  // identical to the last call. This avoids an LLM round-trip on every
  // iteration of the agent loop when no new reads have been accumulated.
  let decided: Set<string>
  if (signature === opts.previousSignature && opts.previousDecision) {
    decided = new Set(
      [...opts.previousDecision].filter((ref) => candidateRefs.has(ref)),
    ) // reuse — no LLM call
  } else {
    decided = new Set<string>()
    for (const ref of await judge({ goal: opts.goal, candidates })) {
      if (candidateRefs.has(ref)) {
        decided.add(ref)
      }
    }
  }

  if (decided.size === 0) {
    return { messages, evictedCount: 0, signature, evictedRefs: decided }
  }

  let evictedCount = 0
  const next = messages.map((message, index) => {
    if (!decided.has(String(index))) {
      return message
    }
    const call = (message as ToolMessage).tool_call
    evictedCount += 1
    return { ...message, content: stubFor(call.name, call.arguments ?? '') }
  })
  return { messages: next, evictedCount, signature, evictedRefs: decided }
}

/**
 * Parse a judge's reply (expected to be a JSON array of refs) into ref strings.
 * Tolerant: extracts the first bracketed array from surrounding prose and coerces
 * numbers to strings. Returns [] on anything unparseable, so a malformed reply
 * evicts nothing rather than guessing.
 */
export function parseEvictionRefs(text: string): string[] {
  try {
    const parsed: unknown = JSON.parse(text)
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'refs' in parsed
    ) {
      const refs = parsed.refs
      return Array.isArray(refs)
        ? refs
            .filter((ref) => typeof ref === 'string' || typeof ref === 'number')
            .map((ref) => String(ref).trim())
            .filter(Boolean)
        : []
    }
  } catch {
    /* Preserve compatibility with older array replies. */
  }
  const match = text.match(/\[[\s\S]*?\]/)
  if (!match) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(match[0])
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0)
  } catch {
    return []
  }
}

/**
 * Checks if the file path or arguments are explicitly targeted or mentioned
 * in the user's goal text.
 */
function checkExplicitTarget(
  goal: string,
  argsStr: string,
  paths: string[],
): boolean {
  if (!goal) return false

  try {
    JSON.parse(argsStr)
    for (const filePath of paths) {
      const parts = filePath.split('/')
      const filenameWithExt = parts[parts.length - 1]
      const dotIndex = filenameWithExt.lastIndexOf('.')
      const basename =
        dotIndex !== -1 ? filenameWithExt.slice(0, dotIndex) : filenameWithExt

      if (basename.length >= 2 && goal.includes(basename)) {
        return true
      }

      for (const segment of parts.slice(0, -1)) {
        if (segment.length >= 3 && goal.includes(segment)) {
          return true
        }
      }
    }
  } catch {
    if (argsStr && argsStr.length >= 2 && goal.includes(argsStr)) {
      return true
    }
  }

  return false
}
