import type { App } from 'obsidian'

import { diskHash } from '../provider/interop/commitDisk'
import {
  assertUserVaultPath,
  isAllowedHiddenConfigPath,
} from '../security/vaultPathPolicy'
import type { ConfigFolders } from '../security/vaultPathPolicy'
import type { CheckpointRecord } from '../verbex/types'

import type { CheckpointManager } from './CheckpointManager'

export type TextRollbackApproval = {
  runId: string
  checkpointId: string
  paths: {
    path: string
    currentHash: string | null
    restoreHash: string | null
    changedAfterApply?: boolean
  }[]
}
export type ApproveTextRollback = (
  request: TextRollbackApproval,
) => Promise<boolean>
export class TextRollbackSkipped extends Error {
  constructor(
    readonly reason:
      | 'approval-rejected'
      | 'changed-during-approval'
      | 'in-progress',
  ) {
    super(reason)
  }
}

/** Legacy text checkpoints have no after hash. Consent covers the observed disk
 * state, not a claim that those bytes still belong to the agent. */
export async function restoreTextWithApproval(
  app: App,
  manager: CheckpointManager,
  record: CheckpointRecord,
  locked: (path: string) => boolean,
  approve: ApproveTextRollback,
  folders?: ConfigFolders,
  appliedOnly = false,
  signal?: AbortSignal,
): Promise<void> {
  const targets = new Map<string, string | null>()
  const entries = appliedOnly
    ? record.entries.filter((entry) => entry.afterHash !== undefined)
    : record.entries
  for (const entry of entries) {
    if (
      entry.snapshotRef !== null &&
      (!/^files\/\d+\.snap$/.test(entry.snapshotRef) || !entry.beforeHash)
    )
      throw new Error('Invalid text rollback snapshot.')
    const path = assertUserVaultPath(app, entry.path)
    if (
      (path.toLowerCase() === '.verbex' ||
        path.toLowerCase().startsWith('.verbex/')) &&
      (!folders || !isAllowedHiddenConfigPath(app, path, folders))
    )
      throw new Error('Internal checkpoint path denied.')
    targets.set(path, null)
  }
  for (const entry of entries) {
    const path = assertUserVaultPath(app, entry.originalPath ?? entry.path)
    if (
      (path.toLowerCase() === '.verbex' ||
        path.toLowerCase().startsWith('.verbex/')) &&
      (!folders || !isAllowedHiddenConfigPath(app, path, folders))
    )
      throw new Error('Internal checkpoint path denied.')
    if (entry.snapshotRef === null) continue
    targets.set(path, entry.beforeHash)
  }
  const ensureUnlocked = () => {
    signal?.throwIfAborted()
    if ([...targets.keys()].some(locked))
      throw new TextRollbackSkipped('in-progress')
  }
  ensureUnlocked()
  // Manager validates and holds all snapshot bytes before opening approval.
  await manager.restore(
    record.runId,
    record.id,
    async (prepared) => {
      if (JSON.stringify(prepared) !== JSON.stringify(record))
        throw new Error('Checkpoint changed before rollback approval.')
      const paths: TextRollbackApproval['paths'] = []
      for (const [path, restoreHash] of targets) {
        const currentHash = await diskHash(app, path)
        const entry = entries.find((item) => item.path === path)
        paths.push({
          path,
          restoreHash,
          currentHash,
          ...(entry?.afterHash !== undefined
            ? { changedAfterApply: currentHash !== entry.afterHash }
            : {}),
        })
      }
      ensureUnlocked()
      if (
        !(await approve(
          structuredClone({
            runId: record.runId,
            checkpointId: record.id,
            paths,
          }),
        ))
      )
        throw new TextRollbackSkipped('approval-rejected')
      for (const entry of paths)
        if ((await diskHash(app, entry.path)) !== entry.currentHash)
          throw new TextRollbackSkipped('changed-during-approval')
      ensureUnlocked()
    },
    appliedOnly,
    signal,
  )
  for (const [path, expected] of targets)
    if ((await diskHash(app, path)) !== expected)
      throw new Error(`Rollback readback mismatch: ${path}`)
  await manager.markRestored(record)
}
