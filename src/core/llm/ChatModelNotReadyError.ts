import { ChatModelReadiness } from './modelReadiness'

/**
 * Thrown when a run's resolved chat model fails selection readiness (unset,
 * stale, disabled, or its provider was removed) before any provider API call
 * is made. Distinct from `LLMModelNotFoundException` (thrown deep inside
 * `getChatModelClient`) so the pre-flight check in `AgentRunCoordinator.run()`
 * fails with a status the UI can turn into a specific "add/re-enable/re-add
 * a model" instruction (see formatAgentErrorForUser.ts) instead of a raw
 * "not found" string.
 */
export class ChatModelNotReadyError extends Error {
  constructor(readonly readiness: ChatModelReadiness) {
    super(`Chat model is not ready to run (${readiness.status}).`)
    this.name = 'ChatModelNotReadyError'
  }
}
