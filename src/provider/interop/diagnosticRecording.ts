import { Notice, type Plugin } from 'obsidian'

import { t } from '../../i18n'

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
  let timer: ReturnType<typeof setTimeout> | undefined
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
      timer = setTimeout(() => {
        timer = undefined
        void flush()
      }, 2000)
  }
  diagnostics.onChange = schedule
  const lifetime = diagnostics.begin('runtime')
  let last = performance.now()
  let visible = document.visibilityState === 'visible'
  const visibilityChanged = () => {
    visible = document.visibilityState === 'visible'
    last = performance.now()
  }
  document.addEventListener('visibilitychange', visibilityChanged)
  const heartbeat = setInterval(() => {
    const now = performance.now()
    const elapsed = now - last
    last = now
    // Require visibility throughout the sample. OS sleep can still cause lag.
    if (elapsed > 1250 && visible && document.visibilityState === 'visible')
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
    clearInterval(heartbeat)
    document.removeEventListener('visibilitychange', visibilityChanged)
    clearTimeout(timer)
    diagnostics.onChange = undefined
    void flush()
  })
}
