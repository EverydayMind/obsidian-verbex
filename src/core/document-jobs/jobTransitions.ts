import { measuredJobBase, selectedBaseFont } from './jobBaseContract'
import {
  type FormatJob,
  type JobState,
  type Measurement,
  SHA,
  copy,
} from './jobTypes'
import { assertSampleReadyJob, readyJob } from './readyJob'

export function bindMeasurement(
  current: FormatJob,
  measurement: Measurement,
): FormatJob {
  if (
    current.status.state !== 'measuring' ||
    measurement.snapshot.source.sha256 !== current.sampleSha256 ||
    !SHA.test(measurement.measurementSha256)
  )
    throw new Error('Invalid job measurement binding.')
  return {
    ...current,
    ...measuredJobBase(current, measurement),
    measurement: copy(measurement),
    status: { state: 'measured' },
  }
}

export function transitionJob(
  current: FormatJob,
  next: Exclude<JobState, { state: 'measured' | 'measuring' }>,
): FormatJob {
  if (
    current.status.state === 'ready' &&
    next.state === 'blocked' &&
    [
      'decomposition_dialect_retired',
      'dialect_unsupported',
      'template_dialect_changed',
    ].includes(next.reason)
  )
    return { ...current, status: copy(next) }
  if (
    current.status.state === 'ready' &&
    next.state === 'ready' &&
    next.data.decomposition
  )
    return readyJob(current, next.data, !!next.data.template)
  if (
    !(
      current.status.state === 'measured' ||
      current.status.state === 'awaiting_choice' ||
      (current.status.state === 'measuring' && next.state === 'blocked')
    ) ||
    (current.status.state === 'awaiting_choice' &&
      next.state === 'awaiting_choice')
  )
    throw new Error('Invalid job transition.')
  if (
    next.state === 'awaiting_choice' &&
    (next.choices.length < 1 ||
      next.choices.length > 5 ||
      new Set(next.choices.map((choice) => choice.option)).size !==
        next.choices.length)
  )
    throw new Error('Invalid body choices.')
  if (next.state === 'ready') assertSampleReadyJob(current, next.data)

  return {
    ...current,
    ...(next.state === 'awaiting_choice'
      ? { choices: copy(next.choices) }
      : {}),
    ...selectedBaseFont(current, next),
    status: copy(next),
  }
}
