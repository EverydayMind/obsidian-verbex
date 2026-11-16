export { turnScopeNote } from './turnScopeNote'
import { normalizePath } from 'obsidian'
import { z } from 'zod'

import { consumeAuthorizedExecution } from '../../security/promptInjectionBoundary'

import { issueCapturePermit } from './capturePermit'
import { copyJson, deepFreeze } from './descriptorReader'
import {
  Caller,
  NATIVE_TOOL_PREFIX,
  TargetContext,
  TurnScope,
} from './protocol'
import {
  type ScopeCaptureStatus,
  finalScopeStatus,
  reportScopeStatus,
  waitForScopeCapture,
} from './turnScopeStatus'
export type { ScopeCaptureStatus } from './turnScopeStatus'
export { editorCandidate } from './editorCandidate'

export const CAPTURE_TIMEOUT_MS = 2000
const SCOPE_LIMITS = { maxDepth: 6, maxNodes: 2000, maxBytes: 256 * 1024 }
const token = z.string().min(1).max(256)
const scopeSchema: z.ZodType<TurnScope> = z
  .object({
    providerId: token,
    path: z.string().min(1).max(4096),
    sessionId: token,
    incarnation: token,
    documentEpoch: token,
    revision: z.number().int().nonnegative(),
    contextId: token,
    capturedAt: z.string().min(1).max(64),
    selection: z
      .object({
        selectionId: token,
        handles: z.array(token).max(512),
        text: z.string().max(20_000),
      })
      .strict()
      .optional(),
  })
  .strict()

/** The scope the host fixed for one submitted turn, with the provider object it came from. */
export type NativeTurnScope = Readonly<{
  providerId: string
  generation: number
  scope: Readonly<TurnScope>
}>

export type EditorCandidate = {
  providerId: string
  generation: number
  digest: string
  resourceTypes: readonly string[]
  busy: () => boolean
  receiver: object
  capture: (ctx: TargetContext) => unknown
}

const extension = (path: string): string => {
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot).toLowerCase()
}

// A capture that never settles is not called again while it is pending.
const pending = new WeakSet()
// A resumed run may capture again for the same submitted turn.
let captures = 0

async function capture(
  candidate: EditorCandidate,
  caller: Caller,
  signal: AbortSignal | undefined,
  timeoutMs: number,
  vaultPath: (path: string) => string,
  onUncertain?: () => void,
  onFailure?: (reason: 'busy' | 'timeout' | 'error') => void,
): Promise<NativeTurnScope | undefined> {
  if (candidate.busy() || pending.has(candidate.receiver)) {
    onFailure?.('busy')
    onUncertain?.()
    return undefined
  }
  const name = `${NATIVE_TOOL_PREFIX}${candidate.providerId}__editor.capture`
  const destination = `plugin://${candidate.providerId}/agentinterop`
  const requestId = `${caller.turnId}:capture:${++captures}`
  const execution = await issueCapturePermit(
    candidate,
    caller,
    requestId,
    name,
    destination,
  )
  if (signal?.aborted || candidate.busy()) {
    if (!signal?.aborted) onFailure?.('busy')
    onUncertain?.()
    return undefined
  }
  consumeAuthorizedExecution(execution, {
    runId: caller.runId,
    turnId: requestId,
  })
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  pending.add(candidate.receiver)
  const actual = Promise.resolve()
    .then(() =>
      Reflect.apply(candidate.capture, candidate.receiver, [
        { caller: { ...caller }, requestId, signal: controller.signal },
      ]),
    )
    .finally(() => pending.delete(candidate.receiver))
  try {
    const raw = await waitForScopeCapture(actual, timeoutMs, onFailure)
    if (raw === null || raw === undefined || signal?.aborted) return undefined
    const scope = scopeSchema.parse(copyJson(raw, SCOPE_LIMITS))
    if (scope.providerId !== candidate.providerId) {
      onFailure?.('error')
      onUncertain?.()
      return undefined
    }
    return Object.freeze({
      providerId: candidate.providerId,
      generation: candidate.generation,
      scope: deepFreeze({ ...scope, path: vaultPath(scope.path) }),
    })
  } finally {
    signal?.removeEventListener('abort', abort)
    actual.catch(() => {})
  }
}

/**
 * Fixes the editor context of a submitted turn. Arbitration, in order:
 * a companion view that sent its own scope wins and no provider is asked;
 * otherwise only a provider scope for the host's active file is accepted;
 * otherwise there is no scope. A provider that fails, times out or answers
 * for another document simply contributes nothing.
 */
export async function captureTurnScope(
  candidates: readonly EditorCandidate[],
  input: {
    caller: Caller
    currentFilePath?: string
    companionScope?: boolean
    signal?: AbortSignal
    timeoutMs?: number
    vaultPath?: (path: string) => string
    onUncertain?: () => void
    onStatus?: (status: ScopeCaptureStatus) => void
  },
): Promise<NativeTurnScope | undefined> {
  const report = (status: ScopeCaptureStatus) =>
    reportScopeStatus(input.onStatus, status)
  const path = input.currentFilePath
  if (input.companionScope || !path || input.signal?.aborted) {
    report(
      input.signal?.aborted
        ? 'aborted'
        : input.companionScope
          ? 'companion'
          : 'no_active_file',
    )
    return undefined
  }
  const type = extension(path)
  const eligible = candidates.filter(
    (candidate) =>
      !candidate.resourceTypes.length || candidate.resourceTypes.includes(type),
  )
  if (!eligible.length) {
    report('no_candidate')
    return undefined
  }
  const caller = { ...input.caller }
  const failures = new Set<'busy' | 'timeout' | 'error'>()
  const found = await Promise.all(
    eligible.map((candidate) =>
      capture(
        candidate,
        caller,
        input.signal,
        input.timeoutMs ?? CAPTURE_TIMEOUT_MS,
        input.vaultPath ?? ((value) => value),
        input.onUncertain,
        (reason) => failures.add(reason),
      ).catch(() => {
        if (!failures.has('timeout')) failures.add('error')
        input.onUncertain?.()
        return undefined
      }),
    ),
  )
  const normalize = (value: string) =>
    normalizePath(value.replace(/\\/g, '/').replace(/^(?:\.\/)+/, ''))
  const matching = found.filter(
    (item) => item && normalize(item.scope.path) === normalize(path),
  )
  report(finalScopeStatus(!!input.signal?.aborted, failures, matching.length))
  // Two providers claiming the same document cannot be told apart here.
  return matching.length === 1 ? matching[0] : undefined
}

/** The scope to hand back to the provider that produced it, and to no other. */
export function turnScopeFor(
  scope: NativeTurnScope | undefined,
  providerId: string,
  generation: number,
): TurnScope | undefined {
  return scope?.providerId === providerId && scope.generation === generation
    ? scope.scope
    : undefined
}

/** Keep the host's submitted scope private from a provider. */
export function copyTurnScope(
  scope: TurnScope | undefined,
): TurnScope | undefined {
  return scope ? (copyJson(scope, SCOPE_LIMITS) as TurnScope) : undefined
}

/**
 * Model-visible metadata of the scope: which document, whether something was
 * selected and how much. The selected text is not included; the model reads
 * it through the provider's tool, inside the tool disclosure boundary.
 */
