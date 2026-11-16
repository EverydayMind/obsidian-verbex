import type { App } from 'obsidian'
import { useEffect, useState } from 'react'

import { isWebHandsEnabled } from '../provider/interop/webHands'

export function useWebHandsEnabled(app: App | undefined): boolean {
  const [enabled, setEnabled] = useState(() => isWebHandsEnabled(app))
  useEffect(() => {
    const refresh = () => setEnabled(isWebHandsEnabled(app))
    refresh()
    const ref = app?.workspace?.on('layout-change', refresh)
    const timer = window.setInterval(refresh, 3000)
    return () => {
      if (ref) app?.workspace?.offref(ref)
      window.clearInterval(timer)
    }
  }, [app])
  return enabled
}
