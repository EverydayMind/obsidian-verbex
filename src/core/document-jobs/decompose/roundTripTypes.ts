import type { JsonObject } from '../../../provider/interop/protocol'

export const numericRoundTripMetrics = (value: object | undefined) =>
  value
    ? Object.fromEntries(
        Object.entries(value).filter(([, v]) => typeof v === 'number'),
      )
    : null

export type RoundTrip = {
  state: string
  unmatchedText?: { ref: string; textSha256: string }[]
  spacingDifferenceCount?: number
  comparisonTruncated?: boolean
  omittedSpacingDifferenceCount?: number
  omittedSpacingDifferences?: {
    sourceRef: string
    outputRef: string
    refs: string[]
  }[]
  spacingDifferences?: {
    sourceRef: string
    outputRef: string
    sourceSizes: number[]
    outputSizes: number[]
  }[]
  declaredDifferences?: { code: string; count: number; refs: string[] }[]
  rendererErrors?: {
    missingLines: number
    unexplainedBlocks: number
    controlMismatches: number
  }
  R1?: {
    sourceLines: number
    omittedLines: number
    matched: number
    residualMatched: number
    missingLines?: { ref: string; line: number }[]
    addedLines?: { ref: string; line: number }[]
  }
  R3?: { mismatchCount: number; mismatches?: JsonObject[] }
  R4?: {
    sourceBlocks: number
    omitted: number
    unexplained: number
    differences: JsonObject[]
    pairs?: { sourceRef: string; outputRef: string }[]
  }
}
