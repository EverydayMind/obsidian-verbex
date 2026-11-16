import type { JsonObject } from './protocol'

/**
 * Drop top-level `null` values of optional arguments, so a model that fills
 * unused optional arguments with null is treated as having omitted them.
 * Required, unknown and `type: 'null'` arguments keep their null and are
 * still validated as before. The input object is not changed.
 */
export function dropNullOptionalArgs(
  args: JsonObject,
  schema: JsonObject,
): JsonObject {
  const properties = (schema.properties ?? {}) as Record<string, JsonObject>
  const required = (schema.required ?? []) as string[]
  return Object.fromEntries(
    Object.entries(args).filter(
      ([key, value]) =>
        value !== null ||
        !Object.prototype.hasOwnProperty.call(properties, key) ||
        required.includes(key) ||
        properties[key].type === 'null',
    ),
  )
}
