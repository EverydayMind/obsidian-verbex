/**
 * Whether an `openai`-type provider points at OpenAI itself. An empty base URL
 * means the SDK default (api.openai.com). Never throws: anything that does not
 * parse to that exact host is "not official".
 */
export function isOfficialOpenAIBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  const raw = typeof baseUrl === 'string' ? baseUrl.trim() : ''
  if (!raw) return true
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`,
    )
    return url.hostname.toLowerCase() === 'api.openai.com'
  } catch {
    return false
  }
}

/**
 * Default API mode for a chat model being ADDED. The Responses API is only
 * assumed on OpenAI's own endpoint; an OpenAI-compatible address (a proxy,
 * OpenRouter, a local server) starts on Chat Completions. Saved models keep
 * whatever they have.
 */
export function defaultApiModeForNewModel(
  provider: { type?: string; baseUrl?: string | null } | null | undefined,
): 'responses' | 'chat-completions' {
  return provider?.type === 'openai' &&
    isOfficialOpenAIBaseUrl(provider.baseUrl)
    ? 'responses'
    : 'chat-completions'
}
