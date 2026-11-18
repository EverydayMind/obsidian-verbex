import type { App } from 'obsidian'

import type VerbexPlugin from '../../../main'
import type { LLMProvider } from '../../../types/provider.types'

type ProviderModalOpeners = {
  edit: (app: App, plugin: VerbexPlugin, provider: LLMProvider) => void
  add: (app: App, plugin: VerbexPlugin) => void
}

let openers: ProviderModalOpeners | null = null

export function setProviderModalOpeners(next: ProviderModalOpeners): void {
  openers = next
}

export function openEditProviderModal(
  app: App,
  plugin: VerbexPlugin,
  provider: LLMProvider,
): void {
  openers?.edit(app, plugin, provider)
}

export function openAddProviderModal(app: App, plugin: VerbexPlugin): void {
  openers?.add(app, plugin)
}
