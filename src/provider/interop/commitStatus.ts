import type { ProviderCheckpointRecord } from '../../checkpoint/ProviderCheckpointStore'
import { t } from '../../i18n'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'

import { observeCommit } from './commitDisk'
import type { CommitRuntime } from './commitPrepare'
import { parseReceipt } from './commitProtocol'
import type { ProviderHandle } from './discovery'
import type { HostContext } from './editorActions'
import type { Caller } from './protocol'
import { callProvider } from './providerCall'

/** Display facts only. A saved card never carries authority to execute a write. */
export type CommitFact = {
  runId: string
  checkpointId: string
  providerId: string
  destination: string
  state: ProviderCheckpointRecord['state']
  entries: {
    path: string
    state: ProviderCheckpointRecord['entries'][number]['state']
  }[]
  needsAttention: boolean
  running?: boolean
  note?: string
  /** Vault path of the template a new document was created from; live result only. */
  template?: string
}

type Binding = {
  handle: ProviderHandle
  digest: string
  generation: number
  caller: Caller
}
const bindings = new WeakMap<CommitRuntime, Map<string, Binding>>()

/** Exact process-local provider identity. After a restart, inspect disk only. */
export function bindCommitStatus(
  runtime: CommitRuntime,
  id: string,
  value: Binding,
): void {
  let records = bindings.get(runtime)
  if (!records) bindings.set(runtime, (records = new Map<string, Binding>()))
  records.set(id, value)
  const oldest = [...records.keys()][0]
  if (records.size > 256 && oldest) records.delete(oldest)
}

export function commitFact(
  record: ProviderCheckpointRecord,
  needsAttention = false,
  template?: string,
): CommitFact {
  return {
    runId: record.runId,
    checkpointId: record.id,
    providerId: record.providerId,
    destination: record.destination,
    state: record.state,
    entries: record.entries.map(({ path, state }) => ({ path, state })),
    needsAttention:
      needsAttention ||
      !!record.unexpectedChanges ||
      ['pending', 'partial', 'unknown'].includes(record.state),
    ...(template ? { template } : {}),
  }
}

/** Human-only passive status query; never replays prepare/execute or resumes a run. */
export async function checkCommitStatus(
  host: HostContext,
  runtime: CommitRuntime | undefined,
  reference: Pick<CommitFact, 'runId' | 'checkpointId'>,
  conversationId: string,
): Promise<CommitFact> {
  if (!runtime) throw new Error(t('commitStatusR7.unavailable'))
  for (const id of [reference.runId, reference.checkpointId])
    if (
      typeof id !== 'string' ||
      !/^[\w.:-]{1,256}$/.test(id) ||
      id.includes('..')
    )
      throw new Error(t('commitStatusR7.invalidId'))
  const record = await runtime.checkpoints.read(
    reference.runId,
    reference.checkpointId,
  )
  if (!record || record.conversationId !== conversationId)
    throw new Error(t('commitStatusR7.notFound'))
  for (const entry of record.entries)
    if (host.vaultPath(entry.path) !== entry.path)
      throw new Error(t('commitStatusR7.invalidPath'))
  // A rollback changes the disk intentionally. Never replace its original after-hash evidence.
  if (record.entries.some((entry) => entry.restore))
    return {
      ...commitFact(record, true),
      note: t('commitStatusR7.restored'),
    }
  const keys = record.entries.map((entry) => entry.path.toLowerCase())
  if (
    keys.some((key) => runtime.locks.has(key)) ||
    host.busy.has(record.providerId)
  )
    return {
      ...commitFact(record, true),
      running: true,
      note: t('commitStatusR7.running'),
    }
  keys.forEach((key) => runtime.locks.add(key))
  let note = t('commitStatusR7.diskCompared')
  try {
    const binding = bindings.get(runtime)?.get(record.id)
    await host.refresh()
    const found = host.getActiveDiscovered(record.providerId)
    if (
      binding &&
      found &&
      found.handle.provider === binding.handle.provider &&
      found.handle.commit?.status === binding.handle.commit?.status &&
      found.handle.commit?.receiver === binding.handle.commit?.receiver &&
      found.digest === binding.digest &&
      found.generation === binding.generation &&
      host.isCurrent(record.providerId) &&
      !host.busy.has(record.providerId)
    ) {
      const capability = binding.handle.commit!
      const name = `plg__${record.providerId}__commit.status`
      const args = { preparationId: record.preparationId }
      const requestId = `status:${record.id}`
      const destination = `plugin://${record.providerId}/agentinterop`
      const providerIdentity = {
        serverConfigHash: binding.digest,
        connectionGeneration: binding.generation,
        toolSchemaHash: await canonicalDigest({
          capability: 'commit.status',
          version: 1,
        }),
      }
      const permit = await issueLocalPluginCallPermit({
        name,
        args,
        runId: record.runId,
        turnId: requestId,
        ...providerIdentity,
        destination,
      })
      await assertExternalCallMatches(permit, {
        name,
        args,
        destination,
        effect: 'vaultRead',
        providerIdentity,
      })
      if (
        !host.isCurrent(record.providerId) ||
        host.busy.has(record.providerId)
      )
        throw new Error(t('commitStatusR7.pluginChanged'))
      consumeAuthorizedExecution(permit, {
        runId: record.runId,
        turnId: requestId,
      })
      try {
        const { raw } = await callProvider({
          app: host.app,
          busy: host.busy,
          providerId: record.providerId,
          timeoutMs: host.callTimeoutMs ?? 5000,
          invoke: (signal) =>
            Reflect.apply(capability.status, capability.receiver, [
              record.preparationId,
              { caller: { ...binding.caller }, requestId, signal },
            ]),
        })
        const receipt = parseReceipt(raw)
        if (
          receipt.preparationId !== record.preparationId ||
          receipt.ticketId !== record.ticketId ||
          receipt.preparationDigest !== record.preparationDigest
        )
          throw new Error(t('commitStatusR7.wrongReceipt'))
        note = t('commitStatusR7.responseReceived')
      } catch {
        note = t('commitStatusR7.responseFailed')
      }
      if (host.busy.has(record.providerId))
        return {
          ...commitFact(record, true),
          running: true,
          note: t('commitStatusR7.waiting'),
        }
    } else {
      note = t('commitStatusR7.diskOnly')
    }
    // Querying current disk state must not rewrite the original commit/rollback evidence.
    const observed = structuredClone(record)
    observed.state = await observeCommit(host.app, observed)
    return { ...commitFact(observed), note }
  } finally {
    keys.forEach((key) => runtime.locks.delete(key))
  }
}
