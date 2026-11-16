// eslint-disable-next-line import/no-extraneous-dependencies -- Reuse Ajv's installed URI resolver for identical relative identifier semantics.
import { resolve as resolveUri } from 'uri-js'

import type { Schema, SchemaValue } from './schemaModel'

type Target = { value: SchemaValue; root: SchemaValue; baseId: string }
const normalize = (id: string) => id.replace(/#\/?$/, '')

function children(schema: Schema): SchemaValue[] {
  return [
    ...Object.values(schema.properties ?? {}),
    ...Object.values(schema.definitions ?? {}),
    ...(Array.isArray(schema.items)
      ? schema.items
      : schema.items !== undefined
        ? [schema.items]
        : []),
    ...(schema.oneOf ?? []),
    ...(schema.anyOf ?? []),
    ...(schema.allOf ?? []),
    ...[
      schema.additionalProperties,
      schema.not,
      schema.if,
      schema.then,
      schema.else,
      schema.propertyNames,
    ].filter((value) => value !== undefined),
  ]
}

export function schemaReferences(
  schema: SchemaValue,
  refs: Schema[],
): (ref: string, root: SchemaValue, baseId: string) => Target {
  const ids = new Map<string, Target>()
  function register(
    value: SchemaValue,
    root: SchemaValue,
    baseId: string,
  ): void {
    if (typeof value === 'boolean') return
    const id = value.$id ? normalize(resolveUri(baseId, value.$id)) : baseId
    if (value.$id) ids.set(id, { value, root, baseId: id })
    children(value).forEach((child) => register(child, root, id))
  }
  for (const root of [schema, ...refs]) register(root, root, '')
  function resolve(ref: string, root: SchemaValue, baseId: string): Target {
    if (ref === '#' || ref === '#/')
      return {
        value: root,
        root,
        baseId: typeof root === 'object' ? (root.$id ?? '') : '',
      }
    const absolute = normalize(resolveUri(baseId, ref))
    const exact = ids.get(absolute)
    if (exact) return exact
    const [id, pointer = ''] = absolute.split('#')
    const rootId = typeof root === 'object' ? normalize(root.$id ?? '') : ''
    const resource =
      ids.get(id) ??
      (id === rootId ? { value: root, root, baseId: rootId } : undefined)
    if (!resource) throw new Error(`Missing schema reference: ${ref}`)
    let target = resource.value
    let currentRoot = resource.root
    let scope = resource.baseId
    for (const part of pointer.split('/').slice(1)) {
      const key = decodeURIComponent(part)
        .replace(/~1/g, '/')
        .replace(/~0/g, '~')
      target = (target as Record<string, SchemaValue>)[key]
      if (target === undefined)
        throw new Error(`Missing schema reference: ${ref}`)
      if (
        typeof target === 'object' &&
        !['properties', 'definitions', 'enum'].includes(key)
      ) {
        if (target.$id) scope = normalize(resolveUri(scope, target.$id))
        if (target.$ref) {
          const redirected = resolve(target.$ref, currentRoot, scope)
          target = redirected.value
          currentRoot = redirected.root
          scope = redirected.baseId
        }
      }
    }
    return { value: target, root: currentRoot, baseId: scope }
  }
  return resolve
}

export function schemaScope(baseId: string, schema: SchemaValue): string {
  return typeof schema === 'object' && schema.$id
    ? normalize(resolveUri(baseId, schema.$id))
    : baseId
}
