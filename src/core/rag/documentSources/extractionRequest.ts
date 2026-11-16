import { runtimeTimers } from '../../../platform/runtime'

import { IndexTextResult } from './types'

/** A timeout publishes a status without allowing a second overlapping parser. */
export async function deadlineExtraction(
  request: Promise<IndexTextResult>,
  control: AbortController,
) {
  let resolveDeadline: (result: IndexTextResult) => void = () => {}
  const deadline = new Promise<IndexTextResult>((resolve) => {
    resolveDeadline = resolve
  })
  const timer = runtimeTimers.setTimeout(() => {
    control.abort()
    resolveDeadline({
      status: 'timeout',
      message: 'Extraction deadline exceeded',
    })
  }, 30000)
  const settled = request.then(
    () => {},
    () => {},
  )
  let result: IndexTextResult
  try {
    result = await Promise.race([request, deadline])
  } catch {
    result = { status: 'corrupted', message: 'Extraction failed' }
  } finally {
    runtimeTimers.clearTimeout(timer)
  }
  return { result, settled }
}
