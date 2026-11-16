import recordV2Schema from '../../../contracts/report-style/md-dialect-v2/record-v2.schema.json'

import { retiredRecordSchema } from './retiredRecordSchema'

export const templateInspectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['derivedMode', 'record', 'payloadSha256'],
  properties: {
    dialect: { const: 'hwpx-exporter-md/2' },
    markerInventory: {
      type: 'array',
      maxItems: 256,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['marker', 'count', 'prefix'],
        properties: {
          marker: { type: 'string', maxLength: 128 },
          count: { type: 'integer', minimum: 1 },
          prefix: { type: 'string', maxLength: 4096 },
        },
      },
    },
    derivedMode: { type: 'boolean' },
    record: { anyOf: [recordV2Schema, { type: 'null' }] },
    recordRetired: retiredRecordSchema,
    payloadSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
}
