import evidenceSchema from '../../../contracts/report-style/v2/semantic-evidence.schema.json'

import { STRUCTURAL_ROLES } from './semanticRoles'
import { semanticSpanFields } from './semanticSpans'

const roles = STRUCTURAL_ROLES
const discourse = [
  'BACKGROUND',
  'STATUS',
  'PROBLEM',
  'OBJECTIVE',
  'ACTION',
  'EFFECT',
  'SUMMARY',
]
const evidence = [
  'footnote_container',
  'caption_context',
  'note_marker',
  'cell_content',
  'first_row_bold',
  'cell_label_before_value',
  'cell_unbold_value',
  'cell_header_possible',
  'body_default',
  'heading_combined_text_style_context',
  'numbered_content',
  'automatic_marker',
  'prominent_cell_text',
  'document_title_terms',
  'document_notice_identifier',
  'organization_suffix',
  'date_line',
]
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const nullableNumber = { type: ['number', 'null'] }
const features = object({
  container: {
    enum: ['body', 'cell', 'header', 'footer', 'caption', 'footnote'],
  },
  prefix: {
    enum: [
      'NONE',
      'ROMAN',
      'ARABIC_DOT',
      'KOREAN_DOT',
      'ARABIC_PAREN',
      'KOREAN_PAREN',
      'BOTH_PAREN',
      'CIRCLED',
      'SYMBOL',
    ],
  },
  prefixRank: { type: ['integer', 'null'], minimum: 1, maximum: 8 },
  ending: { enum: ['sentence', 'noun_phrase', 'other', 'empty'] },
  wordCount: { type: 'integer', minimum: 0 },
  sizeRatio: nullableNumber,
  bold: { type: ['boolean', 'null'] },
  indentPt: nullableNumber,
  hasDeeperFollowing: { type: 'boolean' },
  followingTable: { type: 'boolean' },
  discourse: {
    type: 'array',
    maxItems: 7,
    items: object({
      role: { enum: discourse },
      evidence: {
        enum: [
          'text_background',
          'text_status',
          'text_problem',
          'text_objective',
          'text_action',
          'text_effect',
          'text_summary',
        ],
      },
    }),
  },
})
const semanticSchema = (withSpans: boolean, withAutomatic = 0) =>
  object({
    schema: {
      const: withSpans
        ? 'report-style-semantic-rules/0.2'
        : 'report-style-semantic-rules/0.1',
    },
    ruleSetVersion: {
      enum: withAutomatic
        ? withAutomatic === 2
          ? [
              'ko-structure/0.7',
              'ko-structure/0.8',
              'ko-structure/0.9',
              'ko-structure/0.10',
            ]
          : ['ko-structure/0.6']
        : withSpans
          ? ['ko-structure/0.4', 'ko-structure/0.5']
          : ['ko-structure/0.3'],
    },
    baselineSizePt: nullableNumber,
    nodes: {
      type: 'array',
      maxItems: 10000,
      items: object({
        ref: { type: 'string', maxLength: 256 },
        features: withAutomatic
          ? object({
              ...features.properties,
              automaticMarker:
                withAutomatic === 2
                  ? evidenceSchema.definitions.automaticMarkerV2
                  : evidenceSchema.definitions.automaticMarker,
            })
          : features,
        state: { enum: ['decided', 'ambiguous', 'unknown'] },
        candidates: {
          type: 'array',
          maxItems: roles.length,
          items: object({
            role: { enum: roles },
            rank: { type: 'integer', minimum: -100, maximum: 1000 },
            evidence: {
              type: 'array',
              maxItems: 12,
              items: { enum: evidence },
            },
          }),
        },
        level: { type: ['integer', 'null'], minimum: 1, maximum: 9 },
        semanticParentRef: { type: ['string', 'null'], maxLength: 256 },
        ...(withSpans ? semanticSpanFields : {}),
      }),
    },
  })
export const semanticResultSchema = {
  anyOf: [
    semanticSchema(false),
    semanticSchema(true),
    semanticSchema(true, 1),
    semanticSchema(true, 2),
  ],
}
