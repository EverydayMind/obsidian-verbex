import profileSchema from '../../../contracts/report-style/v2/profile.schema.json'
import { STRUCTURAL_ROLES } from '../report-style/semanticRoles'
export const reportStyleStats = {
  views: ['text_features', 'text_statistics', 'grammar', 'grammar_sequence'],
  params: {
    expected_stats_sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    parent_role: { type: 'string', minLength: 1, maxLength: 26 },
    pattern_index: { type: 'integer', minimum: 0, maximum: 2 },
  },
}
export const reportStyleV2Operations = [
  'capture_semantic_evidence',
  'upgrade_schema',
  'set_semantics',
  'set_role_styles',
  'set_text_profile',
  'set_fidelity',
]
const roleSchema = {
  anyOf: [
    { enum: STRUCTURAL_ROLES },
    { type: 'string', pattern: '^X-[A-Z][A-Z0-9_]{0,23}$' },
  ],
}

export const semanticAssignmentsSchema = {
  type: 'array',
  maxItems: 128,
  description:
    'Read-only model corrections for structure view; never stored in the profile.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['ref', 'role'],
    properties: {
      ref: { type: 'string', minLength: 1, maxLength: 256 },
      role: { enum: STRUCTURAL_ROLES },
      level: {
        type: 'integer',
        minimum: 1,
        maximum: 9,
        description:
          'Required for a title or heading role; omit for all other roles.',
      },
      parent_ref: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        maxLength: 256,
        description:
          'Omit for computed parent, use null for document root, or provide an earlier paragraph ref.',
      },
    },
  },
}

export const savedSemanticsSchema = {
  type: 'array',
  maxItems: 256,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['ref', 'role'],
    properties: {
      ref: { type: 'string', minLength: 1, maxLength: 256 },
      role: roleSchema,
      level: { type: 'integer', minimum: 1, maximum: 9 },
      semanticParentRef: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        maxLength: 256,
      },
      discourseRole: {
        enum: [
          'BACKGROUND',
          'STATUS',
          'PROBLEM',
          'OBJECTIVE',
          'ACTION',
          'EFFECT',
          'SUMMARY',
          'OTHER',
        ],
      },
    },
  },
}

const style = profileSchema.properties.roleStyleMap.items.properties
const override = profileSchema.properties.textProfile.properties.overrides.items
export const textProfileOverridesSchema = {
  type: 'array',
  maxItems: 256,
  items: {
    ...override,
    required: override.required.filter((field) => field !== 'assignedBy'),
    properties: {
      role: roleSchema,
      field: override.properties.field,
      value: override.properties.value,
      status: override.properties.status,
    },
  },
}
export const savedRoleStylesSchema = {
  type: 'array',
  maxItems: 128,
  items: {
    type: 'object',
    additionalProperties: false,
    required: [
      'role',
      'variant',
      'marker',
      'representativeRef',
      'context',
      'preferred',
    ],
    properties: {
      index: { type: 'integer', minimum: 0, maximum: 127 },
      role: roleSchema,
      variant: style.variant,
      marker: style.marker,
      representativeRef: style.representativeRef,
      context: style.context,
      preferred: { type: 'boolean' },
    },
  },
}
