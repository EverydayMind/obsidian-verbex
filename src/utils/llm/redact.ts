import { LLMProvider } from '../../types/provider.types'

/**
 * Secret redaction helpers.
 *
 * API keys and other provider secrets must never be persisted to Run State,
 * logs, Diff output, or surfaced in error messages. These helpers centralize
 * masking so every write path can scrub secrets consistently.
 */

const REDACTED = '[REDACTED]'

// Minimum length for a value to be treated as a secret worth masking. Short
// values (e.g. an empty string) would otherwise match too aggressively.
const MIN_SECRET_LENGTH = 6

/**
 * Replace every occurrence of the given secret values in `text` with a
 * redaction marker. Empty / short secrets are ignored.
 */
export function redactSecrets(
  text: string,
  secrets: (string | undefined | null)[],
): string {
  let result = text
  for (const secret of secrets) {
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      continue
    }
    result = result.split(secret).join(REDACTED)
  }
  return result
}

/**
 * Collect all secret values that should be masked from the configured
 * providers (currently API keys).
 */
export function collectProviderSecrets(providers: LLMProvider[]): string[] {
  return providers
    .map((provider) => provider.apiKey)
    .filter((apiKey): apiKey is string => Boolean(apiKey))
}

/**
 * Redact any configured provider secret found in `text`.
 */
export function redactProviderSecrets(
  text: string,
  providers: LLMProvider[],
): string {
  return redactSecrets(text, collectProviderSecrets(providers))
}

/**
 * Mask an API key for display, keeping only a short prefix so the user can
 * still recognize which key is configured. Used in UI, never for storage.
 */
export function maskApiKeyForDisplay(apiKey: string | undefined): string {
  if (!apiKey) {
    return ''
  }
  if (apiKey.length <= 4) {
    return REDACTED
  }
  return `${apiKey.slice(0, 4)}${'•'.repeat(Math.min(apiKey.length - 4, 8))}`
}
