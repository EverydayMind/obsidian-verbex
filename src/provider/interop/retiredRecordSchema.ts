export const retiredRecordSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['retired', 'schema'],
  properties: {
    retired: { const: true },
    schema: { const: 'hwpx-decomposition-record/1' },
    decompositionId: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    sourcePath: { type: 'string', minLength: 1, maxLength: 4096 },
  },
}
export type RetiredRecord = {
  retired: true
  schema: string
  decompositionId?: string
  sourcePath?: string
}
export type TemplateMarker = { marker: string; count: number; prefix: string }
