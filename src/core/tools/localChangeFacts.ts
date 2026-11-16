import type { ChangeOutcome } from '../../workflow/StepExecutor'
import type { AgentToolOutcome } from '../llm/toolOutcome'

export type LocalChangeFactProvider = (
  input: Readonly<{
    status: ChangeOutcome['status']
    changedPath?: string
    conversationId?: string
    observation?: import('./localChangePreparation').StructureObservation
    signal?: AbortSignal
  }>,
) => Promise<string | undefined>

export async function appendLocalChangeFacts(
  finalized: AgentToolOutcome,
  facts: LocalChangeFactProvider | undefined,
  input: Parameters<LocalChangeFactProvider>[0],
) {
  if (input.status !== 'applied' || !facts) return finalized
  try {
    const text = await facts(Object.freeze(input))
    return typeof text === 'string' && text
      ? { ...finalized, displayText: `${finalized.displayText}\n${text}` }
      : finalized
  } catch {
    return finalized
  }
}
