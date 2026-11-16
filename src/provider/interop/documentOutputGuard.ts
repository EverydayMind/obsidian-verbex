import type { App } from 'obsidian'

import type {
  ProviderCheckpointRecord,
  ProviderCheckpointStore,
} from '../../checkpoint/ProviderCheckpointStore'

import { observeCommit } from './commitDisk'
import {
  type PathProblem,
  outputPathKey,
  probeOutputPath,
} from './documentOutputPath'

type Unreadable = {
  runId: string
  id: string
  reason: 'read_failed' | 'parse_failed' | 'schema_unsupported' | 'invalid_path'
}
export type OutputGuardResult =
  | { state: 'ready'; path: string }
  | { state: 'save_in_progress'; path: string }
  | { state: 'unresolved_commit'; path: string; sameConversation: boolean }
  | {
      state: 'checkpoint_records_unreadable'
      records: Unreadable[]
      listingFailed: boolean
    }
  | { state: 'output_path_unreadable'; path: string; reason: PathProblem }
  | { state: 'output_exists'; path: string; suggestedOutputPath: string }

type Input = {
  app: App
  checkpoints: Pick<ProviderCheckpointStore, 'scan'>
  vaultPath: (path: string) => string
  locks: Set<string>
  providerBusy: boolean
  conversationId: string
  path: string
}

/** An observation only; the caller must recheck immediately before the commit. */
export async function guardDocumentOutput(
  input: Input,
): Promise<OutputGuardResult> {
  const path = input.vaultPath(input.path)
  let scan: Awaited<ReturnType<ProviderCheckpointStore['scan']>>
  try {
    scan = await input.checkpoints.scan()
  } catch {
    return {
      state: 'checkpoint_records_unreadable',
      records: [],
      listingFailed: true,
    }
  }
  const invalid: Unreadable[] = []
  for (const record of scan.records) {
    try {
      for (const entry of record.entries) input.vaultPath(entry.path)
    } catch {
      invalid.push({
        runId: record.runId,
        id: record.id,
        reason: 'invalid_path',
      })
    }
  }
  if (!scan.complete || invalid.length)
    return {
      state: 'checkpoint_records_unreadable',
      records: [...scan.unreadable, ...invalid].slice(0, 5),
      listingFailed: scan.listingFailed,
    }

  const key = (value: string) => outputPathKey(input.vaultPath(value))
  async function check(
    candidate: string,
  ): Promise<Exclude<OutputGuardResult, { state: 'output_exists' }>> {
    const candidateKey = key(candidate)
    if (
      input.providerBusy ||
      [...input.locks].some((lock) => outputPathKey(lock) === candidateKey)
    )
      return { state: 'save_in_progress', path: candidate }
    for (const record of scan.records) {
      if (!['pending', 'partial', 'unknown'].includes(record.state)) continue
      const matches = record.entries
        .map((entry, index) => ({ entry, index }))
        .filter(
          ({ entry }) =>
            entry.kind === 'file' &&
            ['pending', 'unknown'].includes(entry.state) &&
            key(entry.path) === candidateKey,
        )
      if (!matches.length) continue
      const observed: ProviderCheckpointRecord = structuredClone(record)
      try {
        await observeCommit(input.app, observed)
      } catch {
        return {
          state: 'unresolved_commit',
          path: candidate,
          sameConversation: record.conversationId === input.conversationId,
        }
      }
      if (
        matches.some(
          ({ index }) => observed.entries[index]?.state === 'unknown',
        )
      )
        return {
          state: 'unresolved_commit',
          path: candidate,
          sameConversation: record.conversationId === input.conversationId,
        }
    }
    const probe = await probeOutputPath(input.app, candidate)
    if (probe.kind === 'unreadable')
      return {
        state: 'output_path_unreadable',
        path: candidate,
        reason: probe.reason,
      }
    return {
      state: 'ready',
      path: candidate,
      ...(probe.kind === 'occupied' ? { occupied: true } : {}),
    }
  }

  const result = await check(path)
  if (result.state !== 'ready' || !('occupied' in result)) return result
  const lastSlash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  const extension = dot > lastSlash ? dot : path.length
  for (let number = 2; number < 10002; number++) {
    const suggested = `${path.slice(0, extension)}-${number}${path.slice(extension)}`
    const next = await check(suggested)
    if (
      next.state === 'output_path_unreadable' ||
      next.state === 'checkpoint_records_unreadable'
    )
      return next
    if (next.state === 'ready' && !('occupied' in next))
      return { state: 'output_exists', path, suggestedOutputPath: suggested }
  }
  throw new Error('No available output name within the safety limit.')
}
