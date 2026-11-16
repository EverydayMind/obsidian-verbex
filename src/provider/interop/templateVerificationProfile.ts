import { verificationVersionProblem } from '../../core/document-jobs/decompose/dialectPolicy'
import { MD_DIALECT_V2 } from '../../core/document-jobs/decompose/dialectV2'
import { buildHierarchyDecompositionV2 } from '../../core/document-jobs/decompose/hierarchy'
import { buildStructureModel } from '../../core/document-jobs/decompose/model'
import {
  readDecomposeText,
  readStructure,
} from '../../core/document-jobs/decompose/ports'
import { readDecomposeSemantic } from '../../core/document-jobs/decompose/semantic'
import type { ReadyData } from '../../core/document-jobs/jobTypes'
import {
  getStyleApi,
  measureStyle,
} from '../../core/report-style/kordocStyleApi'
import type { ProfileMachine } from '../../core/report-style/types'

import { documentJobFileHash } from './documentJobFileHash'
import type { HostContext } from './editorActions'
import { hostInternalRead } from './hostInternalRead'

/** Source availability affects role verification only, never template-job validity. */
export async function templateVerificationProfile(
  host: HostContext,
  data: ReadyData,
  baseFontPt: number,
  signal?: AbortSignal,
): Promise<{
  machine: ProfileMachine | null
  sampleVerificationUnavailable?: string
}> {
  const binding = data.template
  if (verificationVersionProblem(binding?.dialect, binding?.rulesVersion))
    return {
      machine: null,
      sampleVerificationUnavailable: 'verification_rules_version_unsupported',
    }
  const path = binding?.sourcePath,
    expected = binding?.sourceSha256
  try {
    if (
      !path ||
      !expected ||
      host.vaultPath(path) !== path ||
      (await documentJobFileHash(host, path)) !== expected
    )
      return {
        machine: null,
        sampleVerificationUnavailable: 'sample_unavailable',
      }
  } catch {
    signal?.throwIfAborted()
    return {
      machine: null,
      sampleVerificationUnavailable: 'sample_unavailable',
    }
  }
  if (data.machine) return { machine: data.machine }
  try {
    const api = getStyleApi(host.app),
      measured = await measureStyle(api, path, expected, signal)
    const structure = await readStructure(
      {
        inspect: ({ path, expectedSha256 }) =>
          hostInternalRead(
            host,
            'md-to-hwpx',
            'inspect_derive_structure',
            { sample_path: path, expected_sample_sha256: expectedSha256 },
            signal,
          ),
      },
      path,
      measured.snapshot,
      signal,
    )
    const texts = await readDecomposeText({ api, path, ...measured, signal })
    const semantic = await readDecomposeSemantic({
      api,
      path,
      sourceSha256: expected,
      measurementSha256: measured.measurementSha256,
      signal,
    })
    const modelInput = {
      snapshot: measured.snapshot,
      texts,
      structure,
      ...semantic,
      baseFontPt,
    }
    const model =
      data.template?.dialect === MD_DIALECT_V2
        ? (await buildHierarchyDecompositionV2(modelInput)).model
        : await buildStructureModel(modelInput)
    const now = new Date().toISOString()
    return {
      machine: {
        schema: 'report-style-profile/1',
        id: 'template-verification',
        revision: 1,
        created: now,
        updated: now,
        title: 'Template source role verification',
        sourcePath: path,
        measurementSha256: measured.measurementSha256,
        snapshot: measured.snapshot,
        bindings: model.bindings,
        fixedRegions: [],
        template: null,
      },
    }
  } catch {
    signal?.throwIfAborted()
    return {
      machine: null,
      sampleVerificationUnavailable: 'verification_unavailable',
    }
  }
}
