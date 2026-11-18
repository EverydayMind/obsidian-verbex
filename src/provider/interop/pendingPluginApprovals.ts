import type { App } from 'obsidian'

import type { NativeProviderStatus } from './hostScanTypes'

export type PendingPluginApproval = {
  id: string
  name: string
  state: 'pending' | 'reapproval'
}

export function readManifestName(app: App, id: string): string | undefined {
  return (
    app as unknown as {
      plugins?: { manifests?: Record<string, { name?: string }> }
    }
  ).plugins?.manifests?.[id]?.name
}

export function projectPendingPluginApprovals(
  statuses: readonly NativeProviderStatus[],
  manifestName: (id: string) => string | undefined,
): PendingPluginApproval[] {
  return statuses.flatMap((status) => {
    if (status.state !== 'pending' && status.state !== 'reapproval') return []
    const id = status.providerId
    const manifest = manifestName(id)
      ?.replace(/\p{Cc}/gu, '')
      .slice(0, 40)
    const name = manifest ? manifest : id.replace(/\p{Cc}/gu, '').slice(0, 40)
    return [{ id, name, state: status.state }]
  })
}

export function countPluginToolStates(
  statuses: readonly NativeProviderStatus[],
): {
  active: number
  pending: number
  reapproval: number
  disabled: number
} {
  const counts = { active: 0, pending: 0, reapproval: 0, disabled: 0 }
  for (const status of statuses)
    if (status.state !== 'error') counts[status.state]++
  return counts
}
