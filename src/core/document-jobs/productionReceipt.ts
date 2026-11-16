import { decompositionProductionFacts } from '../../provider/interop/decompositionResultFacts'
import type { ConvertedPreview } from '../../provider/interop/documentJobPreviewSchema'
import type { verifyJobOutput } from '../../provider/interop/documentJobVerifyOutput'
import type { JsonObject } from '../../provider/interop/protocol'
import { compareProfile } from '../report-style/compare'
import { spacerClasses } from '../report-style/spacerFacts'

import * as modelText from './documentContractText'
import type { ReadyData } from './jobTypes'

type Converted = ConvertedPreview
type Verification = Awaited<ReturnType<typeof verifyJobOutput>>

/** Preview block counts remain labeled as preview even if the saved bytes differ. */
export function productionReceipt(input: {
  data: ReadyData
  outputPath: string
  sha256: string
  preview: Converted
  commitFingerprint: string
  verification: Verification
  previousSha256?: string
}): JsonObject {
  const { data, preview, verification } = input
  const base: JsonObject = {
    state: 'produced',
    written: input.outputPath,
    sha256: input.sha256,
    verification: verification.verification,
    previewMismatch: preview.conversionFingerprint !== input.commitFingerprint,
    ...decompositionProductionFacts(data),
    ...(input.previousSha256
      ? {
          previousProduction: {
            sha256: input.previousSha256,
            output: 'output_missing',
          },
        }
      : {}),
  }
  if (
    verification.verification.state !== 'complete' ||
    !data.machine ||
    !('outputSnapshot' in verification)
  )
    return base
  const output = verification.outputSnapshot
  const source = spacerClasses(data.machine.snapshot).classes,
    target = spacerClasses(output).classes
  const sourceMap = new Map(source.map((item) => [item.prefix ?? 'BODY', item]))
  const outputMap = new Map(target.map((item) => [item.prefix ?? 'BODY', item]))
  const heights = (item: (typeof source)[number] | undefined) =>
    item?.typical
      ? item.typical.heightsPt.map((height) =>
          Number.isFinite(height) ? height : null,
        )
      : [null]
  const spacing = Object.fromEntries(
    [...new Set([...sourceMap.keys(), ...outputMap.keys()])].map((key) => [
      key,
      {
        source: heights(sourceMap.get(key)),
        output: heights(outputMap.get(key)),
      },
    ]),
  )
  const sectionFacts = compareProfile(data.machine, output).facts.filter(
    (fact) => fact.key.startsWith('sections.'),
  )
  const unsupported = Array.isArray(data.draftContract.not_supported)
    ? data.draftContract.not_supported.filter(
        (item): item is string => typeof item === 'string',
      )
    : []
  return {
    ...base,
    roles: verification.roles,
    mapping: verification.mapping,
    rolesDropped: data.droppedBindings.map((binding) => binding.key),
    notSupported: [
      ...unsupported,
      ...(sectionFacts.length > 100
        ? [modelText.sectionDifferencesTruncated()]
        : []),
    ].slice(0, 100),
    blocks: {
      basis: 'preview',
      topLevel: preview.blocks.topLevel,
      substituted: preview.blocks.substituted,
    },
    spacing,
    page: {
      sectionsDiffer:
        data.machine.snapshot.sections.length !== output.sections.length,
      differences: JSON.parse(
        JSON.stringify(sectionFacts.slice(0, 100)),
      ) as JsonObject[],
    },
    pages: { state: 'unavailable' },
    humanChecks: [modelText.humanFormatCheck()],
  }
}
