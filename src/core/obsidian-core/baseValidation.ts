import { parseYaml } from 'obsidian'

import { L } from '../../i18n/modelText'

const RESERVED_VIEW_TYPE = 'verbex-reader'
const FILTER_GROUP_KEYS = new Set(['and', 'or', 'not'])
const SORT_DIRECTIONS = new Set(['ASC', 'DESC'])
const TWO_CHAR_OPS = new Set(['==', '!=', '>=', '<=', '&&', '||'])
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '>', '<'])
const TRAILING_BINARY_OPS = new Set([...TWO_CHAR_OPS, ...ONE_CHAR_OPS])
const MATCHING_OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateExpression(expr: string, loc: string, errors: string[]): void {
  if (expr.trim().length === 0) {
    errors.push(
      L({
        ko: `${loc}: 식이 비어 있습니다.`,
        en: `${loc}: expression must not be empty.`,
      }),
    )
    return
  }

  let quote: '"' | "'" | null = null
  const stack: string[] = []
  let lastToken = ''

  for (let i = 0; i < expr.length; i += 1) {
    const c = expr[i]
    if (quote) {
      if (c === '\\' && i + 1 < expr.length) {
        i += 1
        continue
      }
      if (c === quote) {
        quote = null
        lastToken = 'quoted'
      }
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      stack.push(c)
      lastToken = c
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      const expected = MATCHING_OPEN[c]
      if (stack.length === 0 || stack[stack.length - 1] !== expected) {
        errors.push(
          L({
            ko: `${loc}: 짝이 맞지 않는 닫는 괄호 '${c}'가 있습니다.`,
            en: `${loc}: unmatched closing bracket '${c}'.`,
          }),
        )
        return
      }
      stack.pop()
      lastToken = c
      continue
    }
    if (/\s/.test(c)) continue
    const two = expr.slice(i, i + 2)
    if (TWO_CHAR_OPS.has(two)) {
      lastToken = two
      i += 1
      continue
    }
    if (ONE_CHAR_OPS.has(c)) {
      lastToken = c
      continue
    }
    lastToken = 'other'
  }

  if (quote !== null) {
    errors.push(
      L({
        ko: `${loc}: 닫히지 않은 따옴표(${quote})가 있습니다.`,
        en: `${loc}: unclosed quote (${quote}).`,
      }),
    )
    return
  }
  if (stack.length > 0) {
    const open = stack[stack.length - 1]
    errors.push(
      L({
        ko: `${loc}: 닫히지 않은 괄호 '${open}'가 있습니다.`,
        en: `${loc}: unclosed bracket '${open}'.`,
      }),
    )
    return
  }
  if (TRAILING_BINARY_OPS.has(lastToken)) {
    errors.push(
      L({
        ko: `${loc}: 식이 이항 연산자 '${lastToken}'로 끝납니다.`,
        en: `${loc}: expression ends with binary operator '${lastToken}'.`,
      }),
    )
  }
}

function validateFilterNode(
  node: unknown,
  loc: string,
  errors: string[],
): void {
  if (typeof node === 'string') {
    validateExpression(node, loc, errors)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      validateFilterNode(item, `${loc}[${index}]`, errors),
    )
    return
  }
  if (isPlainObject(node)) {
    const keys = Object.keys(node)
    if (keys.length === 0 || keys.some((key) => !FILTER_GROUP_KEYS.has(key))) {
      errors.push(
        L({
          ko: `${loc}: filters 객체는 and, or, not 키만 가질 수 있습니다.`,
          en: `${loc}: filter object may only contain and, or, or not keys.`,
        }),
      )
      return
    }
    for (const key of keys) {
      const branch = node[key]
      if (!Array.isArray(branch)) {
        errors.push(
          L({
            ko: `${loc}.${key}: 목록(배열)이어야 합니다.`,
            en: `${loc}.${key}: must be a list.`,
          }),
        )
        continue
      }
      branch.forEach((item, index) =>
        validateFilterNode(item, `${loc}.${key}[${index}]`, errors),
      )
    }
    return
  }
  errors.push(
    L({
      ko: `${loc}: 필터는 문자열, 목록, 또는 and/or/not 객체여야 합니다.`,
      en: `${loc}: filter must be a string, list, or and/or/not object.`,
    }),
  )
}

