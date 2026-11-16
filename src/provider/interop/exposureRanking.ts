import { normalizePath } from 'obsidian'

import { matchesRequestKeyword } from '../requestKeyword'

import type { NativeExposure } from './exposurePolicy'
import type { NativeToolEntry } from './NativeProviderHost'

export type DemotionDecision = {
  demoted: boolean
  reason: 'demoted' | 'state' | 'request_or_history'
  conditions: readonly [boolean, boolean, boolean, boolean, boolean, boolean]
}

export function editorResourceDemotion(
  id: string,
  tools: NativeToolEntry[],
  entries: readonly NativeToolEntry[],
  policy: NativeExposure,
): DemotionDecision {
  const scope = policy.turnScope
  const ownerHasSession = entries.some(
    (entry) =>
      entry.providerId === scope?.providerId &&
      entry.tool.effect === 'session' &&
      (!policy.excludedTools.includes(entry.name) ||
        policy.skillTools.includes(entry.name)),
  )
  const paths = (policy.turnResourcePaths ?? []).filter((path) =>
    tools.some((entry) =>
      entry.tool.resourceTypes.some((type) =>
        path.toLowerCase().endsWith(type),
      ),
    ),
  )
  const normalize = (path: string) =>
    normalizePath(path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, ''))
  const request = (policy.requestText ?? '').toLowerCase()
  const requestedOptional = tools.some(
    (entry) =>
      (entry.tool.group ?? 'core') !== 'core' &&
      entry.tool.keywords.some((keyword) =>
        matchesRequestKeyword(request, keyword),
      ),
  )
  const conditions: DemotionDecision['conditions'] = [
    !!scope && id !== scope.providerId,
    paths.length > 0,
    !!scope &&
      paths.every((path) => normalize(path) === normalize(scope.scope.path)),
    ownerHasSession,
    !requestedOptional,
    !/\b(?:saved (?:version|document)|file on disk|original (?:copy|document)|compare (?:with|to|against) (?:the )?(?:saved|original) (?:copy|document))\b/.test(
      request,
    ) &&
      !/(저장본|저장된 파일|디스크|원본 파일과 비교|\bsaved (?:copy|file)\b|\bdisk\b|\bcompare (?:with|to) (?:the )?original file\b)/.test(
        request,
      ),
  ]
  const demoted = conditions.every(Boolean)
  return {
    demoted,
    reason: demoted
      ? 'demoted'
      : !conditions[0] || !conditions[3]
        ? 'state'
        : 'request_or_history',
    conditions,
  }
}

function matches(entries: NativeToolEntry[], text: string): string[] {
  return entries.flatMap((entry) =>
    entry.tool.keywords
      .filter((keyword) => matchesRequestKeyword(text, keyword))
      .map((keyword) => keyword.trim().toLowerCase()),
  )
}
/** Longest keyword of the group found in the current request (WP8(b)). */
export function requestScore(
  entries: NativeToolEntry[],
  policy: NativeExposure,
): number {
  return Math.max(
    0,
    ...matches(entries, policy.requestText ?? policy.text).map(
      (keyword) => keyword.length,
    ),
  )
}
export function compareOptional(
  a: string,
  first: NativeToolEntry[],
  b: string,
  second: NativeToolEntry[],
  policy: NativeExposure,
): number {
  const score = (entries: NativeToolEntry[], text: string) =>
    Math.max(0, ...matches(entries, text).map((keyword) => keyword.length))
  const count = (entries: NativeToolEntry[], text: string) =>
    new Set(matches(entries, text)).size
  return (
    score(second, policy.requestText ?? policy.text) -
      score(first, policy.requestText ?? policy.text) ||
    score(second, policy.priorUserText ?? '') -
      score(first, policy.priorUserText ?? '') ||
    score(second, policy.assistantChoiceText ?? '') -
      score(first, policy.assistantChoiceText ?? '') ||
    count(second, policy.assistantChoiceText ?? '') -
      count(first, policy.assistantChoiceText ?? '') ||
    a.localeCompare(b, 'en')
  )
}
