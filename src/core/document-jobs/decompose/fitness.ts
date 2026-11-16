import type { JsonObject } from '../../../provider/interop/protocol'

import type { RoundTrip } from './roundTripTypes'
import type { Model } from './types'
export type { RoundTrip } from './roundTripTypes'

/** Provisional D9 thresholds. Runtime measures text/structure, never layout. */
export const FITNESS = Object.freeze({
  aText: 0.98,
  aBlocks: 0.02,
  aLoss: 0.1,
  bText: 0.9,
  bBlocks: 0.1,
  borderline: 0.02,
})
export const explicitDecomposition = (request: string) =>
  (/\p{Script=Hangul}/u.test(request) &&
    /분해|decompos(?:e|ition)|텍스트\s*(?:와|및|·|\+)\s*템플릿|템플릿\s*(?:과|및|·|\+)\s*텍스트/i.test(
      request,
    )) ||
  /\b(?:decompos(?:e|ition|ing)|text\s*(?:and|&|\+)\s*(?:a\s+)?template|template\s*(?:and|&|\+)\s*(?:the\s+)?text)\b/i.test(
    request,
  )

export function decompositionFitness(
  roundTrip: RoundTrip | undefined,
  model?: Model,
  editPath: JsonObject = {
    state: 'unavailable',
    reason: 'edit_capability_unverified',
  },
  originalBlocks = model?.blocks,
): JsonObject {
  const r1 = roundTrip?.R1,
    r3 = roundTrip?.R3,
    r4 = roundTrip?.R4
  if (!r1 || !r3 || !r4 || roundTrip?.state === 'not_measured')
    return {
      grade: 'C',
      metrics: null,
      reasons: ['not_measured'],
      recommendation: 'edit_copy',
      editPath,
    }
  // One source block may contain multiple omitted objects. Count each ref once;
  // preserve object loss even when it was excluded from the text denominator.
  const omitted = new Set(model?.omitted ?? [])
  const dropped = new Set(model?.roles_dropped.map((d) => d.marker) ?? [])
  const droppedBlocks = originalBlocks?.filter((b) => dropped.has(b.role)) ?? []
  for (const b of droppedBlocks) omitted.add(b.ref)
  const loss = Math.max(r4.omitted, omitted.size)
  const supported = r1.sourceLines - r1.omittedLines
  // R1.matched already includes the residualMatched subset.
  const errors = roundTrip?.rendererErrors
  const text =
    supported > 0
      ? (errors ? supported - errors.missingLines : r1.matched) / supported
      : 0
  const blocks =
    r4.sourceBlocks > 0
      ? (errors?.unexplainedBlocks ?? r4.unexplained) / r4.sourceBlocks
      : 1
  const lossRatio = r4.sourceBlocks > 0 ? loss / r4.sourceBlocks : 1
  const grade =
    text >= FITNESS.aText &&
    blocks <= FITNESS.aBlocks &&
    (errors?.controlMismatches ?? r3.mismatchCount) === 0 &&
    lossRatio <= FITNESS.aLoss
      ? 'A'
      : text >= FITNESS.bText && blocks <= FITNESS.bBlocks
        ? 'B'
        : 'C'
  const borderline = [
    Math.abs(text - FITNESS.aText),
    Math.abs(text - FITNESS.bText),
    Math.abs(blocks - FITNESS.aBlocks),
    Math.abs(blocks - FITNESS.bBlocks),
    Math.abs(lossRatio - FITNESS.aLoss),
  ].some((n) => n <= FITNESS.borderline + Number.EPSILON)
  const differences: JsonObject = {
    omitted: model?.omitted ?? [],
    roles_dropped: model?.roles_dropped ?? [],
    omittedByKind: Object.fromEntries(
      (model?.blocks.flatMap((b) => b.omittedObjects) ?? [])
        .map((o) => o.kind)
        .map((kind, _, all) => [kind, all.filter((k) => k === kind).length]),
    ),
    unexplained: r4.differences.slice(0, 10),
  }
  return {
    grade,
    metrics: {
      supportedTextRatio: text,
      unexplainedBlockRatio: blocks,
      controlMismatches: errors?.controlMismatches ?? r3.mismatchCount,
      lossRatio,
    },
    ...(borderline ? { borderline: true } : {}),
    ...(grade === 'B' ? { differences } : {}),
    ...(grade === 'C'
      ? {
          reasons: ['round_trip_differences'],
          recommendation: 'edit_copy',
          editPath,
        }
      : {}),
  }
}
