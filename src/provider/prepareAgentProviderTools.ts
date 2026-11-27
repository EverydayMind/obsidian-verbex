import type { AgentExecutionPorts } from '../agentExecutionPorts'
import { splitAgentHistory } from '../context/agentSourcePolicy'
import { isBareContinuation } from '../context/bareContinuation'
import { RunArtifactStore } from '../runstate/RunArtifactStore'

import { prepareProviderTools } from './prepareProviderTools'

/** Read the persisted turn facts before provider preparation; never infer a turn ID. */
export async function prepareAgentProviderTools(
  ports: Pick<AgentExecutionPorts, 'runs' | 'providerRegistry'> &
    Partial<Pick<AgentExecutionPorts, 'readNoteText'>>,
  input: Parameters<typeof prepareProviderTools>[1],
  simple: boolean,
  toolsEnabled: boolean,
) {
  const { priorHistory } = splitAgentHistory(input.history ?? [], input.request)
  let previousTurnRecord
  if (
    toolsEnabled &&
    input.previousSubmittedTurnId &&
    isBareContinuation({ ...input, isFirstTurn: !priorHistory.length })
  ) {
    const run = await ports.runs.loadRunForUpdate(input.runId, input.request)
    previousTurnRecord = RunArtifactStore.getTurnLedger(run).records.at(-1)
  }
  return prepareProviderTools(
    ports.providerRegistry,
    { ...input, previousTurnRecord, readNoteText: ports.readNoteText },
    simple,
    toolsEnabled,
  )
}
