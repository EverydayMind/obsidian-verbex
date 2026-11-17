import { App, requireApiVersion } from 'obsidian'

import { VerbexSettings } from './schema/setting.types'

export type SecretStore = {
  get(name: string): string | null
  set(name: string, value: string): void
  list(): string[]
}

export function providerSecretStore(app: App): SecretStore | null {
  if (!requireApiVersion('1.11.5') || !app.secretStorage) return null
  const storage = app.secretStorage
  return {
    get: (name) => storage.getSecret(name),
    set: (name, value) => storage.setSecret(name, value),
    list: () => storage.listSecrets(),
  }
}

export function hydrateProviderSecrets(
  settings: VerbexSettings,
  store: SecretStore | null,
): VerbexSettings {
  return {
    ...settings,
    providers: settings.providers.map((provider) => {
      if (!provider.apiKeySecret) return provider
      let apiKey: string | undefined
      try {
        apiKey = store?.get(provider.apiKeySecret) ?? undefined
      } catch {
        /* Missing or inaccessible. */
      }
      return { ...provider, apiKey }
    }),
  }
}

export function stripProviderSecrets(settings: VerbexSettings): VerbexSettings {
  return {
    ...settings,
    providers: settings.providers.map((provider) => {
      if (!provider.apiKeySecret) return provider
      const { apiKey: _apiKey, ...rest } = provider
      return rest
    }),
  }
}

export function migrateProviderKeysToKeychain(
  settings: VerbexSettings,
  store: SecretStore,
): { settings: VerbexSettings; migrated: string[]; failed: string[] } {
  const migrated: string[] = []
  const failed: string[] = []
  const providers = settings.providers.map((provider) => {
    if (!provider.apiKey || provider.apiKeySecret) return provider
    const base =
      'verbex-provider-' +
      (provider.id
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'key')
    try {
      for (let i = 1; i <= 20; i++) {
        const name = i === 1 ? base : `${base}-${i}`
        const existing = store.get(name)
        if (existing !== null && existing !== provider.apiKey) continue
        if (existing === null) {
          store.set(name, provider.apiKey)
          if (store.get(name) !== provider.apiKey) break
        }
        migrated.push(provider.id)
        return { ...provider, apiKeySecret: name }
      }
    } catch {
      /* Preserve the original provider for retry. */
    }
    failed.push(provider.id)
    return provider
  })
  return { settings: { ...settings, providers }, migrated, failed }
}
