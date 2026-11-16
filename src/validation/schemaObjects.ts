import { dataPath, error } from './schemaModel'
import type { Plan, Schema, State, Visit } from './schemaModel'

export function objectRules(
  plan: Plan,
  data: Record<string, unknown>,
  path: string,
  state: State,
  visit: Visit,
): void {
  const schema = plan.schema as Schema
  const start = state.errors.length
  const stopped = () => !state.allErrors && state.errors.length > start
  if (
    schema.maxProperties !== undefined &&
    Object.keys(data).length > schema.maxProperties
  )
    error(
      state,
      plan,
      path,
      'maxProperties',
      { limit: schema.maxProperties },
      `should NOT have more than ${schema.maxProperties} properties`,
    )
  if (stopped()) return
  const missing = (key: string) =>
    error(
      state,
      plan,
      path,
      'required',
      { missingProperty: key },
      `should have required property '${key}'`,
    )
  for (const key of plan.required) {
    if (data[key] === undefined)
      missing(
        !state.allErrors && !state.options.jsonPointers
          ? dataPath('', key, {})
          : key,
      )
    if (stopped()) return
  }
  if (plan.children.propertyNames?.active) {
    for (const key in data) {
      const before = state.errors.length
      if (
        !visit(plan.children.propertyNames, key, path, {
          ...state,
          composite: true,
        })
      ) {
        if (!state.silent)
          for (let i = before; i < state.errors.length; i++)
            state.errors[i].propertyName = key
        error(
          state,
          plan,
          path,
          'propertyNames',
          { propertyName: key },
          `property name '${key}' is invalid`,
        )
        if (stopped()) return
      }
    }
  }
  if (
    schema.additionalProperties === false ||
    plan.children.additionalProperties?.active
  ) {
    for (const key in data) {
      if (plan.propertyKeys.has(key)) continue
      if (schema.additionalProperties === false)
        error(
          state,
          plan,
          path,
          'additionalProperties',
          { additionalProperty: key },
          'should NOT have additional properties',
        )
      else
        visit(
          plan.children.additionalProperties,
          data[key],
          dataPath(path, key, state.options, true),
          state,
        )
      if (stopped()) return
    }
  }
  for (const [key, child] of plan.properties) {
    if (!child.active) continue
    if (data[key] !== undefined)
      visit(child, data[key], dataPath(path, key, state.options), state)
    else if (plan.requiredKeys.has(key)) missing(key)
    if (stopped()) return
  }
}
