import { toolSucceeded } from '../../core/llm/toolOutcome'

import type { CommitPreparation } from './commitProtocol'
import { type OutputGuardResult } from './documentOutputGuard'
import { HostCommitNotStarted } from './hostInternalCommitTypes'
import type { JsonObject } from './protocol'

export const observedDocumentJob = (fact: JsonObject) =>
  toolSucceeded(JSON.stringify(fact), {
    mutationScope: 'none',
    readFacts: { completeness: 'complete' },
  })

/** Guard facts are observations, never an authorization to overwrite. */
export function guardFact(
  guard: Exclude<OutputGuardResult, { state: 'ready' }>,
): JsonObject {
  if (guard.state === 'output_exists')
    return {
      state: guard.state,
      output_exists: {
        path: guard.path,
        suggestedOutputPath: guard.suggestedOutputPath,
      },
    }
  if (guard.state === 'checkpoint_records_unreadable')
    return {
      state: guard.state,
      records: guard.records,
      listingFailed: guard.listingFailed,
    }
  if (guard.state === 'unresolved_commit')
    return {
      state: guard.state,
      path: guard.path,
      sameConversation: guard.sameConversation,
    }
  if (guard.state === 'output_path_unreadable')
    return { state: guard.state, path: guard.path, reason: guard.reason }
  return { state: guard.state, path: guard.path }
}

export class DocumentOutputBlocked extends Error {
  constructor(readonly fact: JsonObject) {
    super('Document output is no longer safe to create.')
  }
}

/** Derived exports must be one new HWPX file; provider claims cannot broaden the write. */
export function assertNewDerivedOutput(
  preparation: CommitPreparation,
  path: string,
): void {
  const files = preparation.writeSet.filter((entry) => entry.kind === 'file')
  if (
    preparation.mode !== 'create' ||
    preparation.destination !== path ||
    files.length !== 1 ||
    files[0].kind !== 'file' ||
    files[0].path !== path ||
    files[0].op !== 'create' ||
    files[0].role !== 'primary' ||
    files[0].sha256Before !== null ||
    preparation.writeSet.some(
      (entry) => entry.kind === 'folder' && !path.startsWith(`${entry.path}/`),
    )
  )
    throw new HostCommitNotStarted('invalid_write_set')
}
