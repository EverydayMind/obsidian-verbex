import { t } from '../../i18n'
import { canonicalDigest } from '../../security/promptInjectionBoundary'

import { DESCRIPTOR_LIMITS, copyJson } from './descriptorReader'
import type { JsonValue } from './protocol'

type Change = { path: string; before: string; after: string }
export type DescriptorDiff = { changes: Change[]; truncated: boolean }

/** The snapshot is advisory only; a missing, damaged or mismatched snapshot
 * must never become evidence about what was previously approved. */
export async function descriptorDiff(
  previousJson: string | undefined,
  previousDigest: string,
  currentJson: string | undefined,
  currentDigest: string,
): Promise<DescriptorDiff | undefined> {
  if (!previousJson || !currentJson) return undefined
  try {
    const before = copyJson(JSON.parse(previousJson), DESCRIPTOR_LIMITS)
    const after = copyJson(JSON.parse(currentJson), DESCRIPTOR_LIMITS)
    if (
      (await canonicalDigest(before)) !== previousDigest ||
      (await canonicalDigest(after)) !== currentDigest
    )
      return undefined
    return compareDescriptors(before, after)
  } catch {
    return undefined
  }
}

export function compareDescriptors(
  before: JsonValue,
  after: JsonValue,
): DescriptorDiff {
  const changes: Change[] = []
  let truncated = false
  const render = (value: JsonValue | undefined) => {
    const text =
      value === undefined ? t('ui.descriptorDiff.none') : JSON.stringify(value)
    if (text.length <= 2000) return text
    truncated = true
    return `${text.slice(0, 2000)}…`
  }
  const walk = (
    a: JsonValue | undefined,
    b: JsonValue | undefined,
    path: string,
  ) => {
    if (changes.length >= 100) {
      truncated = true
      return
    }
    const objectA = a !== null && typeof a === 'object'
    const objectB = b !== null && typeof b === 'object'
    if (objectA && objectB && Array.isArray(a) === Array.isArray(b)) {
      const left = a as Record<string, JsonValue>,
        right = b as Record<string, JsonValue>
      const keys = [
        ...new Set([...Object.keys(left), ...Object.keys(right)]),
      ].sort()
      for (const key of keys)
        walk(
          Object.prototype.hasOwnProperty.call(left, key)
            ? left[key]
            : undefined,
          Object.prototype.hasOwnProperty.call(right, key)
            ? right[key]
            : undefined,
          `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
        )
      return
    }
    if (Object.is(a, b)) return
    changes.push({ path: path || '/', before: render(a), after: render(b) })
  }
  walk(before, after, '')
  return { changes, truncated }
}
