import type { ProviderCheckpointRecord } from '../../checkpoint/ProviderCheckpointStore'
import {
  type AgentToolOutcome,
  toolFailed,
  toolSucceeded,
} from '../../core/llm/toolOutcome'
import type { ModelLocale } from '../../i18n/modelLocale'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueProviderCommitPermit,
} from '../../security/promptInjectionBoundary'

import { commitAudit } from './commitAudit'
import { observeCommit, readDiskBytes } from './commitDisk'
import * as wording from './commitExecutionText'
import {
  COMMIT_CALL_TIMEOUT_MS,
  type CommitCall,
  errorText,
  prepareCommit,
} from './commitPrepare'
import {
  type CommitReceipt,
  type CommitState,
  type CommitTicket,
  parseReceipt,
} from './commitProtocol'
import { bindCommitStatus, commitFact } from './commitStatus'
import { RESULT_LIMITS, copyJson } from './descriptorReader'
import { trySavedOutputAnchors } from './outputAnchorRead'
import { callProvider } from './providerCall'

const stateLabels = (locale?: ModelLocale) =>
  ({
    pending: wording.pending(locale),
    written: wording.written(locale),
    unchanged: wording.unchanged(locale),
    not_written: wording.notWritten(locale),
    unknown: wording.unknown(locale),
  }) as const

/**
 * Runs one `commit` tool: a provider write of user files. `prepareCommit`
 * ends with an approved preparation; this part persists a checkpoint of the
 * whole write set and links it to the run, issues and consumes a one-time
 * permit, lets the provider write, then reads every file back.
 *
 * Nothing is written without a durable checkpoint. Once the provider's
 * execute has started, the host states only what it read from disk; doubt
 * pauses the run and nothing is retried.
 */
