import { t } from '../../i18n'
import { canonicalDigest } from '../../security/promptInjectionBoundary'

import { type CopyLimits, copyJson } from './descriptorReader'
import type { JsonValue } from './protocol'

type Change = { path: string; before: string; after: string }
export type DescriptorDiff = { changes: Change[]; truncated: boolean }

/**
 * Snapshot copy limits: the descriptor's (depth 16, 10,000 nodes, 256 KiB)
 * plus the assets' under one wrapper level. The small headroom covers the
 * wrapper itself, so a maximal 512 KiB snapshot is still compared.
 */
export const SNAPSHOT_LIMITS: CopyLimits = {
  maxDepth: 17,
  maxNodes: 20_000 + 32,
  maxBytes: 512 * 1024 + 1024,
}

const isSnapshot = (value: JsonValue) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.hasOwn(value, 'descriptor')

/** An old record holds the descriptor alone; compare it in snapshot shape. */
function alignShapes(
  before: JsonValue,
  after: JsonValue,
): [JsonValue, JsonValue] {
  const left = isSnapshot(before)
  const right = isSnapshot(after)
  if (left === right) return [before, after]
  return [
    left ? before : { descriptor: before },
    right ? after : { descriptor: after },
  ]
}

const BODY_HASH_PATH = /^\/assets\/skills\/\d+\/bodySha256$/

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
    const before = copyJson(JSON.parse(previousJson), SNAPSHOT_LIMITS)
    const after = copyJson(JSON.parse(currentJson), SNAPSHOT_LIMITS)
    if (
      (await canonicalDigest(before)) !== previousDigest ||
      (await canonicalDigest(after)) !== currentDigest
    )
      return undefined
    return compareDescriptors(...alignShapes(before, after))
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
    if (BODY_HASH_PATH.test(path) && a !== undefined && b !== undefined) {
      changes.push({
        path,
        before: t('ui.descriptorDiff.bodyBefore'),
        after: t('ui.descriptorDiff.bodyChanged'),
      })
      return
    }
    changes.push({ path: path || '/', before: render(a), after: render(b) })
  }
  walk(before, after, '')
  return { changes, truncated }
}
