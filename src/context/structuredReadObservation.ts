import type { AgentToolOutcome } from '../core/llm/toolOutcome'
import type { RequestMessage } from '../types/llm/request'

export type ProviderPageVersion = {
  key: string
  version: string
  source: 'provider'
}
const outcomes = new WeakMap<AgentToolOutcome, ProviderPageVersion>()
const messages = new WeakMap<RequestMessage, ProviderPageVersion>()

export function recordProviderPageVersion(
  outcome: AgentToolOutcome,
  version: ProviderPageVersion,
): void {
  outcomes.set(outcome, version)
}
export function attachProviderPageVersion(
  outcome: AgentToolOutcome,
  message: RequestMessage,
): void {
  const version = outcomes.get(outcome)
  if (version && !outcome.privateTranscript) messages.set(message, version)
}
export function providerPageVersion(
  message: RequestMessage,
): ProviderPageVersion | undefined {
  return messages.get(message)
}