export async function executeCommitTool(
  call: CommitCall,
): Promise<AgentToolOutcome> {
  const prepared = await prepareCommit(call)
  if (!('preparation' in prepared)) return prepared
  const { handle, ctx, tool, args, app } = call
  const { commit, runtime, runId, preparation, destination } = prepared
  const { common, notWritten } = prepared
  let record: ProviderCheckpointRecord | undefined
  const providerId = handle.pluginId
  const paused = (
    mutation: AgentToolOutcome['mutation'],
    message: string,
  ): AgentToolOutcome => ({
    status: 'paused',
    terminal: true,
    mutation,
    retry: { allowed: false },
    ...common(),
    ...(record ? { commit: commitFact(record, true) } : {}),
    displayText: wording.paused(message),
  })

  // 5. Checkpoint of the whole write set, durable and linked to the run, before any write.
  const ticketId = `tkt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  call.trace?.mark('checkpoint.start', { runId })
  try {
    const entries = []
    for (const entry of preparation.writeSet) {
      if (entry.kind === 'folder') {
        entries.push({ kind: 'folder' as const, path: entry.path })
        continue
      }
      const before =
        entry.op === 'modify' ? await readDiskBytes(app, entry.path) : null
      if (entry.op === 'modify' && !before)
        throw new Error(wording.missingFile())
      entries.push({
        kind: 'file' as const,
        path: entry.path,
        role: entry.role,
        before,
        expectedHash: entry.sha256Expected,
      })
    }
    record = await runtime.checkpoints.create(runId, {
      providerId,
      conversationId: prepared.caller.conversationId,
      tool: tool.name,
      mode: preparation.mode,
      destination,
      preparationId: preparation.preparationId,
      preparationDigest: preparation.preparationDigest,
      ticketId,
      entries,
    })
  } catch (error) {
    return notWritten(
      wording.checkpointError(errorText(error, wording.unknownCause())),
      false,
    )
  }
  /** Ends the commit before the provider was asked to write. */
  const abandon = async (outcome: AgentToolOutcome) => {
    record.state = 'not_written'
    record.entries.forEach((entry) => (entry.state = 'not_written'))
    await runtime.checkpoints.save(record).catch(() => undefined)
    return { ...outcome, commit: commitFact(record) }
  }
  try {
    await runtime.linkRun(runId, record.id)
  } catch {
    return abandon(notWritten(wording.linkError(), false))
  }
  call.trace?.mark('checkpoint.end')
  bindCommitStatus(runtime, record.id, {
    handle,
    digest: call.digest,
    generation: call.generation,
    caller: prepared.caller,
  })
  // The snapshots must be the bytes the preparation was made against.
  const preparedBefore = new Map(
    preparation.writeSet.map((entry) => [
      entry.path,
      entry.kind === 'file' ? entry.sha256Before : null,
    ]),
  )
  if (
    record.entries.some(
      (entry) =>
        entry.kind === 'file' &&
        entry.beforeHash !== preparedBefore.get(entry.path),
    )
  )
    return abandon(notWritten(wording.changedDuringCheckpoint(), true))

  // 6. Lock the paths among host and provider calls. Not a lock against other programs.
  const lockKeys = preparation.writeSet.map((entry) => entry.path.toLowerCase())
  if (lockKeys.some((item) => runtime.locks.has(item)))
    return abandon(notWritten(wording.locked(), true))
  lockKeys.forEach((item) => runtime.locks.add(item))
  const unlock = () => lockKeys.forEach((item) => runtime.locks.delete(item))
  const audit = commitAudit(call, record)
  const settle = async (by: 'commit' | 'recovery'): Promise<CommitState> => {
    const state = await observeCommit(app, record)
    audit.readback()
    record.state = state
    record.settledBy = by
    await runtime.checkpoints.save(record).catch(() => undefined)
    return state
  }

  // 8. Read the whole write set back and record it, whatever the provider said.
  const report = async (raw: unknown): Promise<AgentToolOutcome> => {
    const state = await settle('commit')
    let receipt: CommitReceipt | undefined
    try {
      receipt = parseReceipt(raw)
      audit.receipt(receipt)
      if (record.unexpectedChanges) await runtime.checkpoints.save(record)
    } catch {
      call.trace?.mark('receipt.invalid')
    }
    const written = record.entries.filter(
      (entry) => entry.kind === 'file' && entry.state === 'written',
    ).length
    call.trace?.mark('receipt', { count: written })
    const facts = record.entries
      .map((entry) => `- ${entry.path}: ${stateLabels()[entry.state]}`)
      .join('\n')
    const observed = wording.observed(facts, record.id)
    const mutation =
      state === 'written'
        ? 'applied'
        : record.entries.some((entry) => entry.state === 'written')
          ? 'partial'
          : 'none'
    if (record.unexpectedChanges)
      return paused(mutation, wording.unexpected(observed))
    if (
      !receipt ||
      receipt.state === 'pending' ||
      receipt.preparationId !== preparation.preparationId ||
      receipt.ticketId !== ticketId ||
      receipt.preparationDigest !== preparation.preparationDigest
    )
      return paused(mutation, wording.invalidReceipt(observed))
    const disclosure = {
      connectorId: providerId,
      canonicalVaultPaths: [destination],
      unattributedFiles: 0,
    }
    if (state === 'written') {
      if (
        prepared.outputAnchors &&
        !(await trySavedOutputAnchors(call, prepared, receipt.state))
      )
        return paused('applied', wording.anchorChanges(observed))
      const warnings = receipt.warnings.slice(0, 10).map((item) => `- ${item}`)
      return toolSucceeded(
        [
          wording.banner(providerId, tool.name, handle.pluginVersion),
          wording.saved(destination, record.id),
          facts,
          ...(warnings.length ? [wording.warnings(), ...warnings] : []),
        ].join('\n'),
        {
          ...common(),
          mutation: 'applied',
          disclosure,
          commit: commitFact(record),
        },
      )
    }
    if (state === 'not_written')
      return toolFailed(
        wording.failed(
          destination,
          receipt.error ? `: ${receipt.error.message.slice(0, 300)}` : '',
        ),
        {
          terminal: false,
          retry: { allowed: true },
          ...common(),
          disclosure,
          commit: commitFact(record),
        },
      )
    return paused(
      mutation,
      wording.incomplete(
        destination,
        state === 'partial' ? wording.partial() : wording.unconfirmed(),
        observed,
      ),
    )
  }

  let late = false
  let executing = false
  const write = async (): Promise<AgentToolOutcome> => {
    const stale = await prepared.changed()
    if (stale) return abandon(stale)
    const permitDestination = `plugin://${providerId}/agentinterop/commit/${preparation.preparationId}`
    const bound = {
      args,
      preparationDigest: preparation.preparationDigest,
      ticketId,
    }
    const toolSchemaDigest = await canonicalDigest(tool.inputSchema)
    const execution = await issueProviderCommitPermit({
      name: call.name,
      args: bound,
      runId,
      turnId: prepared.requestId,
      serverConfigHash: call.digest,
      connectionGeneration: call.generation,
      toolSchemaHash: toolSchemaDigest,
      destination: permitDestination,
    })
    await assertExternalCallMatches(execution, {
      name: call.name,
      args: bound,
      destination: permitDestination,
      effect: 'externalMutation',
      providerIdentity: {
        serverConfigHash: call.digest,
        connectionGeneration: call.generation,
        toolSchemaHash: toolSchemaDigest,
      },
    })
    // A cancel or a provider swap that lands before the provider starts still wins.
    if (prepared.stopped() || call.busy.has(providerId))
      return abandon(notWritten(wording.cancelledOrBusy(), false))
    consumeAuthorizedExecution(execution, {
      runId,
      turnId: prepared.requestId,
    })
    call.trace?.mark('permit')
    const ticket: CommitTicket = {
      ticketId,
      preparationId: preparation.preparationId,
      preparationDigest: preparation.preparationDigest,
      providerIdentity: {
        providerId,
        generation: String(call.generation),
        descriptorDigest: call.digest,
        toolSchemaDigest,
      },
      caller: prepared.caller,
      ...(preparation.source ? { source: preparation.source } : {}),
      destination,
      writeSet: preparation.writeSet,
      approvedAt: new Date().toISOString(),
      expiresAt: preparation.expiresAt,
    }

    // 7. The provider writes. From here on the host reports only what it reads back.
    let running: Promise<unknown> | undefined
    let raw: unknown
    try {
      ;({ raw } = await callProvider({
        trace: call.trace,
        app,
        busy: call.busy,
        providerId,
        signal: ctx.signal,
        timeoutMs: runtime.timeoutMs ?? COMMIT_CALL_TIMEOUT_MS,
        onVaultEvent: audit.event,
        invoke: (callSignal) => {
          executing = true
          return (running = Promise.resolve().then(() =>
            Reflect.apply(commit.execute, commit.receiver, [
              copyJson(ticket, RESULT_LIMITS) as unknown as CommitTicket,
              prepared.invocation(callSignal),
            ]),
          ))
        },
      }))
    } catch {
      if (!running) return abandon(notWritten(wording.cancelled(), false))
      let settled = false
      const mark = () => void (settled = true)
      await Promise.race([running.then(mark, mark), Promise.resolve()])
      if (!settled) {
        // The host stopped waiting but the provider may still be writing. Keep
        // the paths locked and the record pending until its own promise
        // settles, then record what is on disk.
        late = true
        const finish = async (raw?: unknown) => {
          await settle('recovery')
          try {
            audit.receipt(parseReceipt(raw))
          } catch {
            /* Missing receipt does not change disk facts. */
          }
          await runtime.checkpoints.save(record)
        }
        void running
          .then(finish, () => finish())
          .finally(unlock)
          .catch(() => undefined)
        return paused('none', wording.pendingSave(destination, record.id))
      }
    }
    return report(raw)
  }
  try {
    return await write()
  } catch (error) {
    return executing
      ? paused('none', wording.resultUnavailable(destination, record.id))
      : abandon(
          notWritten(errorText(error, wording.permissionUnavailable()), false),
        )
  } finally {
    if (!late) unlock()
  }
}
