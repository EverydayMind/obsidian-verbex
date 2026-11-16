import { matchesRequestKeyword } from '../requestKeyword'

import { requestedResourceTypes } from './documentTypeAliases'
import type { NativeExposure } from './exposurePolicy'
import { compareOptional, editorResourceDemotion } from './exposureRanking'
import type { NativeToolEntry } from './NativeProviderHost'

/** Rank explicit choices before automatic matches; exclusions win over pins. */
export function nativeExposureGroups(
  entries: readonly NativeToolEntry[],
  policy: NativeExposure,
) {
  const text = policy.text.toLowerCase()
  const requestedTypes = requestedResourceTypes(policy.requestText)
  const extensions = new Set(
    policy.resourcePaths.map((path) =>
      path.slice(path.lastIndexOf('.')).toLowerCase(),
    ),
  )
  const wanted = (entry: NativeToolEntry) =>
    policy.skillTools.includes(entry.name) ||
    policy.pinnedTools.includes(entry.name)
  const providers = new Map<string, NativeToolEntry[]>()
  for (const entry of entries) {
    if (
      policy.excludedTools.includes(entry.name) &&
      !policy.skillTools.includes(entry.name)
    )
      continue
    const tools = providers.get(entry.providerId) ?? []
    tools.push(entry)
    providers.set(entry.providerId, tools)
  }
  const keywordMatch = (entry: NativeToolEntry) =>
    !policy.simple &&
    entry.tool.keywords.some((keyword) => matchesRequestKeyword(text, keyword))
  return [...providers]
    .map(([id, tools]) => {
      const rank = tools.some((entry) =>
        policy.pinnedTools.includes(entry.name),
      )
        ? 0
        : tools.some((entry) => policy.skillTools.includes(entry.name))
          ? 1
          : 2
      const automatic =
        policy.contextProviders?.includes(id) ||
        (!policy.simple &&
          tools.some(
            (entry) =>
              keywordMatch(entry) ||
              entry.tool.resourceTypes.some(
                (type) =>
                  extensions.has(type) ||
                  text.includes(type) ||
                  requestedTypes.has(type),
              ),
          ))
      if (rank === 2 && !automatic) return undefined
      const preferredExtensions = new Set(
        (policy.preferredResourcePaths ?? policy.resourcePaths).map((path) =>
          path.slice(path.lastIndexOf('.')).toLowerCase(),
        ),
      )
      const demotion = editorResourceDemotion(id, tools, entries, policy)
      const preferred =
        tools.some((entry) =>
          entry.tool.resourceTypes.some((type) =>
            preferredExtensions.has(type),
          ),
        ) && !demotion.demoted
      const minimum = tools.filter(
        (entry) => wanted(entry) || (entry.tool.group ?? 'core') === 'core',
      )
      const optional = new Map<string, NativeToolEntry[]>()
      for (const entry of tools) {
        if (minimum.includes(entry) || !keywordMatch(entry)) continue
        const group = entry.tool.group ?? 'core'
        optional.set(group, [...(optional.get(group) ?? []), entry])
      }
      const sorted = (group: NativeToolEntry[]) =>
        group.sort((a, b) => a.name.localeCompare(b.name, 'en'))
      return {
        id,
        rank,
        preferred,
        demotion,
        tools: entries.filter((entry) => entry.providerId === id),
        minimum: sorted(minimum),
        optional: [...optional]
          .sort(([a, first], [b, second]) =>
            compareOptional(a, first, b, second, policy),
          )
          .map(([, group]) => sorted(group)),
      }
    })
    .filter((group): group is NonNullable<typeof group> => !!group)
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id, 'en'))
}
