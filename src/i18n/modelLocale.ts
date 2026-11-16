import { moment } from 'obsidian'

import { getModelLocaleOverride } from './modelLocaleState'

export { setModelLocaleForTests } from './modelLocaleState'

export type ModelLocale = 'ko' | 'en'

let initializedLocale: ModelLocale | undefined

function validLanguage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.trim())
  )
}

function language(value: string): ModelLocale {
  return value.trim().toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

/** The app language wins even when the operating system uses Korean. */
export function resolveModelLocale(): ModelLocale {
  try {
    const appLanguage: unknown = moment.locale()
    if (validLanguage(appLanguage)) return language(appLanguage)
  } catch {
    // The Obsidian API can be unavailable in headless environments.
  }
  try {
    const nav =
      typeof window !== 'undefined'
        ? window.navigator
        : typeof navigator !== 'undefined'
          ? navigator
          : undefined
    if (validLanguage(nav?.language)) return language(nav.language)
  } catch {
    // No browser language is available.
  }
  return 'en'
}

/** Pin the language for this plugin lifetime, including repeated init calls. */
export function initModelLocale(): ModelLocale {
  initializedLocale ??= resolveModelLocale()
  return initializedLocale
}

export function getModelLocale(): ModelLocale {
  return getModelLocaleOverride() ?? initModelLocale()
}
