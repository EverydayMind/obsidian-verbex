import { ProviderCallInterrupted } from './providerCallError'

export const HOST_READ_CAUSES = [
  'tool_unavailable',
  'provider_not_current',
  'busy',
  'cancelled',
  'replaced',
  'timeout',
  'invalid_response',
  'stale',
  'vault_changed',
] as const
export type HostReadCause = (typeof HOST_READ_CAUSES)[number]

export class HostReadFailure extends Error {
  constructor(
    public readCause: HostReadCause,
    message?: string,
  ) {
    super(message ?? `Host read unavailable: ${readCause}`)
  }
}

class HostReadInterrupted extends ProviderCallInterrupted {
  constructor(
    error: ProviderCallInterrupted,
    readonly readCause: HostReadCause,
  ) {
    super(error.message, error.reason)
  }
}

/** Select codes only; provider error/display prose is never classified. */
export function hostReadCause(error: unknown): HostReadCause {
  if (error instanceof HostReadFailure || error instanceof HostReadInterrupted)
    return error.readCause
  if (error instanceof ProviderCallInterrupted) return error.reason
  return 'invalid_response'
}

export function assertHostReadState(
  conditions: Partial<Record<HostReadCause, boolean>>,
): void {
  const cause = HOST_READ_CAUSES.find((cause) => conditions[cause])
  if (cause) throw new HostReadFailure(cause)
}

/** Preserve existing structured error instances after selecting all current conditions. */
export function rethrowHostReadFailure(
  error: unknown,
  check: (error: unknown) => void,
): never {
  try {
    check(error)
  } catch (selected) {
    if (selected instanceof HostReadFailure) {
      if (error instanceof HostReadFailure) {
        error.readCause = selected.readCause
        throw error
      }
      if (error instanceof ProviderCallInterrupted)
        throw new HostReadInterrupted(error, selected.readCause)
    }
    throw selected
  }
  throw new HostReadFailure(hostReadCause(error))
}
