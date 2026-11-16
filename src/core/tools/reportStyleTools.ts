import profileSchema from '../../../contracts/report-style/v1/profile.schema.json'
import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import type { RequestTool } from '../../types/llm/request'

import { bindingInput } from './reportStyleBindingSchema'
import {
  boundedReportTool as boundedTool,
  reportStyleDraftTool,
} from './reportStyleDraftTool'
import {
  reportStyleStats,
  reportStyleV2Operations,
  savedRoleStylesSchema,
  savedSemanticsSchema,
  semanticAssignmentsSchema,
  textProfileOverridesSchema,
} from './reportStyleSemanticSchema'
import { reportStyleToolRegistry } from './reportStyleToolRegistry'

const path = {
  type: 'string',
  minLength: 1,
  maxLength: 4096,
  description: 'User Vault-relative POSIX path.',
}
const sha = { type: 'string', pattern: '^[0-9a-f]{64}$' }
const offset = { type: 'integer', minimum: 0 }
export function getReportStyleToolDefinitions(
  locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  return [
    reportStyleDraftTool,
    boundedTool(
      'save_style_profile',
      'Measure an HWP/HWPX source locally and propose a new style profile note. No source body is stored. This is the first step to reuse the format of a sample document; after it is saved, read_style_profile (view=summary) returns nextStep.',
      {
        source_path: path,
        profile_path: path,
        title: { type: 'string', maxLength: 256 },
        expected_source_sha256: sha,
      },
      ['source_path'],
    ),
    boundedTool(
      'read_style_profile',
      'Read bounded profile data or semantic analysis. The default summary view includes nextStep: the next tool toward a derived, linked template with the arguments the profile already fixes (paths, hashes, revision); use them as given. Semantic previews show source text by default; set include_source_previews=false to omit it. ambiguous selects uncertain nodes, at most 20 per page. Combine meaning, context and formatting without asking the user; retain uncertainty. automaticMarker is a measured numbering or bullet definition, not the displayed ordinal or a role; series identifies a definition, not a list instance. Span classes are candidates and ranks are not probabilities; superscript digits may be citations or other content. Read truncated text via source_text with source_ref, expected_source_sha256 and source_offset. Semantic pagination and corrections use expected_analysis_sha256. Structure incorporates saved and optional unsaved semantic_assignments; pagination requires the same assignments, expected_structure_sha256 and, for v2, expected_semantics_sha256. V2 styleMapping reports mapping facts, not export fallback. assignments, text_profile and text_features read saved data without source; text features are heuristic. scriptRunCounts reports formatting observations including unknown. text_features also pages section pageNumberControls with its own nextOffset: settings do not identify page-number text or rendered pages. Their pagination uses expected_note_sha256. text_statistics and grammar recompute transient previews from saved evidence and roles, requiring KORDOC but no source; these are not saved statistics. Grammar sequences are truncated to 64 roles in grammar; use grammar_sequence with parent_role, pattern_index and expected_stats_sha256 for the full sequence. Statistics pagination also requires expected_stats_sha256.',
      {
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
      ['profile_path'],
    ),
    boundedTool(
      'update_style_profile',
      L(
        {
          ko: 'Propose one whole profile update with exact revision and whole-note byte preconditions. upgrade_schema migrates a v1 snapshot without source bytes; analysis and stats remain unavailable. capture_semantic_evidence stores bounded text-free rule features from the unchanged source for later replay. set_semantics merges assignments by ref; omit assignedBy. set_text_profile replaces explicit overrides, attributed to the model and distinct from observed stats; set_fidelity stores the structural preference without automatically enforcing it. set_role_styles updates indices from the v2 bindings view, appends without index, removes indices or updates fixed_regions; named variants use exact markers, e.g. BODY:강조 and variant 강조. Omit legacy and assignedBy. A changed marker, representative or fixed region unlinks the template. Never pass snapshot JSON.',
          en: 'Propose one whole profile update with exact revision and whole-note byte preconditions. upgrade_schema migrates a v1 snapshot without source bytes; analysis and stats remain unavailable. capture_semantic_evidence stores bounded text-free rule features from the unchanged source for later replay. set_semantics merges assignments by ref; omit assignedBy. set_text_profile replaces explicit overrides, attributed to the model and distinct from observed stats; set_fidelity stores the structural preference without automatically enforcing it. set_role_styles updates indices from the v2 bindings view, appends without index, removes indices or updates fixed_regions; named variants use exact markers, e.g. BODY:emphasis and variant emphasis. Omit legacy and assignedBy. A changed marker, representative or fixed region unlinks the template. Never pass snapshot JSON.',
        },
        locale,
      ),
      {
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
      [
        'profile_path',
        'expected_revision',
        'expected_note_sha256',
        'operation',
      ],
    ),
    boundedTool(
      'compare_style_profile',
      'Measure an output file and report static style facts. Explicit output role bindings are optional; layout is not measured.',
      {
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
      ['profile_path', 'output_path'],
    ),
  ]
}

/** Compatibility export; runtime consumers use the locale factory. */
export const REPORT_STYLE_TOOL_DEFINITIONS = getReportStyleToolDefinitions()
export const REPORT_STYLE_TOOL_REGISTRY = reportStyleToolRegistry(
  REPORT_STYLE_TOOL_DEFINITIONS,
)
