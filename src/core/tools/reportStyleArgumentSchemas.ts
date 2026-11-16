// Locale-independent argument schemas shared by tools and Node validators.
import profileSchema from '../../../contracts/report-style/v1/profile.schema.json'

import { bindingInput } from './reportStyleBindingSchema'
import {
  reportStyleStats,
  reportStyleV2Operations,
  savedRoleStylesSchema,
  savedSemanticsSchema,
  semanticAssignmentsSchema,
  textProfileOverridesSchema,
} from './reportStyleSemanticSchema'

const path = {
  type: 'string',
  minLength: 1,
  maxLength: 4096,
  description: 'User Vault-relative POSIX path.',
}
const sha = { type: 'string', pattern: '^[0-9a-f]{64}$' }
const offset = { type: 'integer', minimum: 0 }
export const reportStyleArgumentSchemas = {
  save_style_profile: {
    type: 'object',
    properties: {
      source_path: path,
      profile_path: path,
      title: { type: 'string', maxLength: 256 },
      expected_source_sha256: sha,
    },
    required: ['source_path'],
    additionalProperties: false,
  },
  read_style_profile: {
    type: 'object',
    properties: {
      profile_path: path,
      view: {
        enum: [
          'summary',
          'candidates',
          'bindings',
          'guidance',
          'semantic',
          'ambiguous',
          'source_text',
          'structure',
          'assignments',
          'text_profile',
          ...reportStyleStats.views,
        ],
      },
      offset,
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      include_source_previews: { type: 'boolean' },
      expected_analysis_sha256: sha,
      expected_structure_sha256: sha,
      expected_semantics_sha256: sha,
      expected_note_sha256: sha,
      ...reportStyleStats.params,
      semantic_assignments: semanticAssignmentsSchema,
      expected_source_sha256: sha,
      source_ref: { type: 'string', minLength: 1, maxLength: 256 },
      source_offset: offset,
      source_limit: { type: 'integer', minimum: 1, maximum: 512 },
    },
    required: ['profile_path'],
    additionalProperties: false,
  },
  update_style_profile: {
    type: 'object',
    properties: {
      profile_path: path,
      expected_revision: { type: 'integer', minimum: 1 },
      expected_note_sha256: sha,
      operation: {
        enum: [
          'set_bindings',
          'set_guidance',
          'refresh_measurement',
          'link_template',
          ...reportStyleV2Operations,
        ],
      },
      bindings: bindingInput,
      semantics: savedSemanticsSchema,
      remove_semantic_refs: {
        type: 'array',
        maxItems: 256,
        items: { type: 'string', minLength: 1, maxLength: 256 },
        uniqueItems: true,
      },
      role_styles: savedRoleStylesSchema,
      text_overrides: textProfileOverridesSchema,
      structural_fidelity: { enum: ['expand', 'merge', 'strict'] },
      remove_role_style_indices: {
        type: 'array',
        maxItems: 128,
        items: { type: 'integer', minimum: 0, maximum: 127 },
        uniqueItems: true,
      },
      fixed_regions: profileSchema.properties.fixedRegions,
      guidance: { type: 'string', maxLength: 32768 },
      template_path: path,
      expected_template_sha256: sha,
      expected_derivation_sha256: sha,
    },
    required: [
      'profile_path',
      'expected_revision',
      'expected_note_sha256',
      'operation',
    ],
    additionalProperties: false,
  },
  compare_style_profile: {
    type: 'object',
    properties: {
      profile_path: path,
      output_path: path,
      expected_output_sha256: sha,
      output_bindings: {
        type: 'array',
        maxItems: 128,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'representativeRef'],
          properties: {
            key: { type: 'string', minLength: 1, maxLength: 64 },
            representativeRef: { type: 'string', maxLength: 256 },
          },
        },
      },
      offset,
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
    required: ['profile_path', 'output_path'],
    additionalProperties: false,
  },
  check_report_draft: {
    type: 'object',
    properties: {
      profile_path: path,
      draft_path: path,
      template_path: path,
      baseline_path: path,
      expected_draft_sha256: sha,
      expected_inputs_digest: sha,
      offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
    required: ['profile_path', 'draft_path'],
    additionalProperties: false,
  },
}
