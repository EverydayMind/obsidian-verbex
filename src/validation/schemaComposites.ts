import { error } from './schemaModel'
import type { Plan, Schema, State, Visit } from './schemaModel'

export function composites(
  plan: Plan,
  data: unknown,
  path: string,
  state: State,
  visit: Visit,
): void {
  const schema = plan.schema as Schema
  const start = state.errors.length
  const child = (key: string, next = state) =>
    visit(plan.children[key], data, path, next)
  if (schema.not !== undefined) {
    const isolated: State = {
      ...state,
      errors: [],
      allErrors: false,
      silent: true,
    }
    if (child('not', isolated))
      error(state, plan, path, 'not', {}, 'should NOT be valid')
    if (!state.allErrors && state.errors.length > start) return
  }
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const parts = schema[keyword]
    if (!parts) continue
    if (
      keyword === 'anyOf' &&
      parts.some((_part, i) => !plan.children[`${keyword}/${i}`].active)
    )
      continue
    // Successful alternatives discard child errors in Ajv. Probe without
    // allocating those objects, replaying failed alternatives only on failure.
    const probe: State = { ...state, errors: [], composite: true, silent: true }
    let passing: number | number[] | null = null
    for (let i = 0; i < parts.length; i++) {
      if (child(`${keyword}/${i}`, probe)) {
        if (keyword === 'anyOf') {
          passing = i
          break
        }
        if (passing !== null) {
          passing = [passing, i]
          break
        }
        passing = i
      }
    }
    const valid =
      passing !== null && (keyword === 'anyOf' || !Array.isArray(passing))
    if (!valid) {
      if (!state.silent) {
        const collecting: State = { ...state, composite: true }
        const end = Array.isArray(passing) ? passing[1] + 1 : parts.length
        for (let i = 0; i < end; i++) child(`${keyword}/${i}`, collecting)
      }
      error(
        state,
        plan,
        path,
        keyword,
        keyword === 'oneOf' ? { passingSchemas: passing } : {},
        keyword === 'oneOf'
          ? 'should match exactly one schema in oneOf'
          : 'should match some schema in anyOf',
      )
    }
    if (!state.allErrors && state.errors.length > start) return
  }
  if (schema.allOf) {
    for (let i = 0; i < schema.allOf.length; i++) {
      child(`allOf/${i}`)
      if (!state.allErrors && state.errors.length > start) return
    }
  }
  if (
    schema.if !== undefined &&
    (plan.children.then?.active || plan.children.else?.active)
  ) {
    const condition = child('if', {
      ...state,
      errors: [],
      silent: true,
      composite: true,
    })
    const clause = condition ? 'then' : 'else'
    if (plan.children[clause] && !child(clause) && !state.halted)
      error(
        state,
        plan,
        path,
        'if',
        { failingKeyword: clause },
        `should match "${clause}" schema`,
      )
  }
}
