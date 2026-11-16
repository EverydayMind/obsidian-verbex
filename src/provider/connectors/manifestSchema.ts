import { z } from 'zod'

const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
export const identifier = z
  .string()
  .max(64)
  .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/)
  .refine((name) => !forbidden.has(name))
const id = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/)
export type ArgumentSchema = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  maxLength?: number
  minLength?: number
  minimum?: number
  maximum?: number
  enum?: (string | number | boolean)[]
  maxItems?: number
  items?: ArgumentSchema
  properties?: Record<string, ArgumentSchema>
  required?: string[]
  additionalProperties?: false
}
const argumentSchema: z.ZodType<ArgumentSchema> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        'string',
        'number',
        'integer',
        'boolean',
        'array',
        'object',
      ]),
      maxLength: z.number().int().min(1).max(40000).optional(),
      minLength: z.number().int().min(0).max(40000).optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      enum: z
        .array(z.union([z.string().max(2000), z.number(), z.boolean()]))
        .min(1)
        .max(100)
        .optional(),
      maxItems: z.number().int().min(1).max(200).optional(),
      items: argumentSchema.optional(),
      properties: z.record(identifier, argumentSchema).optional(),
      required: z.array(identifier).max(32).optional(),
      additionalProperties: z.literal(false).optional(),
    })
    .strict(),
)

function boundedSchema(schema: ArgumentSchema, depth = 0): boolean {
  if (depth > 3) return false
  if (
    schema.type === 'string' &&
    (!schema.maxLength || (schema.minLength ?? 0) > schema.maxLength)
  )
    return false
  if (
    schema.type === 'array' &&
    (!schema.maxItems ||
      !schema.items ||
      !boundedSchema(schema.items, depth + 1))
  )
    return false
  if (schema.type === 'object') {
    if (
      schema.additionalProperties !== false ||
      !schema.properties ||
      Object.keys(schema.properties).length > 32
    )
      return false
    if (
      schema.required?.some(
        (key) =>
          !Object.prototype.hasOwnProperty.call(schema.properties ?? {}, key),
      )
    )
      return false
    if (
      !Object.values(schema.properties).every((entry) =>
        boundedSchema(entry, depth + 1),
      )
    )
      return false
  }
  return (
    schema.minimum === undefined ||
    schema.maximum === undefined ||
    schema.minimum <= schema.maximum
  )
}

export const connectorToolSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]{0,23}$/),
    description: z.string().min(1).max(1500),
    method: identifier,
    effect: z.enum(['read', 'pure']),
    args: z
      .array(
        z.union([
          z.object({ from: identifier }).strict(),
          z.object({ vaultPath: identifier }).strict(),
          z.object({ vaultFile: identifier }).strict(),
          z
            .object({
              const: z.union([
                z.string().max(2000),
                z.number(),
                z.boolean(),
                z.null(),
              ]),
            })
            .strict(),
        ]),
      )
      .max(16),
    inputSchema: argumentSchema.refine(
      (schema) => schema.type === 'object' && boundedSchema(schema),
      'Input schema must be bounded and closed.',
    ),
    result: z
      .object({
        format: z.enum(['text', 'json']),
        pick: z.array(identifier).max(32).optional(),
        maxItems: z.number().int().min(1).max(200).default(50),
        maxChars: z.number().int().min(1).max(40000).default(12000),
        pathField: identifier.optional(),
      })
      .strict(),
    timeoutMs: z.number().int().min(50).max(30000).default(5000),
    routeKeywords: z.array(z.string().min(2).max(80)).max(32).default([]),
    options: z
      .object({
        disabled: z.boolean().default(false),
        agentCallable: z.boolean().default(false),
      })
      .strict()
      .default({ disabled: false, agentCallable: false }),
  })
  .strict()
  .refine(
    (tool) =>
      tool.args.every(
        (arg) =>
          'const' in arg ||
          Object.prototype.hasOwnProperty.call(
            tool.inputSchema.properties ?? {},
            'from' in arg
              ? arg.from
              : 'vaultPath' in arg
                ? arg.vaultPath
                : arg.vaultFile,
          ),
      ),
    'Argument binding is not declared in inputSchema.',
  )
  .refine(
    (tool) =>
      !tool.result.pathField ||
      !tool.result.pick ||
      tool.result.pick.includes(tool.result.pathField),
    'result.pick must retain pathField.',
  )

export const connectorManifestSchema = z
  .object({
    id,
    enabled: z.boolean().default(false),
    target: z
      .object({
        pluginId: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9_-]+$/)
          .refine((value) => !['verbex', 'verbex-agent'].includes(value)),
        access: z.union([
          z
            .object({
              kind: z.literal('pluginProperty'),
              path: z.array(identifier).min(1).max(3),
            })
            .strict(),
          z.object({ kind: z.literal('global'), name: identifier }).strict(),
        ]),
      })
      .strict(),
    approved: z
      .object({
        manifestDigest: z.string().max(100),
        targetVersion: z.string().max(100),
      })
      .strict()
      .optional(),
    tools: z.array(connectorToolSchema).min(1).max(32),
  })
  .strict()
  .refine(
    (manifest) =>
      new Set(manifest.tools.map((tool) => tool.name)).size ===
      manifest.tools.length,
    'Duplicate connector tool name.',
  )
export type ConnectorManifest = z.infer<typeof connectorManifestSchema>
export type ConnectorTool = z.infer<typeof connectorToolSchema>
export const connectorSettingsSchema = z
  .object({
    connectors: z
      .array(connectorManifestSchema)
      .max(32)
      .default([])
      .refine(
        (entries) =>
          new Set(entries.map((entry) => entry.id)).size === entries.length,
        'Duplicate connector id.',
      ),
  })
  .strict()
  .catch({ connectors: [] })
export function connectorToolName(
  manifest: ConnectorManifest,
  tool: ConnectorTool,
): string {
  return `conn__${manifest.id}__${tool.name}`
}
export function approvalPayload(manifest: ConnectorManifest): unknown {
  // Operational toggles may only narrow previously approved capabilities.
  return {
    id: manifest.id,
    target: manifest.target,
    tools: manifest.tools.map(
      ({ options: _options, ...definition }) => definition,
    ),
  }
}

export function validateArguments(
  schema: ArgumentSchema | undefined,
  value: unknown,
): boolean {
  if (!schema) return false
  if (schema.enum && !schema.enum.includes(value as string | number | boolean))
    return false
  switch (schema.type) {
    case 'string':
      return (
        typeof value === 'string' &&
        value.length <= (schema.maxLength ?? 0) &&
        value.length >= (schema.minLength ?? 0)
      )
    case 'boolean':
      return typeof value === 'boolean'
    case 'integer':
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (schema.type !== 'integer' || Number.isInteger(value)) &&
        value >= (schema.minimum ?? -Infinity) &&
        value <= (schema.maximum ?? Infinity)
      )
    case 'array':
      return (
        Array.isArray(value) &&
        value.length <= (schema.maxItems ?? 0) &&
        value.every((item) => validateArguments(schema.items, item))
      )
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return false
      const record = value as Record<string, unknown>
      return (
        Object.keys(record).every(
          (key) =>
            Object.prototype.hasOwnProperty.call(
              schema.properties ?? {},
              key,
            ) && validateArguments(schema.properties?.[key], record[key]),
        ) &&
        (schema.required ?? []).every((key) =>
          Object.prototype.hasOwnProperty.call(record, key),
        )
      )
    }
  }
}