function validateSortItem(item: unknown, loc: string, errors: string[]): void {
  if (!isPlainObject(item)) {
    errors.push(
      L({
        ko: `${loc}: 객체여야 합니다.`,
        en: `${loc}: must be an object.`,
      }),
    )
    return
  }
  if (typeof item.property !== 'string' || item.property.trim().length === 0) {
    errors.push(
      L({
        ko: `${loc}.property: 비어 있지 않은 문자열이어야 합니다.`,
        en: `${loc}.property: must be a non-empty string.`,
      }),
    )
  }
  if (
    item.direction !== undefined &&
    (typeof item.direction !== 'string' || !SORT_DIRECTIONS.has(item.direction))
  ) {
    errors.push(
      L({
        ko: `${loc}.direction: 'ASC' 또는 'DESC'여야 합니다.`,
        en: `${loc}.direction: must be 'ASC' or 'DESC'.`,
      }),
    )
  }
}

function validateView(view: unknown, loc: string, errors: string[]): void {
  if (!isPlainObject(view)) {
    errors.push(
      L({
        ko: `${loc}: view 항목은 객체여야 합니다.`,
        en: `${loc}: view entry must be an object.`,
      }),
    )
    return
  }
  if (typeof view.type !== 'string' || view.type.trim().length === 0) {
    errors.push(
      L({
        ko: `${loc}.type: 비어 있지 않은 문자열이어야 합니다.`,
        en: `${loc}.type: must be a non-empty string.`,
      }),
    )
  } else if (view.type.trim() === RESERVED_VIEW_TYPE) {
    errors.push(
      L({
        ko: `${loc}.type: '${RESERVED_VIEW_TYPE}'는 Verbex 내부 읽기 전용 형식이라 저장할 수 없습니다.`,
        en: `${loc}.type: '${RESERVED_VIEW_TYPE}' is reserved for Verbex internal reading and cannot be saved.`,
      }),
    )
  }
  if (view.filters !== undefined) {
    validateFilterNode(view.filters, `${loc}.filters`, errors)
  }
  if (view.sort !== undefined) {
    if (!Array.isArray(view.sort)) {
      errors.push(
        L({
          ko: `${loc}.sort: 목록(배열)이어야 합니다.`,
          en: `${loc}.sort: must be a list.`,
        }),
      )
    } else {
      view.sort.forEach((item, index) =>
        validateSortItem(item, `${loc}.sort[${index}]`, errors),
      )
    }
  }
  if (view.groupBy !== undefined) {
    validateSortItem(view.groupBy, `${loc}.groupBy`, errors)
  }
  if (view.order !== undefined) {
    if (
      !Array.isArray(view.order) ||
      view.order.some(
        (item) => typeof item !== 'string' || item.trim().length === 0,
      )
    ) {
      errors.push(
        L({
          ko: `${loc}.order: 문자열 목록이어야 합니다.`,
          en: `${loc}.order: must be a list of strings.`,
        }),
      )
    }
  }
}

export function validateBaseDefinition(yamlText: string): { errors: string[] } {
  const errors: string[] = []
  let parsed: unknown
  try {
    parsed = parseYaml(yamlText)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    errors.push(
      L({
        ko: `YAML 구문 오류: ${detail}`,
        en: `YAML syntax error: ${detail}`,
      }),
    )
    return { errors }
  }
  if (!isPlainObject(parsed)) {
    errors.push(
      L({
        ko: '최상위 값은 YAML 매핑(객체)이어야 합니다.',
        en: 'Top-level value must be a YAML mapping (object).',
      }),
    )
    return { errors }
  }

  if (parsed.filters !== undefined) {
    validateFilterNode(parsed.filters, 'filters', errors)
  }

  if (parsed.formulas !== undefined) {
    if (!isPlainObject(parsed.formulas)) {
      errors.push(
        L({
          ko: 'formulas: 문자열 값을 가진 매핑(객체)이어야 합니다.',
          en: 'formulas: must be a mapping of string expressions.',
        }),
      )
    } else {
      for (const [key, value] of Object.entries(parsed.formulas)) {
        if (typeof value !== 'string') {
          errors.push(
            L({
              ko: `formulas.${key}: 문자열이어야 합니다.`,
              en: `formulas.${key}: must be a string.`,
            }),
          )
        } else {
          validateExpression(value, `formulas.${key}`, errors)
        }
      }
    }
  }

  if (parsed.views !== undefined) {
    if (!Array.isArray(parsed.views)) {
      errors.push(
        L({
          ko: 'views: 목록(배열)이어야 합니다.',
          en: 'views: must be a list.',
        }),
      )
    } else {
      parsed.views.forEach((view, index) =>
        validateView(view, `views[${index}]`, errors),
      )
    }
  }

  return { errors }
}
