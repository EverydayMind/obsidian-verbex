import { type AgentToolOutcome, toolFailed } from '../../core/llm/toolOutcome'
import { modelMarker } from '../../i18n/modelMarkers'

/** A failure before provider execution cannot have changed a document. */
export function nativeExecutionFailure(
  message: string,
  retryable = false,
): AgentToolOutcome {
  return toolFailed(`${modelMarker('toolError')} ${message})`, {
    terminal: false,
    retry: { allowed: retryable },
    mutationScope: 'none',
  })
}
