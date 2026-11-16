import {
  type RetryOptions,
  isAbortError,
  isRetryableError,
} from '../../utils/llm/retry'

export type CallObservationEvent =
  | {
      phase: 'start'
      sequence: number
      kind: 'agent' | 'auxiliary'
      reduced: boolean
      inputNames: readonly string[]
    }
  | {
      phase: 'wire'
      sequence: number
      attempt: number
      names?: readonly string[]
    }
  | {
      phase: 'attempt'
      sequence: number
      attempt: number
      sent: boolean
      result:
        | 'response'
        | 'retry'
        | 'retryable_failure'
        | 'nonretry_failure'
        | 'aborted'
    }
  | {
      phase: 'end'
      sequence: number
      attempts: number
      sends: number
      result: 'response' | 'before_send' | 'after_send' | 'aborted'
      failureKind?:
        | 'budget'
        | 'retry_exhausted'
        | 'nonretry'
        | 'aborted'
        | 'other'
    }

type Sink = (event: CallObservationEvent) => void
const observers = new WeakMap<AbortSignal, { sink: Sink; next: number }>()

/** Bound to one run signal; observers never affect the model call. */
export function observeChatCalls(signal: AbortSignal, sink: Sink): () => void {
  const observer = { sink, next: 0 }
  observers.set(signal, observer)
  return () => {
    if (observers.get(signal) === observer) observers.delete(signal)
  }
}

export function beginObservedCall(
  signal: AbortSignal | undefined,
  input: {
    kind: 'agent' | 'auxiliary'
    reduced: boolean
    inputNames: readonly string[]
  },
) {
  const observer = signal && observers.get(signal)
  if (!observer) return undefined
  const sequence = ++observer.next
  const emit = (event: CallObservationEvent) => {
    try {
      observer.sink(event)
    } catch {
      /* observational only */
    }
  }
  let attempts = 0
  let sends = 0
  let active = false
  let sent = false
  let ended = false
  const finishAttempt = (
    result:
      | 'response'
      | 'retry'
      | 'retryable_failure'
      | 'nonretry_failure'
      | 'aborted',
  ) => {
    if (!active) return
    emit({ phase: 'attempt', sequence, attempt: attempts, sent, result })
    active = false
  }
  emit({
    phase: 'start',
    sequence,
    ...input,
    inputNames: [...input.inputNames],
  })
  return {
    startAttempt() {
      attempts++
      active = true
      sent = false
    },
    sent(names?: readonly string[]) {
      if (!active) return
      sent = true
      sends++
      emit({
        phase: 'wire',
        sequence,
        attempt: attempts,
        ...(names ? { names: [...names] } : {}),
      })
    },
    retried() {
      finishAttempt('retry')
    },
    response() {
      finishAttempt('response')
    },
    success() {
      if (ended) return
      ended = true
      finishAttempt('response')
      emit({ phase: 'end', sequence, attempts, sends, result: 'response' })
    },
    failure(error: unknown) {
      if (ended) return
      ended = true
      let aborted = !!signal?.aborted
      let retryable = false
      let budget = false
      try {
        aborted ||= isAbortError(error)
        budget =
          error instanceof Error &&
          ['ChatInputBudgetError', 'ContextBudgetExceededError'].includes(
            error.name,
          )
        if (!aborted && !budget) retryable = isRetryableError(error)
      } catch {
        /* Provider error objects are not trusted diagnostic input. */
      }
      finishAttempt(
        aborted
          ? 'aborted'
          : retryable
            ? 'retryable_failure'
            : 'nonretry_failure',
      )
      emit({
        phase: 'end',
        sequence,
        attempts,
        sends,
        result: aborted ? 'aborted' : sends ? 'after_send' : 'before_send',
        failureKind: aborted
          ? 'aborted'
          : budget
            ? 'budget'
            : sends && retryable
              ? 'retry_exhausted'
              : sends
                ? 'nonretry'
                : 'other',
      })
    },
  }
}
export type ObservedCall = NonNullable<ReturnType<typeof beginObservedCall>>

/** Preserve the caller's retry policy and callback; add observation only. */
export function observedRetryOptions(
  retry: RetryOptions | undefined,
  call: ObservedCall | undefined,
): RetryOptions {
  if (!call) return retry ?? {}
  return {
    ...retry,
    onRetry: (error, attempt) => {
      retry?.onRetry?.(error, attempt)
      call.retried()
    },
  }
}
