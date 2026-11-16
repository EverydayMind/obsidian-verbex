// Original schemas shared by the interpreter and independent Ajv equivalence tests.
import type { Options } from 'ajv'

import prepare from '../../contracts/document-jobs/v1/prepare-request.schema.json'
import produce from '../../contracts/document-jobs/v1/produce-request.schema.json'
import save from '../../contracts/document-jobs/v1/save-request.schema.json'
import structure from '../../contracts/report-style/derive-structure-v1/structure.schema.json'
import bundle from '../../contracts/report-style/md-dialect-v2/bundle-v3.schema.json'
import record from '../../contracts/report-style/md-dialect-v2/record-v2.schema.json'
import report from '../../contracts/report-style/v1/derivation-report.schema.json'
import profile from '../../contracts/report-style/v1/profile.schema.json'
import snapshot from '../../contracts/report-style/v1/snapshot.schema.json'
import profileV2 from '../../contracts/report-style/v2/profile.schema.json'
import evidence from '../../contracts/report-style/v2/semantic-evidence.schema.json'
import { decompositionPreviewResultSchema } from '../core/document-jobs/decompose/previewResultSchema'
import { pageSchema } from '../core/report-style/observedBlockDefinition'
import { semanticResultSchema } from '../core/report-style/semanticResultSchema'
import { reportStyleArgumentSchemas } from '../core/tools/reportStyleArgumentSchemas'
import { templateInspectionSchema } from '../provider/interop/templateInspectionDefinition'

const strict = {
  strictNumbers: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
}
const full = { ...strict, allErrors: true, format: 'full' }
type ValidatorDefinition = {
  name: string
  schema: Record<string, unknown>
  options: Options
  refs?: Record<string, unknown>[]
}
export function validatorDefinitions(): ValidatorDefinition[] {
  const definitions = [
    { name: 'bundle', schema: bundle, options: { allErrors: true } },
    { name: 'record', schema: record, options: { allErrors: true } },
    { name: 'structure', schema: structure, options: { allErrors: true } },
    {
      name: 'preview',
      schema: decompositionPreviewResultSchema,
      options: { allErrors: true },
    },
    { name: 'snapshot', schema: snapshot, options: full },
    { name: 'profile', schema: profile, options: full, refs: [snapshot] },
    { name: 'report', schema: report, options: full, refs: [snapshot] },
    {
      name: 'expandedProfile',
      schema: profile,
      options: { ...strict, allErrors: true },
      refs: [snapshot],
    },
    { name: 'expandedSnapshot', schema: snapshot, options: strict },
    {
      name: 'profileV2',
      schema: profileV2,
      options: { allErrors: true, strictNumbers: true },
      refs: [snapshot],
    },
    { name: 'evidence', schema: evidence, options: { strictNumbers: true } },
    {
      name: 'semantic',
      schema: semanticResultSchema,
      options: { strictNumbers: true },
    },
    {
      name: 'observedBlock',
      schema: pageSchema,
      options: { strictNumbers: true },
    },
    {
      name: 'templateInspection',
      schema: templateInspectionSchema,
      options: { allErrors: true },
    },
    { name: 'prepare', schema: prepare, options: { allErrors: true } },
    { name: 'produce', schema: produce, options: { allErrors: true } },
    { name: 'save', schema: save, options: { allErrors: true } },
    ...prepare.oneOf.map((schema, index) => ({
      name: `prepareForm${index}`,
      schema,
      options: { allErrors: true, jsonPointers: true },
    })),
    ...Object.entries(reportStyleArgumentSchemas).map(([name, schema]) => ({
      name,
      schema,
      options: strict,
    })),
  ]
  return definitions
}
