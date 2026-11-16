import { HttpRequestError } from '../../utils/llm/httpTransport'

import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
  LLMBaseUrlNotSetException,
} from './exception'
import { ModelDiscoveryResult } from './modelDiscovery.types'

/**
 * Thrown by {@link BaseLLMProvider.listModels} (default implementation) to
 * signal that a provider has no model-discovery endpoint at all, as distinct
 * from a discovery attempt that failed (auth/network/server/endpoint error).
 *
 * Keep classification separate from modelDiscovery.ts to avoid an import
 * cycle through manager.ts and its provider imports.
 */
export class ModelDiscoveryUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelDiscoveryUnsupportedError'
  }
}

/**
 * Classifies a thrown discovery error into a user-actionable category. Typed
 * provider exceptions are checked before falling back to HTTP status, so "no
 * API key configured" is reported as `auth` even when no request was made.
 * Anything unrecognized (fetch failure, timeout) is `network`.
 */
export function classifyDiscoveryError(
  error: unknown,
): NonNullable<ModelDiscoveryResult['errorCategory']> {
  if (
    error instanceof LLMAPIKeyNotSetException ||
    error instanceof LLMAPIKeyInvalidException
  ) {
    return 'auth'
  }
  if (error instanceof LLMBaseUrlNotSetException) {
    return 'endpoint'
  }
  if (error instanceof HttpRequestError) {
    if (error.status === 401 || error.status === 403) return 'auth'
    if (error.status === 404 || error.status === 405) return 'endpoint'
    if (error.status === 429 || error.status >= 500) return 'server'
    return 'network'
  }
  return 'network'
}
