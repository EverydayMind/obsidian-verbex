import { decompositionId } from '../../core/document-jobs/decompose/bundle'
import {
  type RoundTrip,
  decompositionFitness,
} from '../../core/document-jobs/decompose/fitness'
import { buildHierarchyDecompositionV2 } from '../../core/document-jobs/decompose/hierarchy'
import { assembleHierarchyBundle } from '../../core/document-jobs/decompose/hierarchy/bundle'
import { omittedSpacingLossFacts } from '../../core/document-jobs/decompose/hierarchy/omittedSpacing'
import { classifyHierarchyRoundTrip } from '../../core/document-jobs/decompose/hierarchy/roundTrip'
import { writeHierarchyMarkdown } from '../../core/document-jobs/decompose/hierarchy/writer'
import type { Decomposition } from '../../core/document-jobs/decompose/jobDecomposition'
import {
  readDecomposeText,
  readStructure,
} from '../../core/document-jobs/decompose/ports'
import { previewDecomposition } from '../../core/document-jobs/decompose/preview'
import { previewOmittedRefs } from '../../core/document-jobs/decompose/previewOmissions'
import { roundTripSummary } from '../../core/document-jobs/decompose/roundTripSummary'
import { readDecomposeSemantic } from '../../core/document-jobs/decompose/semantic'
import { DecomposeError } from '../../core/document-jobs/decompose/types'
import type { FormatJob } from '../../core/document-jobs/jobTypes'
import { getStyleApi } from '../../core/report-style/kordocStyleApi'
import { sha256Hex } from '../../utils/hash'

import { decompositionEditPath } from './decompositionEditPath'
import { decompositionFailure } from './decompositionFailure'
import { decompositionPaths, findDecompositionPair } from './decompositionPair'
import type { HostContext } from './editorActions'
import { hostInternalRead } from './hostInternalRead'
import type { NativeHostOptions } from './hostOptions'
import type { JsonObject } from './protocol'
import * as modelText from './residualJobText'

export async function analyzeJobDecomposition(
  host: HostContext,
  job: FormatJob,
  signal?: AbortSignal,
  options: NativeHostOptions = {},
  bodyRef?: string,
) {
  // Decomposition support is required; no retired bundle fallback.
  if (
    !host
      .getActiveDiscovered('md-to-hwpx')
      ?.descriptor?.tools.some((t) => t.name === 'inspect_derive_structure')
  )
    return decompositionFailure('exporter_outdated')
  try {
    if (!job.measurement) throw new DecomposeError('measurement_unavailable')
    const { snapshot, measurementSha256 } = job.measurement
    const api = getStyleApi(host.app)
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
      job.samplePath,
      snapshot,
      signal,
    )
    const texts = await readDecomposeText({
      api,
      path: job.samplePath,
      snapshot,
      measurementSha256,
      signal,
    })
    const semantic = await readDecomposeSemantic({
      api,
      path: job.samplePath,
      sourceSha256: job.sampleSha256,
      measurementSha256,
      signal,
    })
    const hierarchy = await buildHierarchyDecompositionV2(
      {
        snapshot,
        texts,
        ...semantic,
        structure,
        baseFontPt: job.requestedBaseFontPt,
      },
      { bodyRef },
    )
    const model = hierarchy.model
    if (hierarchy.blocked)
      return {
        decomposition: {
          facts: { state: 'blocked', ...hierarchy.facts },
        } as Decomposition,
        blocked: {
          reason: 'rule_limit_exceeded',
          details: {
            ...hierarchy.facts,
            action: modelText.recommendCopyEdit(),
          } as JsonObject,
        },
      }
    if (model.bodyNeedsChoice && !bodyRef)
      return {
        decomposition: { facts: { state: 'awaiting_choice' } } as Decomposition,
        bodyChoiceModel: model,
      }
    const bundle = await assembleHierarchyBundle({
      model,
      snapshot,
      samplePath: job.samplePath,
      prefixes: hierarchy.prefixes,
    })
    const id = await decompositionId(
      job.sampleSha256,
      bundle.derivation_sha256,
      job.requestedBaseFontPt,
    )
    const paths = await decompositionPaths(host, job.samplePath, job.outputName)
    const markdown = writeHierarchyMarkdown({
      features: hierarchy.features,
      judgements: hierarchy.judgements,
      model: model,
      templateName: paths.templatePath.split('/').pop() ?? '',
      decompositionId: id,
      sourceSha256: job.sampleSha256,
    }).markdown
    const markdownSha256 = await sha256Hex(markdown)
    const preview = await previewDecomposition(
      {
        preview: (input) =>
          hostInternalRead(
            host,
            'md-to-hwpx',
            'preview_derived_export',
            input,
            signal,
          ),
      },
      {
        derive_from: bundle,
        markdown,
        expected_markdown_sha256: markdownSha256,
        allowed: { omitted_refs: previewOmittedRefs(model, snapshot) },
      },
      signal,
    )
    if (!preview.derivable || !preview.converts)
      throw new DecomposeError('decomposition_preview_failed')
    if (preview.derivation_sha256 !== bundle.derivation_sha256)
      throw new DecomposeError('preview_digest_mismatch')
    const roundTrip = await classifyHierarchyRoundTrip(
      preview.roundTrip as RoundTrip,
      hierarchy,
      preview.warnings as { code: string; count: number; examples: string[] }[],
    )
    const summary = roundTripSummary(roundTrip)
    const pair = await findDecompositionPair(
      host,
      job.samplePath,
      paths.base,
      id,
      signal,
    )
    const decomposition: Decomposition = {
      facts: {
        ...hierarchy.facts,
        ...omittedSpacingLossFacts(roundTrip),
        judgements: hierarchy.judgements,
        dialect: hierarchy.dialect,
        rulesVersion: hierarchy.rulesVersion,
        catalogVersion: hierarchy.catalogVersion,
        state: pair ? 'reused' : 'pending_save',
        text_path: pair?.textPath ?? paths.textPath,
        template_path: pair?.path ?? paths.templatePath,
        templateState: pair?.templateState ?? 'absent',
        textState: pair?.textState ?? 'as_saved',
        roundTrip: summary,
        roles_dropped: model.roles_dropped.length,
        unclassified: model.unclassified.length,
        omitted: model.omitted.length,
        body_source: model.body_source,
        documentFidelity: 'not_measured_at_runtime',
        fitness: decompositionFitness(
          roundTrip,
          model,
          decompositionEditPath(host, options),
          model.blocks,
        ),
      },
      ...(!pair
        ? {
            pending: {
              markdown,
              markdownSha256,
              bundle: bundle,
              templatePath: paths.templatePath,
              textPath: paths.textPath,
              conversionFingerprint: String(preview.conversionFingerprint),
              record: {
                decompositionId: id,
                dialect: hierarchy.dialect,
                rulesVersion: hierarchy.rulesVersion,
                catalogVersion: hierarchy.catalogVersion,
                sourcePath: job.samplePath,
                sourceSha256: job.sampleSha256,
                textFile: paths.textPath.split('/').pop() ?? '',
              },
            },
          }
        : {}),
    }
    return {
      decomposition,
      model: model,
      bundle: bundle,
      markdown,
      pair,
    }
  } catch (error) {
    signal?.throwIfAborted()
    const cause =
      error instanceof DecomposeError
        ? error.code === 'too_large'
          ? 'text_too_large'
          : error.code
        : 'analysis_failed'
    return decompositionFailure(cause)
  }
}
