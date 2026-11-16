import type { DiagnosticSpan, InteropDiagnostics } from './diagnostics'
import { EditorCapabilityUnavailable } from './editorCapabilityCall'
import { ProviderCallInterrupted } from './providerCallError'

/** Record only host-observed boundaries, never untrusted exception text. */
export function recordOwnershipQueryFailure(
  diagnostics: InteropDiagnostics,
  trace: DiagnosticSpan | undefined,
  providerId: string,
  category: string,
  error: unknown,
): void {
  if (category === 'invocation_failed') {
    if (error instanceof EditorCapabilityUnavailable) category = error.reason
    else if (error instanceof ProviderCallInterrupted) {
      if (error.reason === 'busy') category = 'provider_busy'
      else if (error.reason === 'timeout') category = 'timeout'
    }
  }
  if (trace)
    trace.mark('provider.failed', { providerId, failureCategory: category })
  else
    diagnostics
      .begin('ownership.query', { providerId })
      .finish('failed', { failureCategory: category })
}
