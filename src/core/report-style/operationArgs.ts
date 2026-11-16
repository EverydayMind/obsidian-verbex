import type { ToolArgs } from '../tools/localToolCommon'

export const PROFILE_UPDATE_COMMON_FIELDS = [
  'profile_path',
  'expected_revision',
  'expected_note_sha256',
  'operation',
]

/** v1 `update_style_profile` operations and their required fields. */
export const PROFILE_V1_OPERATION_FIELDS: Record<string, string[]> = {
  set_bindings: ['bindings', 'fixed_regions'],
  set_guidance: ['guidance'],
  refresh_measurement: [],
  link_template: [
    'template_path',
    'expected_template_sha256',
    'expected_derivation_sha256',
  ],
}

/**
 * Names the missing and unexpected fields instead of a bare "arguments
 * required" error, so a model can correct the call itself. Returns null when
 * the arguments fit the operation.
 */
export function operationArgumentProblem(
  operation: string,
  args: ToolArgs,
  fields: readonly string[] | undefined,
  optional: readonly string[] = [],
): string | null {
  if (!fields) return `Unknown operation ${operation}.`
  const allowed = [...PROFILE_UPDATE_COMMON_FIELDS, ...fields, ...optional]
  const missing = fields.filter((key) => !(key in args))
  const unexpected = Object.keys(args).filter((key) => !allowed.includes(key))
  if (missing.length === 0 && unexpected.length === 0) return null
  return [
    `Operation ${operation} requires ${fields.join(', ') || 'no extra fields'}`,
    missing.length ? `missing: ${missing.join(', ')}` : '',
    unexpected.length
      ? `unrelated fields not allowed: ${unexpected.join(', ')}`
      : '',
    'Pass required fields even when unchanged (the current value or []), then call again.',
  ]
    .filter(Boolean)
    .join('; ')
}
