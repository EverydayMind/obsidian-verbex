import { UnsafeValueError, copyJson, readDataMember } from '../descriptorReader'
import { withTimeout } from '../discoveryWait'

import {
  type DeclaredSkillBody,
  type SkillBodyReason,
  verifySkillBody,
} from './skillBody'

export const READ_ASSET_TIMEOUT_MS = 1000
const READ_LIMITS = { maxDepth: 4, maxNodes: 16, maxBytes: 256 * 1024 }
const TIMEOUT_LABEL = 'readAsset timeout'

/** Contract codes for a Skill body that cannot be used (README section 2). */
export type SkillAssetReason =
  | SkillBodyReason
  | 'timeout'
  | 'read_error'
  | 'not_current'

export type ReadAssetOutcome =
  | { ok: true; body: string }
  | { ok: false; reason: SkillAssetReason }

export type ReadAssetRequest = {
  kind: 'skill'
  id: string
  locale: 'ko' | 'en'
}

function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new Error('readAsset aborted'))
    if (signal.aborted) return stop()
    signal.addEventListener('abort', stop, { once: true })
    work.then(
      (value) => {
        signal.removeEventListener('abort', stop)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', stop)
        reject(error instanceof Error ? error : new Error('readAsset failed'))
      },
    )
  })
}

function bodyOf(raw: unknown): unknown {
  const copy = copyJson(raw, READ_LIMITS)
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return undefined
  return (copy as { body?: unknown }).body
}

/**
 * Calls the provider's readAsset member and verifies the body against the
 * declared digest. Takes no provider lock and passes no user data: the request
 * is the Skill id and locale only. `stillCurrent` is asked right before the
 * call and again after it answers, so a replaced provider instance never
 * contributes a body.
 */
export async function readSkillBody(input: {
  receiver: object
  request: ReadAssetRequest
  declared: DeclaredSkillBody
  stillCurrent: () => boolean
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<ReadAssetOutcome> {
  if (!input.stillCurrent()) return { ok: false, reason: 'not_current' }
  let raw: unknown
  try {
    const call = readDataMember(input.receiver, 'readAsset')
    if (typeof call !== 'function') return { ok: false, reason: 'read_error' }
    raw = await abortable(
      withTimeout(
        Promise.resolve().then(() => {
          const result: unknown = Reflect.apply(call, input.receiver, [
            { ...input.request },
          ])
          return result
        }),
        input.timeoutMs ?? READ_ASSET_TIMEOUT_MS,
        TIMEOUT_LABEL,
      ),
      input.signal,
    )
  } catch (error) {
    if (error instanceof UnsafeValueError)
      return { ok: false, reason: 'read_error' }
    const timedOut = error instanceof Error && error.message === TIMEOUT_LABEL
    return { ok: false, reason: timedOut ? 'timeout' : 'read_error' }
  }
  if (!input.stillCurrent()) return { ok: false, reason: 'not_current' }
  let body: unknown
  try {
    body = bodyOf(raw)
  } catch {
    return { ok: false, reason: 'invalid_body' }
  }
  const verdict = await verifySkillBody(body, input.declared)
  if (!verdict.ok) return { ok: false, reason: verdict.reason }
  return { ok: true, body: body as string }
}
