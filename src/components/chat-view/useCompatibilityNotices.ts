import type { App } from 'obsidian'
import { useEffect, useState } from 'react'

import type VerbexPlugin from '../../main'
import {
  type CompatibilityNotice,
  collectCompatibilityNotices,
  hostOutdatedProviders,
} from '../../provider/interop/compatibilityNotices'

/** Notices for the chat band; recomputed when providers or stored connectors change. */
export function useCompatibilityNotices(
  app: App,
  plugin: VerbexPlugin,
  connectors: readonly { id: string; target: { pluginId: string } }[],
): CompatibilityNotice[] {
  const [notices, setNotices] = useState<CompatibilityNotice[]>([])
  useEffect(() => {
    let active = true
    const host = plugin.nativeProviderHost
    const update = () => {
      try {
        if (active)
          setNotices(
            collectCompatibilityNotices(
              app,
              hostOutdatedProviders(host),
              connectors,
            ),
          )
      } catch {
        // Advisory only; nothing here gates a tool.
      }
    }
    update()
    const detach = host.onStatusesChanged(update)
    return () => {
      active = false
      detach()
    }
  }, [app, plugin, connectors])
  return notices
}
