import { en } from './locales/en'
import { ko } from './locales/ko'
import { resolveModelLocale } from './modelLocale'

export type Locale = 'en' | 'ko'

let currentLocale: Locale = 'en'

export const detectLocale = resolveModelLocale

export function setLocale(locale: Locale): void {
  currentLocale = locale
}

export function getCurrentLocale(): Locale {
  return currentLocale
}

export function refreshLocale(): Locale {
  const detected = detectLocale()
  setLocale(detected)
  return detected
}

// Automatically detect on load
refreshLocale()

export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  const resources = { en, ko }
  const localeRes = resources[currentLocale] || resources.en

  let val: unknown = localeRes
  const parts = key.split('.')
  for (const part of parts) {
    if (val && typeof val === 'object' && part in val) {
      val = (val as Record<string, unknown>)[part]
    } else {
      val = undefined
      break
    }
  }

  // Fallback to English if value is missing in current locale
  if (val === undefined && currentLocale !== 'en') {
    let fallbackVal: unknown = resources.en
    for (const part of parts) {
      if (
        fallbackVal &&
        typeof fallbackVal === 'object' &&
        part in fallbackVal
      ) {
        fallbackVal = (fallbackVal as Record<string, unknown>)[part]
      } else {
        fallbackVal = undefined
        break
      }
    }
    val = fallbackVal
  }

  if (typeof val !== 'string') {
    return key
  }

  if (params) {
    return val.replace(/\{([^{}]+)\}/g, (match: string, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match,
    )
  }

  return val
}
