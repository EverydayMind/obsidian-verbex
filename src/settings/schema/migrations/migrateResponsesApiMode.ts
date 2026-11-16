/** Preserve legacy API choice, credentials, aliases and model policies. */
export function migrateResponsesApiMode(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(data.chatModels)) return data
  return {
    ...data,
    chatModels: data.chatModels.map((model: unknown) => {
      if (!model || typeof model !== 'object') return model
      const value = model as Record<string, unknown>
      if (
        ![
          'openai',
          'openrouter',
          'ollama',
          'lmstudio',
          'openai-compatible',
        ].includes(String(value.providerType)) ||
        value.apiMode !== undefined
      )
        return model
      return { ...value, apiMode: 'chat-completions' }
    }),
  }
}
