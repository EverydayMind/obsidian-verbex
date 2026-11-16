import type { ModelLocale } from './modelLocale'

// Kept Obsidian-free so shared test/Node setup does not load the app mock.
let testLocale: ModelLocale | undefined

export function getModelLocaleOverride(): ModelLocale | undefined {
  return testLocale
}

/** Undefined removes the override without changing the app's pinned locale. */
export function setModelLocaleForTests(locale: ModelLocale | undefined): void {
  testLocale = locale
}
