import type { ErrorObject, Options } from 'ajv'

export type Schema = {
  [keyword: string]: unknown
  $id?: string
  $ref?: string
  type?: string | string[]
  properties?: Record<string, SchemaValue>
  definitions?: Record<string, SchemaValue>
  required?: string[]
  additionalProperties?: SchemaValue
  items?: SchemaValue | SchemaValue[]
  enum?: unknown[]
  const?: unknown
  oneOf?: SchemaValue[]
  anyOf?: SchemaValue[]
  allOf?: SchemaValue[]
  not?: SchemaValue
  if?: SchemaValue
  then?: SchemaValue
  else?: SchemaValue
  propertyNames?: SchemaValue
  pattern?: string
  format?: string
  minimum?: number
  maximum?: number
  multipleOf?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  maxProperties?: number
  uniqueItems?: boolean
}
export type SchemaValue = Schema | boolean
export type Plan = {
  schema: SchemaValue
  path: string
  active: boolean
  children: Record<string, Plan>
  properties: [string, Plan][]
  required: string[]
  propertyKeys: Set<string>
  requiredKeys: Set<string>
  types: string[]
  numberRules: boolean
  stringRules: boolean
  arrayRules: boolean
  objectRules: boolean
  compositeRules: boolean
  deferredType?: string
  pattern?: RegExp
  ref?: Plan
  inlineRef?: boolean
}
export type State = {
  errors: ErrorObject[]
  options: Options
  allErrors: boolean
  composite?: boolean
  halted?: boolean
  silent?: boolean
}
export type Visit = (
  plan: Plan,
  data: unknown,
  path: string,
  state: State,
) => boolean

export function pointer(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1')
}
export function fragment(key: string): string {
  return encodeURIComponent(pointer(key))
}
export function dataPath(
  path: string,
  key: string | number,
  options: Options,
  dynamic = false,
): string {
  if (options.jsonPointers) return `${path}/${pointer(String(key))}`
  if (typeof key === 'number') return `${path}[${key}]`
  if (dynamic) return `${path}['${key}']`
  if (/^[a-z$_][a-z$_0-9]*$/i.test(key)) return `${path}.${key}`
  const escaped = key
    .replace(/'|\\/g, '\\$&')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\f/g, '\\f')
    .replace(/\t/g, '\\t')
  return `${path}['${escaped}']`
}
export function error(
  state: State,
  plan: Plan,
  path: string,
  keyword: string,
  params: Record<string, unknown>,
  message: string,
): void {
  if (!state.allErrors && !state.composite) state.halted = true
  if (state.silent) {
    state.errors.push(suppressedError)
    return
  }
  state.errors.push({
    keyword,
    dataPath: path,
    schemaPath: `${plan.path}/${keyword}`,
    params,
    message,
  })
}
const suppressedError: ErrorObject = {
  keyword: '',
  dataPath: '',
  schemaPath: '',
  params: {},
}
export function matchesType(
  type: string,
  data: unknown,
  strict = false,
): boolean {
  switch (type) {
    case 'null':
      return data === null
    case 'array':
      return Array.isArray(data)
    case 'object':
      return data !== null && typeof data === 'object' && !Array.isArray(data)
    case 'integer':
      return (
        typeof data === 'number' &&
        !(data % 1) &&
        !Number.isNaN(data) &&
        (!strict || Number.isFinite(data))
      )
    case 'number':
      return typeof data === 'number' && (!strict || Number.isFinite(data))
    default:
      return typeof data === type
  }
}
