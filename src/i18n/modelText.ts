import { type ModelLocale, getModelLocale } from './modelLocale'

/** Select model-facing text at use time, or for an explicitly requested locale. */
export function L<T>(
  pair: { ko: T; en: T },
  locale: ModelLocale = getModelLocale(),
): T {
  return pair[locale]
}
