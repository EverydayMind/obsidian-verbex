import { useEffect, useRef, useState } from 'react'

import { t } from '../../../i18n'
import type VerbexPlugin from '../../../main'
import { copyApproval } from '../../../provider/interop/batchApproval'
import type { NativeProviderStatus } from '../../../provider/interop/hostScanTypes'
import type { VerbexSettings } from '../../../settings/schema/setting.types'

import { type Decision, ReviewModal } from './NativeApprovalReviewModal'

type Result = {
  providerId: string
  outcome: 'approved' | 'skipped' | 'changed' | 'duplicate' | 'failed'
}

export function batchApprovalButtonText(
  targets: readonly NativeProviderStatus[],
): string {
  if (targets.every((target) => Boolean(target.descriptor))) {
    const tools = targets.reduce(
      (sum, target) => sum + (target.descriptor?.tools.length ?? 0),
      0,
    )
    return t('ui.NativeSequentialApproval.batchToolApproval', {
      plugins: targets.length,
      tools,
    })
  }
  return t('ui.NativeSequentialApproval.batchToolApprovalPluginsOnly', {
    plugins: targets.length,
  })
}

export function NativeSequentialApproval({
  plugin,
  statuses,
  setSettings,
}: {
  plugin: VerbexPlugin
  statuses: NativeProviderStatus[]
  setSettings: (settings: VerbexSettings) => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Result[] | null>(null)
  const running = useRef(false)
  const mounted = useRef(true)
  const modal = useRef<ReviewModal | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const openModal = modal.current
      if (openModal) queueMicrotask(() => openModal.close())
    }
  }, [])
  const targets = statuses.filter(
    (s) => s.state === 'pending' || s.state === 'reapproval',
  )
  const start = async () => {
    if (running.current || !targets.length) return
    running.current = true
    setBusy(true)
    setResults(null)
    const outcomes: Result[] = []
    try {
      for (const target of [...targets].sort((a, b) =>
        (a.descriptor?.provider.name ?? a.providerId).localeCompare(
          b.descriptor?.provider.name ?? b.providerId,
        ),
      )) {
        if (!mounted.current) break
        const currentStatus = plugin.nativeProviderHost
          .getStatuses()
          .find((item) => item.providerId === target.providerId)
        if (
          !currentStatus ||
          (currentStatus.state !== 'pending' &&
            currentStatus.state !== 'reapproval')
        ) {
          outcomes.push({ providerId: target.providerId, outcome: 'changed' })
          continue
        }
        const status: NativeProviderStatus = JSON.parse(
          JSON.stringify(currentStatus),
        ) as NativeProviderStatus
        const prior = plugin.settings.nativeProviders.providers
          .filter((item) => item.providerId === status.providerId)
          .map(copyApproval)
        const decision = await new Promise<Decision>((resolve) => {
          modal.current = new ReviewModal(plugin, status, prior[0], resolve)
          modal.current.open()
        })
        modal.current = null
        if (!mounted.current || decision === 'stop') break
        if (decision === 'skip') {
          outcomes.push({ providerId: status.providerId, outcome: 'skipped' })
          continue
        }
        let outcome: Result['outcome'] = 'changed'
        try {
          if (prior.length > 1) {
            outcome = 'duplicate'
            throw new Error('duplicate')
          }
          if (!status.digest || status.protocolVersion === undefined)
            throw new Error('changed')
          const review = {
            providerId: status.providerId,
            digest: status.digest,
            pluginVersion: status.pluginVersion,
            protocolVersion: status.protocolVersion,
            artifactSha256: status.artifactSha256,
          }
          const approval =
            status.state === 'pending'
              ? await plugin.nativeProviderHost.approveInitial(review)
              : prior[0]
                ? (
                    await plugin.nativeProviderHost.approveMany([
                      { ...review, previous: prior[0] },
                    ])
                  )[0]
                : undefined
          if (!approval || !mounted.current) throw new Error('changed')
          const latest = plugin.settings
          const current = latest.nativeProviders.providers.filter(
            (item) => item.providerId === status.providerId,
          )
          if (current.length > 1) {
            outcome = 'duplicate'
            throw new Error('duplicate')
          }
          if (JSON.stringify(current) !== JSON.stringify(prior))
            throw new Error('changed')
          outcome = 'failed'
          await setSettings({
            ...latest,
            nativeProviders: {
              ...latest.nativeProviders,
              providers: [
                ...latest.nativeProviders.providers.filter(
                  (item) => item.providerId !== status.providerId,
                ),
                approval,
              ],
            },
          })
          outcome = 'approved'
        } catch {
          if (outcome !== 'failed' && outcome !== 'duplicate') {
            const current = plugin.settings.nativeProviders.providers.filter(
              (item) => item.providerId === status.providerId,
            )
            if (
              current.length > 1 ||
              (status.state === 'pending' && current.length > 0)
            )
              outcome = 'duplicate'
          }
        }
        outcomes.push({ providerId: status.providerId, outcome })
      }
    } finally {
      running.current = false
      if (mounted.current) {
        setBusy(false)
        setResults(outcomes)
      }
    }
  }
  const count = (outcome: Result['outcome']) =>
    results?.filter((item) => item.outcome === outcome).length ?? 0
  return (
    <div>
      <button disabled={busy || !targets.length} onClick={() => void start()}>
        {batchApprovalButtonText(targets)}
      </button>
      {results && (
        <p role="status">
          {t('ui.NativeSequentialApproval.approved')}
          {count('approved')} {t('ui.NativeSequentialApproval.skipped')}
          {count('skipped')} {t('ui.NativeSequentialApproval.changed')}{' '}
          {count('changed')} {t('ui.NativeSequentialApproval.failed')}
          {count('failed') + count('duplicate')}
        </p>
      )}
    </div>
  )
}
