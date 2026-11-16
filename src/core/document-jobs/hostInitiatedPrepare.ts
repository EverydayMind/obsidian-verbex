import type { DocumentJobReferenceSource } from '../../context/documentJobReferences'

import { hostPrepareFailure } from './hostPrepareFailure'
import type { FormatJob } from './jobTypes'
import { boundJobPath } from './readyJob'

export type HostPrepareResult = {
  active: boolean
  fired: boolean
  execution?: 'executed' | 'reused' | 'not_executed'
  samplePath?: string
  result?: Record<string, unknown>
  existingJob?: FormatJob
}

/** Uses only user request and host metadata; it never dispatches a write. */
export async function hostInitiatedPrepare(input: {
  autoPrepare: boolean
  baseFontPt?: number
  referenceSource?: DocumentJobReferenceSource
  conversationId: string
  paths: readonly string[]
  decompositionPaths?: readonly string[]
  jobs: readonly FormatJob[]
  hash: (path: string) => Promise<string>
  prepare: (path: string) => Promise<Record<string, unknown>>
  signal?: AbortSignal
  onStart?: () => void
}): Promise<HostPrepareResult> {
  input.signal?.throwIfAborted()
  const current: { job: FormatJob; sha: string }[] = []
  for (const job of input.jobs) {
    try {
      const sha = await input.hash(boundJobPath(job))
      input.signal?.throwIfAborted()
      if (job.kind === 'template' || sha === job.sampleSha256)
        current.push({ job, sha })
    } catch (error) {
      input.signal?.throwIfAborted()
      // A missing or unreadable sample cannot establish an active job.
    }
  }
  const active = current.length > 0
  const paths = [
    ...new Set(
      input.paths.filter(
        (path) =>
          /\.hwpx?$/i.test(path) || input.decompositionPaths?.includes(path),
      ),
    ),
  ]
  if (!input.autoPrepare || !input.conversationId || paths.length !== 1)
    return { active, fired: false, existingJob: current.at(-1)?.job }
  const samplePath = paths[0]
  let sha: string
  try {
    sha = await input.hash(samplePath)
    input.signal?.throwIfAborted()
  } catch (error) {
    input.signal?.throwIfAborted()
    return hostPrepareFailure(active, samplePath, error, 'not_executed')
  }
  const sameSample = current.filter((item) => item.sha === sha)
  const existing = sameSample.find(
    (item) => item.job.requestedBaseFontPt === (input.baseFontPt ?? 15),
  )
  if (existing)
    return {
      active,
      fired: false,
      execution: 'reused',
      existingJob: existing.job,
    }
  if (active && !sameSample.length && input.referenceSource !== 'explicit')
    return { active, fired: false, existingJob: current.at(-1)?.job }
  // The hash above may have been the long step; do not start a second read
  // of the sample after the caller has already given up on this turn.
  input.signal?.throwIfAborted()
  input.onStart?.()
  try {
    const result = await input.prepare(samplePath)
    input.signal?.throwIfAborted()
    return {
      active:
        active ||
        result.state === 'ready' ||
        result.state === 'awaiting_choice',
      fired: true,
      execution: 'executed',
      samplePath,
      result,
    }
  } catch (error) {
    input.signal?.throwIfAborted()
    return hostPrepareFailure(active, samplePath, error, 'executed')
  }
}
