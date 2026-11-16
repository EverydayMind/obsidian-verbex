import type { App } from 'obsidian'

export function isWebHandsEnabled(app: App | undefined): boolean {
  return (
    (
      app as unknown as
        | { plugins?: { enabledPlugins?: Set<string> } }
        | undefined
    )?.plugins?.enabledPlugins?.has('web-hands') === true
  )
}
