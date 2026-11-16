import { makeBodyChoices } from '../report-style/bindingCandidateChoices'
import {
  StyleMeasurementError,
  measureStyle,
} from '../report-style/kordocStyleApi'
import type { StyleApi } from '../report-style/styleApiTypes'

import { DocumentJobStore } from './jobStore'
import type { FormatJob } from './jobTypes'

/** Measure a newly created format job, sharing only immutable measurement facts. */
export async function startFormatJob(input: {
  store: DocumentJobStore
  conversationId: string
  samplePath: string
  requestedBaseFontPt?: number
  baseSource?: 'setting' | 'request'
  outputName?: string
  validatePath: (path: string) => string
  byteHash: (path: string) => Promise<string>
  api: () => StyleApi
  signal?: AbortSignal
}): Promise<FormatJob> {
  const path = input.validatePath(input.samplePath)
  if (path !== input.samplePath)
    throw new Error('Canonical sample path required.')
  const hash = await input.byteHash(path)
  if (input.signal?.aborted) throw new Error('Job cancelled.')
  const key = {
    conversationId: input.conversationId,
    sampleSha256: hash,
    apiVersion: 1,
  }
  const job = input.store.createJob({
    ...key,
    samplePath: path,
    requestedBaseFontPt: input.requestedBaseFontPt,
    baseSource: input.baseSource,
    ...(input.outputName === undefined ? {} : { outputName: input.outputName }),
  })
  const block = (reason: string) =>
    input.store.transition(job.id, job.conversationId, hash, {
      state: 'blocked',
      reason,
    })
  const assertCurrent = async () => {
    const currentHash = await input.byteHash(path)
    input.store.getJob(job.id, job.conversationId, currentHash)
  }
  let api: StyleApi | undefined
  let measurement = input.store.findMeasurement(key)
  if (!measurement) {
    try {
      api = input.api()
    } catch {
      await assertCurrent()
      return block('measurement_failed:extractor_unavailable')
    }
    try {
      const measured = await measureStyle(api, path, hash, input.signal)
      measurement = measured
    } catch (error) {
      if (input.signal?.aborted) throw new Error('Job cancelled.')
      await assertCurrent()
      return block(
        `measurement_failed:${error instanceof StyleMeasurementError ? error.code : 'invalid_response'}`,
      )
    }
    await assertCurrent()
    input.store.cacheMeasurement(key, measurement)
  }
  const bound = input.store.bindMeasurement(
    job.id,
    job.conversationId,
    hash,
    measurement,
  )
  const candidates = bound.candidates
  if (!candidates) throw new Error('Job candidates unavailable.')
  await assertCurrent()
  if (measurement.snapshot.source.format === 'hwp5') return block('hwp5_source')
  if (measurement.snapshot.sections.length !== 1) return block('multi_section')
  if (!candidates.roles.BODY.length) return block('body_missing')
  if (!candidates.bodyNeedsChoice) {
    await assertCurrent()
    return input.store.getJob(job.id, job.conversationId, hash)
  }
  let choices
  try {
    api ??= input.api()
    choices = await makeBodyChoices({
      api,
      path,
      sourceSha256: hash,
      measurementSha256: measurement.measurementSha256,
      jobId: job.id,
      candidates: candidates.bodyChoices,
      signal: input.signal,
    })
  } catch {
    if (input.signal?.aborted) throw new Error('Job cancelled.')
    await assertCurrent()
    return block('measurement_failed:preview_unavailable')
  }
  await assertCurrent()
  return input.store.transition(job.id, job.conversationId, hash, {
    state: 'awaiting_choice',
    choices,
  })
}
