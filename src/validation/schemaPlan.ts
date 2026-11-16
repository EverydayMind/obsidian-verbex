import { fragment } from './schemaModel'
import type { Plan, Schema, SchemaValue } from './schemaModel'
import { schemaReferences, schemaScope } from './schemaReferences'

const annotations = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'default',
  'examples',
  '$comment',
  'readOnly',
  'writeOnly',
  'contentMediaType',
  'contentEncoding',
  'definitions',
])
const keywords = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  '$ref',
  'pattern',
  'minimum',
  'maximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'format',
  'if',
  'then',
  'else',
  'propertyNames',
  'maxProperties',
  'uniqueItems',
])
const single = [
  'additionalProperties',
  'not',
  'if',
  'then',
  'else',
  'propertyNames',
] as const
const lists = ['oneOf', 'anyOf', 'allOf'] as const
const groups: Record<string, string[]> = {
  number: ['maximum', 'minimum', 'multipleOf', 'format'],
  string: ['maxLength', 'minLength', 'pattern', 'format'],
  array: ['maxItems', 'minItems', 'items', 'uniqueItems'],
  object: [
    'maxProperties',
    'required',
    'propertyNames',
    'properties',
    'additionalProperties',
  ],
}

export function active(schema: SchemaValue): boolean {
  return (
    schema === false ||
    (typeof schema === 'object' &&
      Object.keys(schema).some(
        (key) => keywords.has(key) && key !== 'then' && key !== 'else',
      ))
  )
}

// Called at validator creation, separately from lazy reference/RegExp preparation.
export function assertSchema(schema: SchemaValue): void {
  if (typeof schema === 'boolean') return
  for (const key of Object.keys(schema)) {
    if (!keywords.has(key) && !annotations.has(key))
      throw new Error(`Unknown schema keyword: ${key}`)
  }
  for (const map of [schema.properties, schema.definitions]) {
    if (map) for (const child of Object.values(map)) assertSchema(child)
  }
  for (const key of single)
    if (schema[key] !== undefined) assertSchema(schema[key])
  for (const key of lists) schema[key]?.forEach(assertSchema)
  if (Array.isArray(schema.items)) schema.items.forEach(assertSchema)
  else if (schema.items !== undefined) assertSchema(schema.items)
}

function hasRef(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(
    ([key, child]) => key === '$ref' || hasRef(child),
  )
}

export function prepareSchema(schema: SchemaValue, refs: Schema[]): Plan {
  const resolve = schemaReferences(schema, refs)
  const cache = new Map<SchemaValue, Map<string, Plan>>()
  function prepare(
    value: SchemaValue,
    root: SchemaValue,
    path: string,
    inheritedId = '',
    scopeApplied = false,
  ): Plan {
    const baseId = scopeApplied ? inheritedId : schemaScope(inheritedId, value)
    const cacheKey = `${baseId}|${path}`
    let paths = cache.get(value)
    if (!paths) {
      paths = new Map()
      cache.set(value, paths)
    }
    const existing = paths.get(cacheKey)
    if (existing) return existing
    const plan: Plan = {
      schema: value,
      path,
      active: active(value),
      children: Object.create(null) as Record<string, Plan>,
      properties: [],
      required: [],
      propertyKeys: new Set(),
      requiredKeys: new Set(),
      types: [],
      numberRules: false,
      stringRules: false,
      arrayRules: false,
      objectRules: false,
      compositeRules: false,
    }
    paths.set(cacheKey, plan)
    if (typeof value === 'boolean') return plan
    plan.numberRules = groups.number.some((key) => value[key] !== undefined)
    plan.stringRules = groups.string.some((key) => value[key] !== undefined)
    plan.arrayRules = groups.array.some((key) => value[key] !== undefined)
    plan.objectRules = groups.object.some((key) => value[key] !== undefined)
    plan.compositeRules = ['not', 'anyOf', 'oneOf', 'allOf', 'if'].some(
      (key) => value[key] !== undefined,
    )
    plan.types = value.type
      ? Array.isArray(value.type)
        ? value.type
        : [value.type]
      : []
    const type = plan.types.length === 1 ? plan.types[0] : undefined
    if (type && groups[type]?.some((key) => value[key] !== undefined))
      plan.deferredType = type
    plan.requiredKeys = new Set(value.required)
    if (value.pattern !== undefined) plan.pattern = new RegExp(value.pattern)
    if (value.$ref) {
      const target = resolve(value.$ref, root, baseId)
      const inline =
        value.$ref !== '#' && value.$ref !== '#/' && !hasRef(target.value)
      plan.ref = prepare(
        target.value,
        target.root,
        inline ? value.$ref : '#',
        target.baseId,
        true,
      )
      plan.inlineRef = inline
      return plan
    }
    for (const key of single)
      if (value[key] !== undefined)
        plan.children[key] = prepare(value[key], root, `${path}/${key}`, baseId)
    for (const key of lists)
      value[key]?.forEach((child, i) => {
        plan.children[`${key}/${i}`] = prepare(
          child,
          root,
          `${path}/${key}/${i}`,
          baseId,
        )
      })
    if (Array.isArray(value.items))
      value.items.forEach((child, i) => {
        plan.children[`items/${i}`] = prepare(
          child,
          root,
          `${path}/items/${i}`,
          baseId,
        )
      })
    else if (value.items !== undefined)
      plan.children.items = prepare(value.items, root, `${path}/items`, baseId)
    for (const [key, child] of Object.entries(value.properties ?? {})) {
      if (key !== '__proto__')
        plan.properties.push([
          key,
          prepare(child, root, `${path}/properties/${fragment(key)}`, baseId),
        ])
    }
    plan.required = (value.required ?? []).filter(
      (key) =>
        !plan.properties.some(([name, child]) => name === key && child.active),
    )
    plan.propertyKeys = new Set(plan.properties.map(([key]) => key))
    return plan
  }
  return prepare(schema, schema, '#')
}
