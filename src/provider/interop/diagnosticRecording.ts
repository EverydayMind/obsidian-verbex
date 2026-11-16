import { Notice, type Plugin } from 'obsidian'

import { t } from '../../i18n'
import { runtimeTimers } from '../../platform/runtime'

import { InteropDiagnostics } from './diagnostics'

/** Bounded local snapshots. One writer; log I/O is never awaited by an edit. */
export function installDiagnosticRecording(
  plugin: Plugin,
  diagnostics: InteropDiagnostics,
): void {
  const adapter = plugin.app.vault.adapter
  const folder = plugin.manifest.dir
  if (!folder) return
  const current = `${folder}/coediting-diagnostics.json`
  const previous = `${folder}/coediting-diagnostics.previous.json`
  let timer: ReturnType<typeof runtimeTimers.setTimeout> | undefined
  let writing: Promise<void> | undefined
  let dirty = false
  let stopped = false
  let failures = 0
  const ready = (async () => {
    if (await adapter.exists(current)) {
      const stat = await adapter.stat(current)
      if (stat && stat.size <= 1024 * 1024)
        await adapter.write(previous, await adapter.read(current))
    }
  })().catch(() => {
    failures++
  })
  const serialize = () =>
    JSON.stringify({ ...diagnostics.snapshot(), storageFailures: failures })
  const flush = (): Promise<void> => {
    if (writing) return writing
    writing = (async () => {
      await ready
      do {
        dirty = false
        try {
          await adapter.write(current, serialize())
        } catch {
          failures++
        }
      } while (dirty && stopped)
    })().finally(() => {
      writing = undefined
      if (dirty && !stopped) schedule()
    })
    return writing
  }
  const schedule = () => {
    dirty = true
    if (!timer && !writing && !stopped)
      timer = runtimeTimers.setTimeout(() => {
        timer = undefined
        void flush()
      }, 2000)
  }
  diagnostics.onChange = schedule
  const lifetime = diagnostics.begin('runtime')
  const doc = plugin.app.workspace.containerEl.ownerDocument
  let last = performance.now()
  let visible = doc.visibilityState === 'visible'
  const visibilityChanged = () => {
    visible = doc.visibilityState === 'visible'
    last = performance.now()
  }
  doc.addEventListener('visibilitychange', visibilityChanged)
  const heartbeat = runtimeTimers.setInterval(() => {
    const now = performance.now()
    const elapsed = now - last
    last = now
    // Require visibility throughout the sample. OS sleep can still cause lag.
    if (elapsed > 1250 && visible && doc.visibilityState === 'visible')
      lifetime.mark('lag', { durationMs: elapsed - 1000 })
  }, 1000)
  plugin.addCommand({
    id: 'copy-coediting-diagnostics',
    name: t('ui.diagnosticRecording.copyCoeditingDiagnosticLog'),
    callback: async () => {
      try {
        await navigator.clipboard.writeText(serialize())
        new Notice(t('ui.diagnosticRecording.coeditingDiagnosticLogCopied'))
      } catch {
        new Notice(t('ui.diagnosticRecording.couldNotCopyTheLogCheckCoediting'))
      }
    },
  })
  plugin.register(() => {
    lifetime.finish('unload')
    stopped = true
    runtimeTimers.clearInterval(heartbeat)
    doc.removeEventListener('visibilitychange', visibilityChanged)
    runtimeTimers.clearTimeout(timer)
    diagnostics.onChange = undefined
    void flush()
  })
}
