export type OpenRouterModelSlug = {
  readonly author: string
  readonly slug: string
}

export type OpenRouterEndpointInfo = {
  readonly providerName: string
  readonly quantization?: string
  readonly supportsToolChoice?: boolean
}

export type OpenRouterEndpointsResult =
  | {
      readonly status: 'ok'
      readonly endpoints: readonly OpenRouterEndpointInfo[]
    }
  | {
      readonly status: 'unavailable'
      readonly reason:
        | 'not_openrouter'
        | 'invalid_model_name'
        | 'missing_config'
    }
  | {
      readonly status: 'error'
      readonly message: string
    }

function isSafePathSegment(segment: string): boolean {
  return segment.length > 0 && segment !== '.' && segment !== '..'
}

/**
 * Strip any OpenRouter variant suffix (`:free`, `:nitro`, etc.) and validate
 * that the remaining model name has exactly two non-empty path segments:
 * `author/slug`.
 */
export function parseOpenRouterModelSlug(
  modelName: string,
): OpenRouterModelSlug | null {
  const trimmed = modelName.trim()
  const colonIdx = trimmed.indexOf(':')
  const withoutVariant = (
    colonIdx === -1 ? trimmed : trimmed.slice(0, colonIdx)
  ).trim()
  if (!withoutVariant) return null
  const parts = withoutVariant.split('/')
  if (parts.length !== 2) return null
  const author = parts[0].trim()
  const slug = parts[1].trim()
  if (!isSafePathSegment(author) || !isSafePathSegment(slug)) return null
  return { author, slug }
}

/**
 * Build `${baseUrl}/models/{author}/{slug}/endpoints` with each segment
 * percent-encoded. Returns null if baseUrl or modelName is invalid.
 */
export function buildOpenRouterEndpointsUrl(
  baseUrl: string,
  modelName: string,
): string | null {
  const trimmedBase = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmedBase) return null
  const parsed = parseOpenRouterModelSlug(modelName)
  if (!parsed) return null
  const author = encodeURIComponent(parsed.author)
  const slug = encodeURIComponent(parsed.slug)
  return `${trimmedBase}/models/${author}/${slug}/endpoints`
}

type RawEndpoint = {
  provider_name?: unknown
  name?: unknown
  tag?: unknown
  quantization?: unknown
  supported_parameters?: unknown
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function parseOpenRouterEndpointsResponse(
  payload: unknown,
): OpenRouterEndpointInfo[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const data =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : undefined
  const rawList = Array.isArray(data?.endpoints)
    ? data.endpoints
    : Array.isArray(record.endpoints)
      ? record.endpoints
      : []

  const results: OpenRouterEndpointInfo[] = []
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue
    const ep = item as RawEndpoint
    const providerName =
      nonEmptyString(ep.provider_name) ??
      nonEmptyString(ep.name) ??
      nonEmptyString(ep.tag)
    if (!providerName) continue
    const quantization = nonEmptyString(ep.quantization)
    const supportsToolChoice = Array.isArray(ep.supported_parameters)
      ? ep.supported_parameters.includes('tool_choice')
      : undefined
    results.push({
      providerName,
      ...(quantization !== undefined ? { quantization } : {}),
      ...(supportsToolChoice !== undefined ? { supportsToolChoice } : {}),
    })
  }
  return results
}
