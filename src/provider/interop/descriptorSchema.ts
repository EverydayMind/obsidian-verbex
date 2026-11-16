import { parseBrowserTool } from './browserProtocol'
import {
  JsonObject,
  JsonValue,
  META_EFFECT,
  META_GROUP,
  META_KEYWORDS,
  META_MAX_RESULT_CHARS,
  META_RESOURCE_TYPES,
  ProviderDescriptor,
  TOOL_EFFECTS,
  ToolDescriptor,
  ToolEffect,
  nativeToolName,
} from './protocol'
import { schemaProblem } from './schemaSubset'

export const MAX_TOOLS = 64
export const MAX_DESCRIPTION_CHARS = 1024
export const MAX_INSTRUCTIONS_CHARS = 2000
export const MAX_RESULT_CHARS = 40_000
const TOOL_NAME = /^[a-z][a-z0-9_]{1,40}$/
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,48}$/
const MODEL_NAME = /^[A-Za-z0-9_-]{1,64}$/

const isRecord = (value: unknown): value is JsonObject =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** Tabs and line breaks are allowed; other control characters are not. */
function text(
  value: JsonValue | undefined,
  label: string,
  max: number,
): string {
  if (typeof value !== 'string' || !value.length || value.length > max)
    throw new Error(`${label} must be 1..${max} characters`)
  for (const character of value) {
    const code = character.charCodeAt(0)
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127)
      throw new Error(`${label} contains a control character`)
  }
  return value
}

function strings(value: JsonValue | undefined, label: string): string[] {
  if (value === undefined) return []
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    value.some((item) => typeof item !== 'string' || !item || item.length > 64)
  )
    throw new Error(`${label} must be up to 32 short strings`)
  return value as string[]
}

function only(record: JsonObject, allowed: string[], label: string): void {
  for (const key of Object.keys(record))
    if (!allowed.includes(key))
      throw new Error(`${label}: unknown field ${key}`)
}

function parseTool(
  raw: JsonValue,
  providerId: string,
  capabilities: {
    resolveTarget: boolean
    commit: boolean
    protocolVersion?: number
    browser?: boolean
  },
): ToolDescriptor {
  if (!isRecord(raw)) throw new Error('tool must be an object')
  only(
    raw,
    ['name', 'title', 'description', 'inputSchema', 'annotations', '_meta'],
    'tool',
  )
  if (typeof raw.name !== 'string' || !TOOL_NAME.test(raw.name))
    throw new Error('tool name must match ^[a-z][a-z0-9_]{1,40}$')
  const label = `tool ${raw.name}`
  if (!MODEL_NAME.test(nativeToolName(providerId, raw.name)))
    throw new Error(`${label}: model-facing name exceeds 64 characters`)
  const description = text(
    raw.description,
    `${label} description`,
    MAX_DESCRIPTION_CHARS,
  )
  const title =
    raw.title === undefined ? undefined : text(raw.title, `${label} title`, 128)
  const schema = raw.inputSchema
  const problem = schemaProblem(schema ?? null)
  if (problem) throw new Error(`${label} inputSchema ${problem}`)
  if (!isRecord(schema) || schema.type !== 'object')
    throw new Error(`${label} inputSchema must be an object schema`)
  if (raw.annotations !== undefined && !isRecord(raw.annotations))
    throw new Error(`${label} annotations must be an object`)
  const meta = raw._meta
  if (!isRecord(meta)) throw new Error(`${label}: _meta is required`)
  only(
    meta,
    [
      META_EFFECT,
      META_GROUP,
      META_RESOURCE_TYPES,
      META_KEYWORDS,
      META_MAX_RESULT_CHARS,
      ...(capabilities.protocolVersion === 2
        ? ['dev.agentinterop/browserAction', 'dev.agentinterop/resourceKind']
        : []),
    ],
    `${label} _meta`,
  )
  const effect = meta[META_EFFECT]
  if (
    !TOOL_EFFECTS.includes(effect as ToolEffect) ||
    (effect === 'browser' && capabilities.protocolVersion !== 2)
  )
    throw new Error(`${label}: effect must be read, pure, session or commit`)
  const browser = parseBrowserTool(meta, effect, capabilities)
  if (
    (effect === 'session' || effect === 'commit') &&
    !capabilities.resolveTarget
  )
    throw new Error(`${label}: ${String(effect)} tools require resolveTarget`)
  if (effect === 'commit' && !capabilities.commit)
    throw new Error(`${label}: commit tools require the commit capability`)
  const group = meta[META_GROUP]
  if (
    group !== undefined &&
    (typeof group !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(group))
  )
    throw new Error(`${label}: group must be a short lowercase name`)
  const max = meta[META_MAX_RESULT_CHARS]
  if (
    max !== undefined &&
    (typeof max !== 'number' ||
      !Number.isInteger(max) ||
      max < 1 ||
      max > MAX_RESULT_CHARS)
  )
    throw new Error(`${label}: maxResultChars must be 1..${MAX_RESULT_CHARS}`)
  return {
    ...browser,
    name: raw.name,
    ...(title === undefined ? {} : { title }),
    description,
    inputSchema: schema,
    effect: effect as ToolEffect,
    ...(group === undefined ? {} : { group }),
    resourceTypes: strings(
      meta[META_RESOURCE_TYPES],
      `${label} resourceTypes`,
    ).map((type) => type.toLowerCase()),
    keywords: strings(meta[META_KEYWORDS], `${label} keywords`),
    ...(max === undefined ? {} : { maxResultChars: max }),
  }
}

/**
 * Validates a safe copy of describe(). Any defect rejects the whole
 * descriptor, so the user never approves a partially hidden tool list.
 */
export function parseDescriptor(
  raw: JsonValue,
  expected: {
    pluginId: string
    resolveTarget: boolean
    commit: boolean
    protocolVersion?: number
    browser?: boolean
  },
): ProviderDescriptor {
  if (!isRecord(raw)) throw new Error('descriptor must be an object')
  only(raw, ['provider', 'instructions', 'tools'], 'descriptor')
  const provider = raw.provider
  if (!isRecord(provider)) throw new Error('descriptor.provider is required')
  only(provider, ['id', 'name', 'version', 'description'], 'provider')
  if (typeof provider.id !== 'string' || !PROVIDER_ID.test(provider.id))
    throw new Error('provider.id is not a valid plugin id')
  if (provider.id !== expected.pluginId)
    throw new Error('provider.id does not match the plugin that exposes it')
  const tools = raw.tools
  if (!Array.isArray(tools) || tools.length > MAX_TOOLS)
    throw new Error(`tools must be an array of at most ${MAX_TOOLS}`)
  const parsed = tools.map((tool) =>
    parseTool(tool, provider.id as string, expected),
  )
  if (new Set(parsed.map((tool) => tool.name)).size !== parsed.length)
    throw new Error('duplicate tool name')
  return {
    provider: {
      id: provider.id,
      name: text(provider.name, 'provider.name', 128),
      version: text(provider.version, 'provider.version', 64),
      ...(provider.description === undefined
        ? {}
        : {
            description: text(
              provider.description,
              'provider.description',
              MAX_DESCRIPTION_CHARS,
            ),
          }),
    },
    ...(raw.instructions === undefined
      ? {}
      : {
          instructions: text(
            raw.instructions,
            'instructions',
            MAX_INSTRUCTIONS_CHARS,
          ),
        }),
    tools: parsed,
  }
}
