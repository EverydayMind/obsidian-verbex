import { canonicalDigest } from '../../security/promptInjectionBoundary'

import type { BindingCandidate } from './bindingCandidates'
import { inspectStyle } from './kordocStyleApi'
import type { StyleApi } from './styleApiTypes'

export type BodyChoice = {
  option: string
  ref: string
  prefix: string | null
  paragraphs: number
  spacingPt: number | null
  container: string
  preview: string
}

/** inspectStyle performs source binding, text and privacy boundary validation. */
export async function makeBodyChoices(input: {
  api: StyleApi
  path: string
  sourceSha256: string
  measurementSha256: string
  jobId: string
  candidates: readonly BindingCandidate[]
  signal?: AbortSignal
}): Promise<BodyChoice[]> {
  if (
    !/^fr-[A-Za-z0-9_-]{1,125}$/.test(input.jobId) ||
    !/^[a-f0-9]{64}$/.test(input.sourceSha256) ||
    !/^[a-f0-9]{64}$/.test(input.measurementSha256) ||
    input.candidates.length < 1 ||
    input.candidates.length > 5 ||
    new Set(input.candidates.map((candidate) => candidate.ref)).size !==
      input.candidates.length
  )
    throw new Error('Invalid body choices binding.')
  const preview = (await inspectStyle(input.api, {
    path: input.path,
    expectedSha256: input.sourceSha256,
    refs: [...input.candidates].map((candidate) => candidate.ref),
    signal: input.signal,
  })) as
    | { status: 'ok'; nodes: { ref: string; text: string }[] }
    | { status: 'error'; code: string }
  if (preview.status !== 'ok')
    throw new Error(`Body preview failed: ${preview.code}`)
  return Promise.all(
    input.candidates.map(async (candidate, index) => ({
      option: `opt-${await canonicalDigest({
        jobId: input.jobId,
        measurementSha256: input.measurementSha256,
        ref: candidate.ref,
        paragraphSignature: candidate.paragraphSignature,
        characterSignature: candidate.characterSignature,
      })}`,
      ref: candidate.ref,
      prefix: candidate.prefix,
      paragraphs: candidate.paragraphs,
      spacingPt: candidate.spacingPt,
      container: candidate.container,
      preview: preview.nodes[index].text,
    })),
  )
}
