import type { DocumentReadFact } from '../../core/large-document/documentReadProgress'
import { stringifyUnknown } from '../../utils/stringifyUnknown'

import type { JsonObject } from './protocol'

export const META_READ_PROGRESS = 'dev.agentinterop/readProgress'
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const bounded = (v: unknown, limit = 256): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= limit

/** Optional typed extension. Bad metadata cannot turn successful text into a failure. */
export function readProgress(
  meta: JsonObject,
  paths: string[],
  delivered: boolean,
): {
  fact?: DocumentReadFact
  invalid: boolean
} {
  const raw = meta[META_READ_PROGRESS]
  const resource = meta['dev.agentinterop/resource']
  const path = paths[0]
  const fallback = (invalid: boolean) => ({
    fact: path ? { path, state: 'unknown' as const } : undefined,
    invalid,
  })
  if (raw === undefined) return fallback(false)
  if (!object(raw) || !object(resource) || !path || !object(raw.source))
    return fallback(true)
  const source = raw.source
  if (source.path !== resource.path || !bounded(source.path, 4096))
    return fallback(true)
  let identity: unknown[]
  if (source.kind === 'working-copy') {
    if (
      !bounded(source.sessionId) ||
      !bounded(source.documentEpoch) ||
      !Number.isSafeInteger(source.revision) ||
      Number(source.revision) < 0 ||
      source.sessionId !== resource.sessionId ||
      source.documentEpoch !== resource.documentEpoch ||
      source.revision !== resource.revision
    )
      return fallback(true)
    identity = [
      source.kind,
      source.sessionId,
      source.documentEpoch,
      source.revision,
    ]
  } else if (source.kind === 'disk') {
    if (
      typeof source.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(source.sha256) ||
      !bounded(source.extractor)
    )
      return fallback(true)
    identity = [source.kind, source.sha256, source.extractor]
  } else return fallback(true)
  const { from, to, total, hasMore, contentComplete, scope, unit, nextCursor } =
    raw
  if (
    ![from, to, total].every(
      (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0,
    ) ||
    !['document', 'body-blocks'].includes(stringifyUnknown(scope)) ||
    !['block', 'line', 'page'].includes(stringifyUnknown(unit)) ||
    typeof hasMore !== 'boolean' ||
    typeof contentComplete !== 'boolean' ||
    (nextCursor !== undefined && (!hasMore || !bounded(nextCursor, 2048)))
  )
    return fallback(true)
  const range = {
    from: from as number,
    to: to as number,
    total: total as number,
  }
  if (
    (range.total === 0
      ? range.from !== 0 || range.to !== 0
      : range.from < 1 || range.to < range.from || range.to > range.total) ||
    hasMore !== range.to < range.total
  )
    return fallback(true)
  return {
    invalid: false,
    fact: {
      path,
      state: delivered ? 'page' : 'unavailable',
      page: {
        ...range,
        identity: JSON.stringify(identity),
        scope: scope as 'document' | 'body-blocks',
        unit: unit as 'block' | 'line' | 'page',
        hasMore,
        contentComplete,
      },
    },
  }
}
