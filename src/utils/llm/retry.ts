import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
  LLMBaseUrlNotSetException,
  LLMModelNotFoundException,
  LLMRateLimitExceededException,
} from '../../core/llm/exception'

import { HttpRequestError, RequestTimeoutError } from './httpTransport'

/**
 * Error classification + retry policy for LLM requests (PRD §18).
 *
 *   timeout            -> retry (network blip)
 *   401 / 403          -> do NOT retry (bad credentials)
 *   429                -> retry, honoring Retry-After when known
 *   5xx                -> retry with exponential backoff
 *   context exceeded   -> do NOT retry (caller triggers compaction instead)
 *   aborted by user    -> do NOT retry
 *
 * The provider clients throw HttpRequestError (carrying the HTTP status) and
 * RequestTimeoutError; everything else is treated as a generic network error.
 */

export class ContextLengthExceededError extends Error {
  constructor(
    message: string,
    public rawError?: Error,
  ) {
    super(message)
    this.name = 'ContextLengthExceededError'
  }
}

// Provider responses for "input too long" vary; match the common phrasings.
const CONTEXT_LENGTH_PATTERNS = [
  /context length/i,
  /context window/i,
  /maximum context/i,
  /too many tokens/i,
  /reduce the length/i,
  /prompt is too long/i,
  /maximum.*tokens/i,
  /input length.*exceed/i,
]

export function getErrorStatus(error: unknown): number | null {
  if (error instanceof HttpRequestError) return error.status
  const rawError = getRawError(error)
  return rawError ? getErrorStatus(rawError) : null
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof RequestTimeoutError
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message === 'Request aborted')
  )
}

export function isAuthError(error: unknown): boolean {
  if (
    error instanceof LLMAPIKeyInvalidException ||
    error instanceof LLMAPIKeyNotSetException
  ) {
    return true
  }
  const status = getErrorStatus(error)
  return status === 401 || status === 403
}

export function isRateLimitError(error: unknown): boolean {
  return (
    error instanceof LLMRateLimitExceededException ||
    getErrorStatus(error) === 429
  )
}

export function isServerError(error: unknown): boolean {
  const status = getErrorStatus(error)
  return status !== null && status >= 500 && status < 600
}

export function isContextLengthError(error: unknown): boolean {
  if (error instanceof ContextLengthExceededError) return true
  if (!(error instanceof Error)) return false
  // Providers usually return 400 for over-long inputs; also match by message
  // for clients that surface a plain Error.
  const status = getErrorStatus(error)
  const haystack =
    error instanceof HttpRequestError
      ? `${error.message} ${error.body ?? ''}`
      : error.message
  const matchesText = CONTEXT_LENGTH_PATTERNS.some((re) => re.test(haystack))
  if (matchesText) return true
  return status === 400 && /token|context/i.test(haystack)
}

export function isRetryableError(error: unknown): boolean {
  if (
    error instanceof Error &&
    'retryable' in error &&
    error.retryable === false
  )
    return false
  if (isAbortError(error)) return false
  if (isContextLengthError(error)) return false
  if (isAuthError(error)) return false
  if (
    error instanceof LLMBaseUrlNotSetException ||
    error instanceof LLMModelNotFoundException
  ) {
    return false
  }
  if (isTimeoutError(error)) return true
  if (isRateLimitError(error)) return true
  if (isServerError(error)) return true
  // Non-HTTP errors (DNS, connection reset, etc.) are transient -> retry.
  // Other 4xx (validation, not-found) are not.
  return getErrorStatus(error) === null
}

/**
 * Best-effort Retry-After value (ms). Providers that surface the header via an
 * error field are honored; otherwise returns null and the caller falls back to
 * exponential backoff.
 */
export function getRetryAfterMs(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const value = (error as { retryAfterMs?: unknown }).retryAfterMs
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }
  const seconds = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }
  const rawError = getRawError(error)
  return rawError ? getRetryAfterMs(rawError) : null
}

export type RetryOptions = {
  numOfAttempts?: number
  startingDelayMs?: number
  maxDelayMs?: number
  timeMultiple?: number
  /** Invoked before each retry (1-based attempt that just failed). */
  onRetry?: (error: unknown, attemptNumber: number) => void
}

const DEFAULTS = {
  numOfAttempts: 3,
  startingDelayMs: 1000,
  maxDelayMs: 30_000,
  timeMultiple: 2,
}

/**
 * Run an LLM request with retry on transient failures. Non-retryable errors
 * (auth, context-length, user abort, other 4xx) are thrown immediately.
 */
export async function withRetry<T>(
  request: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    numOfAttempts = DEFAULTS.numOfAttempts,
    startingDelayMs = DEFAULTS.startingDelayMs,
    maxDelayMs = DEFAULTS.maxDelayMs,
    timeMultiple = DEFAULTS.timeMultiple,
    onRetry,
  } = options

  for (let attemptNumber = 1; attemptNumber <= numOfAttempts; attemptNumber++) {
    try {
      return await request()
    } catch (error) {
      if (!isRetryableError(error) || attemptNumber >= numOfAttempts) {
        throw error
      }
      onRetry?.(error, attemptNumber)
      await sleep(
        getRetryAfterMs(error) ??
          jitterDelay(startingDelayMs, maxDelayMs, timeMultiple, attemptNumber),
      )
    }
  }

  // The loop either returns or throws; this is only for TypeScript exhaustivity.
  return request()
}

function getRawError(error: unknown): Error | undefined {
  return error instanceof Error &&
    'rawError' in error &&
    error.rawError instanceof Error
    ? error.rawError
    : undefined
}

function jitterDelay(
  startingDelayMs: number,
  maxDelayMs: number,
  timeMultiple: number,
  attemptNumber: number,
): number {
  const exponentialDelay = Math.min(
    maxDelayMs,
    startingDelayMs * timeMultiple ** (attemptNumber - 1),
  )
  return Math.floor(Math.random() * exponentialDelay)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
