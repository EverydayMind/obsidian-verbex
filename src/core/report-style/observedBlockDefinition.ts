const object = (
  properties: Record<string, unknown>,
  optional: string[] = [],
) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
  properties,
})
const integer = (minimum = 0, maximum = 50000) => ({
  type: 'integer',
  minimum,
  maximum,
})
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: 'null' }] })
const marker = object({
  marker: nullable({ type: 'string', maxLength: 80 }),
  markerState: { enum: ['none', 'observed', 'redacted'] },
  variant: nullable({ type: 'string', minLength: 1, maxLength: 12 }),
  variantState: { enum: ['none', 'observed', 'redacted'] },
})
const cell = object({
  row: integer(0, 200000),
  col: integer(0, 200000),
  rowSpan: integer(1, 200000),
  colSpan: integer(1, 200000),
  rows: integer(1, 200000),
  cols: integer(1, 200000),
  headerRow: { type: 'boolean' },
})
const table = object({
  rows: integer(1, 200000),
  cols: integer(1, 200000),
  headerRows: integer(0, 200000),
  wrapper: { enum: ['rule', 'direct', 'generated'] },
})
const features = object({
  eojeolCount: integer(0, 8 * 1024 * 1024),
  sentenceCount: integer(0, 8 * 1024 * 1024),
  endingClass: {
    enum: [
      'declarative',
      'nominal',
      'noun_phrase',
      'polite',
      'question',
      'other',
      'empty',
    ],
  },
  endingRule: {
    enum: [
      'empty',
      'punctuation_only',
      'question',
      'polite_suffix',
      'declarative_suffix',
      'particle_sentence',
      'nominal_suffix',
      'short_phrase',
      'other',
    ],
  },
  finalPeriod: { type: 'boolean' },
  prefixClass: {
    enum: [
      'ROMAN_UPPER',
      'ROMAN_LOWER',
      'ARABIC_DOT',
      'ARABIC_PAREN',
      'ARABIC_BOTH_PAREN',
      'KOREAN_DOT',
      'KOREAN_PAREN',
      'KOREAN_BOTH_PAREN',
      'CIRCLED_NUMBER',
      'CIRCLED_KOREAN',
      'SYMBOL',
      'NONE',
    ],
  },
  prefixRank: nullable(integer(1, 10)),
  prefixSymbol: nullable({
    enum: [
      '□',
      '■',
      '○',
      '●',
      '◦',
      'ㅇ',
      '•',
      '※',
      '▶',
      '▷',
      '▪',
      '◆',
      '◇',
      'ㆍ',
      '–',
      '—',
      '―',
      '-',
      '*',
    ],
  }),
  textPatterns: {
    type: 'array',
    maxItems: 5,
    items: object({
      class: {
        enum: [
          'CAPTION_LABEL',
          'REFERENCE_LEAD',
          'DATE',
          'ORG_SUFFIX',
          'PAGE_NUMBER',
        ],
      },
      rule: {
        enum: [
          'caption_label',
          'reference_lead',
          'date_line',
          'organization_suffix',
          'page_number',
        ],
      },
    }),
  },
  numericShare: { type: 'number', minimum: 0, maximum: 1 },
  empty: { type: 'boolean' },
})
const phraseClasses = [
  'UNIT',
  'REFERENCE',
  'QUALIFIER',
  'ABBREVIATION',
  'CITATION_MARKER',
  'DATE_PERIOD',
  'ANNOTATION',
  'INLINE_TABLE_HEADER',
  'unknown',
]
const semantics = object(
  {
    prefixOrdinal: {
      anyOf: [
        object({ state: { const: 'known' }, value: integer(0, 3999) }),
        object({ state: { enum: ['none', 'unknown'] } }),
      ],
    },
    phrases: object(
      {
        scope: { enum: ['delimited_only', 'delimited_and_cell_runs'] },
        runCoverage: { enum: ['observed', 'unavailable', 'not_applicable'] },
        truncated: { type: 'boolean' },
        candidates: object(
          Object.fromEntries(
            phraseClasses.map((name) => [name, integer(0, 32)]),
          ),
          phraseClasses,
        ),
      },
      ['runCoverage'],
    ),
    scripts: {
      anyOf: [
        object({
          state: { const: 'observed' },
          superscript: integer(0, 32),
          subscript: integer(0, 32),
          numericSuperscript: integer(0, 32),
          truncated: { type: 'boolean' },
        }),
        object({ state: { const: 'unavailable' } }),
      ],
    },
  },
  ['scripts'],
)
const text = {
  anyOf: [
    object(
      {
        state: { const: 'observed' },
        basis: {
          enum: [
            'emitted_xml_text',
            'footnote_content_xml_text',
            'code_content_xml_text',
          ],
        },
        features,
        semantics,
      },
      ['semantics'],
    ),
    object({
      state: { const: 'unavailable' },
      reason: { enum: ['complex_output', 'size_limit', 'not_observed'] },
    }),
    object({ state: { const: 'not_applicable' } }),
  ],
}
const selection = object(
  {
    kind: {
      enum: [
        'heading',
        'body',
        'list_item',
        'table',
        'table_cell',
        'cell_paragraph',
        'caption',
        'footnote',
        'quote',
        'callout',
        'quote_paragraph',
        'code',
        'hr',
      ],
    },
    requestKind: {
      enum: [
        'explicit',
        'implicit_candidates',
        'implicit_structure',
        'inherited_cell',
      ],
    },
    requested: marker,
    applied: marker,
    candidates: nullable({ type: 'array', maxItems: 100, items: marker }),
    cell: nullable(cell),
    table: nullable(table),
    captionOrigin: { enum: ['source', 'first_image', null] },
    origin: { enum: ['source', 'generated'] },
    containerMode: { enum: ['quote', 'callout_quote', 'callout_body_variant'] },
    code: object({
      lineCount: integer(0, 1000000),
      languageLabel: { enum: ['emitted', 'not_requested', 'not_rendered'] },
      leadingSurroundings: { type: 'boolean' },
      trailingSurroundings: { type: 'boolean' },
    }),
    hr: object({
      mode: { enum: ['marker', 'two_spacers'] },
      leadingSurroundings: { type: 'boolean' },
      trailingSurroundings: { type: 'boolean' },
    }),
    text,
    prefix: nullable(
      object({
        kind: {
          enum: ['literal', 'number', 'number-period', 'heading_number'],
        },
        marker: nullable({ type: 'string', maxLength: 80 }),
      }),
    ),
    variantConsidered: { type: 'boolean' },
    fallbackSource: {
      enum: [
        'none',
        'normal',
        'dynamic_heading',
        'body',
        'named_footnote_style',
        'body_indent',
        'normal_indent',
        'cell_normal',
        'inherited_cell',
      ],
    },
    fallbacks: {
      type: 'array',
      maxItems: 3,
      uniqueItems: true,
      items: {
        enum: ['variant_unsupported', 'variant_missing', 'marker_missing'],
      },
    },
  },
  ['origin', 'containerMode', 'code', 'hr'],
)
const images = object({
  basis: { const: 'renderer_output' },
  requested: integer(1),
  pictureReferences: integer(),
  textSubstitutions: integer(),
  omitted: integer(),
  firstOutcome: { enum: ['picture_reference', 'text_substitution', 'omitted'] },
})
const block = object({
  index: integer(),
  parentIndex: nullable(integer()),
  container: {
    enum: [
      'body',
      'list',
      'table_cell',
      'caption',
      'footnote',
      'quote',
      'callout',
    ],
  },
  kind: {
    enum: [
      'heading',
      'paragraph',
      'list_item',
      'figure',
      'table',
      'table_cell',
      'caption',
      'footnote',
      'quote',
      'callout',
      'code',
      'hr',
    ],
  },
  depth: integer(0, 128),
  headingLevel: nullable(integer(1, 9)),
  selection,
  images: nullable(images),
  generatedFrom: nullable(integer()),
  calloutTitleOrigin: { enum: ['explicit', 'default_type', 'unknown', null] },
  codeLabelSelection: nullable(selection),
})
const identity = object({
  pluginId: { const: 'md-to-hwpx' },
  pluginVersion: { type: 'string', minLength: 1, maxLength: 128 },
  artifactId: hash,
  configDigest: hash,
  captureMode: { const: 'none' },
  blockContractVersion: {
    enum: [
      'observed-block-page/0.1',
      'observed-block-page/0.2',
      'observed-block-page/0.3',
      'observed-block-page/0.4',
    ],
  },
})
const dependency = object({
  path: { type: 'string', minLength: 1, maxLength: 4096 },
  sha256: hash,
})
export const pageSchema = object({
  version: {
    enum: [
      'observed-block-page/0.1',
      'observed-block-page/0.2',
      'observed-block-page/0.3',
      'observed-block-page/0.4',
    ],
  },
  state: { const: 'available' },
  coverage: { const: 'partial_rendered_structure' },
  inputsDigest: hash,
  conversionIdentity: identity,
  inputDependencies: {
    type: 'array',
    minItems: 2,
    maxItems: 32,
    items: dependency,
  },
  totalBlocks: integer(),
  offset: integer(),
  nextOffset: nullable(integer(1)),
  blocks: { type: 'array', maxItems: 500, items: block },
})
