import { App, EventRef, TFile } from 'obsidian'

import { runtimeTimers } from '../../../platform/runtime'
import { VerbexSettings } from '../../../settings/schema/setting.types'
import { BackgroundWorkScheduler } from '../../background/backgroundScheduler'

import { documentQueue } from './extractionQueue'
import { documentSettings, isDocumentPath } from './indexableSources'

type Host = {
  app: App
  settings: VerbexSettings
  registerEvent(ref: EventRef): void
  register(cleanup: () => void): void
}

/** Wall-clock budget of one extraction slice before other background work runs. */
export const DOCUMENT_SLICE_MS = 4000
/** Pause between slices so index flushes and database saves interleave. */
export const DOCUMENT_SLICE_PAUSE_MS = 1000
/** Per-document completions refresh the indexes at most this often. */
export const DOCUMENT_CHANGE_THROTTLE_MS = 120_000

export type DocumentIndexingControl = {
  /** Schedule a sliced reconcile of the configured document scope. */
  requestReconcile(): void
}

export function installDocumentIndexing(
  host: Host,
  scheduler: BackgroundWorkScheduler,
  changed: () => void,
  unchangedStartup?: () => void,
): DocumentIndexingControl {
  const queue = documentQueue(host.app)
  queue.configure(host.settings)
  let disposed = false
  let changeTimer: ReturnType<typeof runtimeTimers.setTimeout> | null = null
  let scheduledRestart = false
  let scheduledNotification = false
  const flushChanged = () => {
    if (changeTimer) runtimeTimers.clearTimeout(changeTimer)
    changeTimer = null
    if (!disposed) changed()
  }
  // Each finished document used to request a full BM25 rebuild and an
  // embedding reconcile. Coalesce them; the final slice flushes immediately.
  const unsubscribe = queue.subscribe(() => {
    if (disposed || changeTimer) return
    changeTimer = runtimeTimers.setTimeout(
      flushChanged,
      DOCUMENT_CHANGE_THROTTLE_MS,
    )
  })
  const runSlice = async (restart: boolean, notifyWhenDone: boolean) => {
    if (disposed) return
    for (const work of pending.splice(0)) await work()
    queue.configure(host.settings)
    const done = await queue.reconcileSlice(DOCUMENT_SLICE_MS, false, restart)
    if (disposed) return
    if (done) {
      if (notifyWhenDone || changeTimer) flushChanged()
      else unchangedStartup?.()
    } else scheduleSlice(false, notifyWhenDone, DOCUMENT_SLICE_PAUSE_MS)
  }
  const scheduleSlice = (
    restart: boolean,
    notifyWhenDone: boolean,
    delay: number,
  ) => {
    // The scheduler replaces pending callbacks with the same key. Merge the
    // stronger intent before replacement, including while a slice is running.
    scheduledRestart ||= restart
    scheduledNotification ||= notifyWhenDone
    scheduler.schedule(
      'document-extraction',
      async () => {
        const nextRestart = scheduledRestart
        const nextNotification = scheduledNotification
        scheduledRestart = false
        scheduledNotification = false
        await runSlice(nextRestart, nextNotification)
      },
      delay,
    )
  }
  const reconcile = (notifyWhenDone = true) =>
    scheduleSlice(true, notifyWhenDone, 250)
  const pending: (() => Promise<void>)[] = []
  const vaultEvents = host.app.vault as unknown as {
    on(
      name: string,
      callback: (file: TFile, oldPath?: string) => void,
    ): EventRef
  }
  for (const event of ['create', 'modify', 'delete', 'rename'] as const) {
    host.registerEvent(
      vaultEvents.on(event, (file, oldPath?: string) => {
        if (
          !(file instanceof TFile) ||
          (!isDocumentPath(file.path) && !isDocumentPath(oldPath ?? ''))
        )
          return
        pending.push(async () => {
          queue.configure(host.settings)
          if (event === 'delete') await queue.store.remove(file.path)
          else {
            if (oldPath) await queue.store.rename(oldPath, file.path)
            await queue.enqueue(file)
          }
        })
        reconcile()
      }),
    )
  }
  const events = host.app.workspace as unknown as {
    on(name: string, callback: () => void): EventRef
  }
  host.registerEvent(
    events.on('agentinterop:providers-changed', () => reconcile()),
  )
  // With document indexing disabled the initial scan has no document work.
  // An unconditional notification would start a second full BM25 rebuild.
  host.app.workspace.onLayoutReady(() =>
    reconcile(documentSettings(host.settings).enabled),
  )
  host.register(() => {
    disposed = true
    if (changeTimer) runtimeTimers.clearTimeout(changeTimer)
    unsubscribe()
    scheduler.cancel('document-extraction')
    queue.dispose()
  })
  return { requestReconcile: () => reconcile() }
}

export async function reconcileDocuments(
  app: App,
  settings: VerbexSettings,
  retry = false,
) {
  const queue = documentQueue(app)
  queue.configure(settings)
  await queue.reconcile(retry)
}
