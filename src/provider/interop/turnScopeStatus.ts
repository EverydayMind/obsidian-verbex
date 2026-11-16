import { L } from '../../i18n/modelText'

import { withTimeout } from './discoveryLifecycle'

export type ScopeCaptureStatus =
  | 'captured'
  | 'no_active_file'
  | 'companion'
  | 'no_candidate'
  | 'no_match'
  | 'multiple_matches'
  | 'timeout'
  | 'busy'
  | 'error'
  | 'aborted'
export type ScopeCaptureFailure = 'busy' | 'timeout' | 'error'

export function reportScopeStatus(
  callback: ((status: ScopeCaptureStatus) => void) | undefined,
  status: ScopeCaptureStatus,
): void {
  try {
    callback?.(status)
  } catch {
    /* diagnostic only */
  }
}

export function finalScopeStatus(
  aborted: boolean,
  failures: ReadonlySet<ScopeCaptureFailure>,
  matches: number,
): ScopeCaptureStatus {
  if (aborted) return 'aborted'
  if (failures.has('timeout')) return 'timeout'
  if (failures.has('error')) return 'error'
  if (failures.has('busy')) return 'busy'
  return matches > 1
    ? 'multiple_matches'
    : matches === 1
      ? 'captured'
      : 'no_match'
}

/** Distinguish a host deadline from a provider rejection without inspecting error text. */
export async function waitForScopeCapture(
  actual: Promise<unknown>,
  timeoutMs: number,
  onFailure?: (reason: ScopeCaptureFailure) => void,
): Promise<unknown> {
  const wrapped = actual.then(
    (value) => ({ ok: true as const, value }),
    () => ({ ok: false as const }),
  )
  const result = await withTimeout(
    wrapped,
    timeoutMs,
    L({ ko: '편집기 문맥 시간 초과', en: `Editor context timed out` }),
  ).catch((error: unknown) => {
    onFailure?.('timeout')
    throw error
  })
  if (!result.ok) {
    onFailure?.('error')
    throw new Error(
      L({
        ko: '편집기 문맥 수집 실패',
        en: `Editor context collection failed`,
      }),
    )
  }
  return result.value
}
