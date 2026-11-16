import type { AgentToolOutcome } from '../core/llm/toolOutcome'
import { L } from '../i18n/modelText'
import type { CommitFact } from '../provider/interop/commitStatus'

export type TurnCommitFact = Pick<
  CommitFact,
  'destination' | 'checkpointId' | 'state'
> & {
  entries: CommitFact['entries']
  omittedEntries: number
}

/** Copy only host disk facts; never infer output paths from input arguments. */
export function commitTurnFacts(outcome: AgentToolOutcome) {
  const fact = outcome.privateTranscript ? undefined : outcome.commit
  if (!fact) return undefined
  return {
    destination: fact.destination,
    checkpointId: fact.checkpointId,
    state: fact.state,
    entries: fact.entries
      .slice(0, 200)
      .map(({ path, state }) => ({ path, state })),
    omittedEntries: Math.max(0, fact.entries.length - 200),
  } satisfies TurnCommitFact
}

export function commitWrites(tool: string, fact: TurnCommitFact) {
  return fact.entries.flatMap(({ path, state }) =>
    state === 'written'
      ? [{ tool, path, mutation: 'applied' }]
      : state === 'unknown' || state === 'pending'
        ? [{ tool, path, mutation: 'unknown' }]
        : [],
  )
}

export function commitContinuationFacts(
  calls: readonly { commit?: TurnCommitFact }[],
): string[] {
  return calls.flatMap(({ commit }) =>
    commit
      ? [
          L({
            ko: `직전 저장: ${commit.destination} / ${commit.state}${commit.omittedEntries ? ` (항목 ${commit.omittedEntries}개 미기록)` : ''}`,
            en: `Previous save: ${commit.destination} / ${commit.state}${commit.omittedEntries ? ` (${commit.omittedEntries} entries not recorded)` : ''}`,
          }),
        ]
      : [],
  )
}
