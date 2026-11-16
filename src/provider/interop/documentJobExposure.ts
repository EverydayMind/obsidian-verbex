import type { RequestTool } from '../../types/llm/request'

import { documentJobExplicitTools } from './documentJobExplicitTools'
import type { DocumentJobTurnPolicy } from './documentJobTurnPolicy'
import { documentUserRequest } from './exposureTier'
import type { NativeToolEntry } from './NativeProviderHost'

const oldProfile = new Set([
  'save_style_profile',
  'read_style_profile',
  'update_style_profile',
  'compare_style_profile',
])
/** Job A commits through this provider by plan §3.4; its model tools compete. */
const JOB_A_EXPORT_PROVIDER = 'md-to-hwpx'

/** Suppress only the legacy profiles and the Exporter's ordinary export group. */
export function documentJobExposure(input: {
  policy: Pick<DocumentJobTurnPolicy, 'suppress'>
  request: string
  required: readonly string[]
  entries: readonly NativeToolEntry[]
  definitions: readonly RequestTool[]
}) {
  if (!input.policy.suppress) return { excluded: new Set<string>() }
  const request = documentUserRequest(input.request)
  const candidates = [
    ...input.definitions.map((item) => item.function.name),
    ...input.entries.map((item) => item.name),
  ]
  const exception = new Set([
    ...documentJobExplicitTools(request, candidates),
    ...input.required,
  ])
  const excluded = new Set(candidates.filter((name) => oldProfile.has(name)))
  const exportGroups = new Set(
    input.entries
      .filter(
        (entry) =>
          entry.providerId === JOB_A_EXPORT_PROVIDER &&
          entry.tool.name === 'export_note',
      )
      .map((entry) => entry.tool.group ?? 'core'),
  )
  for (const entry of input.entries)
    if (
      entry.providerId === JOB_A_EXPORT_PROVIDER &&
      exportGroups.has(entry.tool.group ?? 'core')
    )
      excluded.add(entry.name)
  // An excepted provider tool brings its whole core group back with it.
  const restoredCores = new Set(
    input.entries
      .filter(
        (entry) =>
          exception.has(entry.name) && (entry.tool.group ?? 'core') === 'core',
      )
      .map((entry) => entry.providerId),
  )
  for (const entry of input.entries)
    if (
      restoredCores.has(entry.providerId) &&
      (entry.tool.group ?? 'core') === 'core'
    )
      excluded.delete(entry.name)
  for (const name of exception) excluded.delete(name)
  return { excluded }
}
