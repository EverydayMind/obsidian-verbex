import { L } from '../../i18n/modelText'

import type { JsonObject, JsonValue } from './protocol'

const TYPES = new Set([
  'object',
  'array',
  'string',
  'integer',
  'number',
  'boolean',
  'null',
])
const KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'description',
])
export const MAX_SCHEMA_DEPTH = 8

const isRecord = (value: unknown): value is JsonObject =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const has = (object: object, key: string): boolean =>
  Object.getOwnPropertyDescriptor(object, key) !== undefined
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/**
 * The supported JSON Schema subset: single `type`, closed objects, no $ref,
 * pattern, format or combinators. Returns the first problem, or undefined.
 */
export function schemaProblem(
  schema: JsonValue,
  path = '$',
  depth = 0,
): string | undefined {
  if (depth > MAX_SCHEMA_DEPTH) return `${path}: schema too deep`
  if (!isRecord(schema)) return `${path}: schema must be an object`
  for (const key of Object.keys(schema))
    if (!KEYWORDS.has(key)) return `${path}: unsupported keyword ${key}`
  if (typeof schema.type !== 'string' || !TYPES.has(schema.type))
    return `${path}: type must be one supported type`
  if (
    schema.description !== undefined &&
    typeof schema.description !== 'string'
  )
    return `${path}: description must be a string`
  for (const key of ['minimum', 'maximum'] as const)
    if (schema[key] !== undefined && typeof schema[key] !== 'number')
      return `${path}: ${key} must be a number`
  for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems'] as const)
    if (schema[key] !== undefined && !isCount(schema[key]))
      return `${path}: ${key} must be a non-negative integer`
  if (schema.enum !== undefined && !Array.isArray(schema.enum))
    return `${path}: enum must be an array`
  if (schema.type === 'object') {
    if (schema.additionalProperties !== false)
      return `${path}: objects must set additionalProperties to false`
    const properties = schema.properties ?? {}
    if (!isRecord(properties)) return `${path}: properties must be an object`
    for (const [name, child] of Object.entries(properties)) {
      const problem = schemaProblem(child, `${path}.${name}`, depth + 1)
      if (problem) return problem
    }
    const required = schema.required ?? []
    if (
      !Array.isArray(required) ||
      required.some(
        (name) => typeof name !== 'string' || !has(properties, name),
      )
    )
      return `${path}: required must name declared properties`
  } else if (
    schema.properties !== undefined ||
    schema.required !== undefined ||
    schema.additionalProperties !== undefined
  )
    return `${path}: object keywords on a non-object schema`
  if (schema.type === 'array') {
    if (schema.items === undefined) return `${path}: arrays must declare items`
    return schemaProblem(schema.items, `${path}[]`, depth + 1)
  }
  if (schema.items !== undefined) return `${path}: items on a non-array schema`
  return undefined
}

const same = (left: JsonValue, right: JsonValue): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

// A refused call names what would have been accepted, so the model can fix the argument instead of guessing again.
const MAX_LISTED = 20
const listed = (values: string[]): string =>
  values.length && values.length <= MAX_LISTED
    ? ` (allowed: ${values.join(', ')})`
    : ''

/**
 * Validates arguments with no coercion, defaults or unknown-key removal.
 * Returns the first problem, or undefined when the value conforms.
 */
export function argumentProblem(
  schema: JsonObject,
  value: unknown,
  path = '$',
): string | undefined {
  const type = schema.type as string
  const actual =
    value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : typeof value === 'number' && Number.isInteger(value)
          ? 'integer'
          : typeof value
  if (actual !== type && !(type === 'number' && actual === 'integer'))
    return `${path}: expected ${type}`
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((e) => same(e, value as JsonValue))
  )
    return `${path}: not an allowed value${listed(schema.enum.map((e) => JSON.stringify(e)))}`
  if (schema.const !== undefined && !same(schema.const, value as JsonValue))
    return `${path}: not the required value`
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return `${path}: not a finite number`
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      return `${path}: below minimum ${schema.minimum}`
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      return `${path}: above maximum ${schema.maximum}`
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength)
      return `${path}: too short (min ${schema.minLength})`
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength)
      return `${path}: too long (max ${schema.maxLength})`
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      return `${path}: too few items (min ${schema.minItems})`
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      return `${path}: too many items (max ${schema.maxItems})`
    for (const [index, item] of value.entries()) {
      const problem = argumentProblem(
        schema.items as JsonObject,
        item,
        `${path}[${index}]`,
      )
      if (problem) return problem
    }
  }
  if (type === 'object') {
    const record = value as Record<string, unknown>
    const properties = (schema.properties ?? {}) as Record<string, JsonObject>
    for (const key of Object.keys(record))
      if (!has(properties, key))
        return `${path}: unknown field ${key}${listed(Object.keys(properties))}`
    for (const name of (schema.required ?? []) as string[])
      if (!has(record, name)) return `${path}: missing field ${name}`
    for (const [name, child] of Object.entries(properties)) {
      if (!has(record, name)) continue
      const problem = argumentProblem(child, record[name], `${path}.${name}`)
      if (problem) return problem
    }
  }
  return undefined
}

/**
 * Model-facing argument error. The retry instruction keeps small models from
 * asking the user how to proceed after a copy typo in a hash or path.
 */
export function schemaMismatchMessage(problem: string): string {
  return L({
    ko: `인자가 입력 스키마와 다릅니다: ${problem}. 인자를 고쳐 같은 도구를 다시 호출하십시오. 해시와 경로는 앞선 도구 결과의 값을 글자 그대로 복사하며, 사용자에게 묻지 않습니다.`,
    en: `Arguments do not match the input schema: ${problem}. Correct the arguments and call the same tool again. Copy hashes and paths exactly from the preceding tool results, without asking the user.`,
  })
}

export function argumentSizeMessage(): string {
  return L({
    ko: '인자는 64 KiB 이하의 JSON 객체여야 합니다.',
    en: 'Arguments must be a JSON object of at most 64 KiB.',
  })
}
