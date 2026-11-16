import { parsePairRecord } from '../../core/document-jobs/decompose/pairRecord'
import { DecomposeError } from '../../core/document-jobs/decompose/types'
import { stringifyUnknown } from '../../utils/stringifyUnknown'

import type { HostContext } from './editorActions'
import { hostInternalRead } from './hostInternalRead'
import { type RetiredRecord, type TemplateMarker } from './retiredRecordSchema'
import { validateTemplateInspection } from './templateInspectionSchema'

export async function inspectDecompositionRecord(
  host: HostContext,
  path: string,
  sha256: string,
  signal?: AbortSignal,
) {
  const result = await hostInternalRead(
    host,
    'md-to-hwpx',
    'inspect_decomposition_template',
    { path, expected_sha256: sha256 },
    signal,
  )
  if (!validateTemplateInspection(result))
    throw new DecomposeError('invalid_template_inspection')
  const record = parsePairRecord(result.record)
  if (
    (result.recordRetired &&
      (record ||
        result.derivedMode !== true ||
        result.dialect !== undefined)) ||
    (result.dialect !== undefined && result.dialect !== record?.dialect) ||
    (record && result.derivedMode !== true)
  )
    throw new DecomposeError('invalid_template_inspection')
  return {
    recordRetired: result.recordRetired as RetiredRecord | undefined,
    record,
    markerInventory: result.markerInventory as TemplateMarker[] | undefined,
    derivedMode: result.derivedMode === true,
    payloadSha256: stringifyUnknown(result.payloadSha256),
  }
}
