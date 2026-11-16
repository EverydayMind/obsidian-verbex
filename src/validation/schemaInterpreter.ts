import type { Options, ValidateFunction } from 'ajv'
import formatsFactory from 'ajv/lib/compile/formats'
import ucs2length from 'ajv/lib/compile/ucs2length'
// eslint-disable-next-line import/no-extraneous-dependencies -- Ajv's pinned existing equality helper preserves const/enum semantics.
import equal from 'fast-deep-equal'

import { composites } from './schemaComposites'
import { dataPath, error, matchesType } from './schemaModel'
import type { Plan, Schema, SchemaValue, State } from './schemaModel'
import { objectRules } from './schemaObjects'
import { assertSchema, prepareSchema } from './schemaPlan'

type Format = RegExp | ((data: string) => boolean)
const formats = formatsFactory
const unicodeLength = ucs2length

// Each validator owns mutable errors; schema preparation happens at first call.
export function createSchemaValidator(
  schema: SchemaValue,
  options: Options = {},
  refs: Schema[] = [],
): ValidateFunction {
  assertSchema(schema)
  refs.forEach(assertSchema)
  let prepared: Plan | undefined
  let formatMap: Record<string, Format>
  function visit(
    plan: Plan,
    data: unknown,
    path: string,
    state: State,
  ): boolean {
    const start = state.errors.length
    const stopped = () => !state.allErrors && state.errors.length > start
    const add = (
      keyword: string,
      params: Record<string, unknown>,
      message: string,
    ) => error(state, plan, path, keyword, params, message)
    if (typeof plan.schema === 'boolean') {
      if (!plan.schema) add('false schema', {}, 'boolean schema is false')
      return state.errors.length === start
    }
    const s = plan.schema
    const deferred = plan.deferredType
    const wrongType =
      plan.types.length &&
      !plan.types.some((type) => matchesType(type, data, options.strictNumbers))
    const typeError = () => {
      const type = plan.types.join(',')
      add('type', { type }, `should be ${type}`)
    }
    if (wrongType && !deferred) typeError()
    if (stopped()) return false
    if (plan.ref) {
      if (plan.inlineRef) visit(plan.ref, data, path, state)
      else {
        const referenced: State = {
          errors: [],
          options,
          allErrors: !!options.allErrors,
          silent: state.silent,
        }
        visit(plan.ref, data, path, referenced)
        state.errors.push(...referenced.errors)
      }
      return state.errors.length === start
    }
    if (wrongType && deferred === 'number') typeError()
    if (stopped()) return false
    if (
      plan.numberRules &&
      matchesType('number', data, options.strictNumbers)
    ) {
      const number = data as number
      for (const key of ['maximum', 'minimum'] as const) {
        const limit = s[key]
        if (limit === undefined) continue
        if (
          Number.isNaN(number) ||
          (key === 'maximum' ? number > limit : number < limit)
        ) {
          const comparison = key === 'maximum' ? '<=' : '>='
          add(
            key,
            { comparison, limit, exclusive: false },
            `should be ${comparison} ${limit}`,
          )
        }
        if (stopped()) return false
      }
      if (s.multipleOf !== undefined) {
        const division = number / s.multipleOf
        if (division !== parseInt(String(division)))
          add(
            'multipleOf',
            { multipleOf: s.multipleOf },
            `should be multiple of ${s.multipleOf}`,
          )
        if (stopped()) return false
      }
    }
    if (wrongType && deferred === 'string') typeError()
    if (stopped()) return false
    if (plan.stringRules && typeof data === 'string') {
      for (const key of ['maxLength', 'minLength'] as const) {
        const limit = s[key]
        if (
          limit !== undefined &&
          (key === 'maxLength'
            ? unicodeLength(data) > limit
            : unicodeLength(data) < limit)
        )
          add(
            key,
            { limit },
            `should NOT be ${key === 'maxLength' ? 'longer' : 'shorter'} than ${limit} characters`,
          )
        if (stopped()) return false
      }
      if (plan.pattern && !plan.pattern.test(data))
        add(
          'pattern',
          { pattern: s.pattern },
          `should match pattern "${s.pattern ?? ''}"`,
        )
      if (stopped()) return false
      if (s.format) {
        const format = formatMap[s.format]
        if (!format) throw new Error(`Unknown schema format: ${s.format}`)
        if (!(typeof format === 'function' ? format(data) : format.test(data)))
          add(
            'format',
            { format: s.format },
            `should match format "${s.format}"`,
          )
        if (stopped()) return false
      }
    }
    if (wrongType && deferred === 'array') typeError()
    if (stopped()) return false
    if (plan.arrayRules && Array.isArray(data)) {
      for (const key of ['maxItems', 'minItems'] as const) {
        const limit = s[key]
        if (
          limit !== undefined &&
          (key === 'maxItems' ? data.length > limit : data.length < limit)
        )
          add(
            key,
            { limit },
            `should NOT have ${key === 'maxItems' ? 'more' : 'fewer'} than ${limit} items`,
          )
        if (stopped()) return false
      }
      for (let i = 0; i < data.length; i++) {
        const item = plan.children.items ?? plan.children[`items/${i}`]
        if (item) visit(item, data[i], dataPath(path, i, options), state)
        if (stopped()) return false
      }
      if (s.uniqueItems) {
        const type =
          !Array.isArray(s.items) && typeof s.items === 'object'
            ? s.items.type
            : undefined
        const types = type ? (Array.isArray(type) ? type : [type]) : []
        const primitive =
          types.length > 0 &&
          !types.includes('object') &&
          !types.includes('array')
        let pair: [number, number] | undefined
        if (primitive) {
          const indices: Record<string, number> = {}
          for (let i = data.length - 1; i >= 0; i--) {
            const item: unknown = data[i]
            if (!types.some((t) => matchesType(t, item, options.strictNumbers)))
              continue
            const key =
              Array.isArray(type) && typeof item === 'string'
                ? `"${item}`
                : String(item)
            if (typeof indices[key] === 'number') {
              pair = [i, indices[key]]
              break
            }
            indices[key] = i
          }
        } else {
          outer: for (let i = data.length - 1; i >= 0; i--)
            for (let j = i - 1; j >= 0; j--)
              if (equal(data[i], data[j])) {
                pair = [i, j]
                break outer
              }
        }
        if (pair)
          add(
            'uniqueItems',
            { i: pair[0], j: pair[1] },
            `should NOT have duplicate items (items ## ${pair[1]} and ${pair[0]} are identical)`,
          )
        if (stopped()) return false
      }
    }
    if (wrongType && deferred === 'object') typeError()
    if (stopped()) return false
    if (plan.objectRules && matchesType('object', data)) {
      objectRules(plan, data as Record<string, unknown>, path, state, visit)
      if (stopped()) return false
    }
    if ('const' in s && !equal(data, s.const))
      add('const', { allowedValue: s.const }, 'should be equal to constant')
    if (stopped()) return false
    if (s.enum && !s.enum.some((value) => equal(data, value)))
      add(
        'enum',
        { allowedValues: s.enum },
        'should be equal to one of the allowed values',
      )
    if (stopped()) return false
    if (plan.compositeRules) composites(plan, data, path, state, visit)
    return state.errors.length === start
  }
  const validate = ((data: unknown, path?: string) => {
    if (!prepared) {
      prepared = prepareSchema(schema, refs)
      formatMap = formats(options.format)
    }
    const state: State = { errors: [], options, allErrors: !!options.allErrors }
    const valid = visit(prepared, data, path ?? '', state)
    validate.errors = state.errors.length ? state.errors : null
    return valid
  }) as ValidateFunction
  validate.schema = schema
  validate.errors = null
  return validate
}
