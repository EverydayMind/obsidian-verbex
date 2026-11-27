import { L } from '../../i18n/modelText'

type CanvasObject = Record<string, unknown>

const NODE_TYPES = ['text', 'file', 'link', 'group']
const SIDES = ['top', 'right', 'bottom', 'left']
const ENDS = ['none', 'arrow']
const BACKGROUND_STYLES = ['cover', 'ratio', 'repeat']
const COLOR = /^(?:[1-6]|#[\da-fA-F]{3}|#[\da-fA-F]{6})$/

function isObject(value: unknown): value is CanvasObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function checkChoice(
  location: string,
  value: unknown,
  choices: string[],
  errors: string[],
): void {
  if (isString(value) && choices.includes(value)) return
  const list = choices.join(', ')
  errors.push(
    L({
      ko: `${location} 값은 다음 중 하나여야 합니다: ${list}.`,
      en: `${location} must be one of: ${list}.`,
    }),
  )
}

function checkString(location: string, value: unknown, errors: string[]): void {
  if (!isString(value))
    errors.push(
      L({
        ko: `${location} 값은 문자열이어야 합니다.`,
        en: `${location} must be a string.`,
      }),
    )
}

function checkUniqueId(
  location: string,
  id: string,
  ids: Set<string>,
  errors: string[],
): void {
  if (ids.has(id))
    errors.push(
      L({
        ko: `${location} '${id}' 값이 중복됩니다.`,
        en: `${location} '${id}' is duplicated.`,
      }),
    )
  ids.add(id)
}

function checkColor(location: string, color: unknown, errors: string[]): void {
  if (color === undefined || (isString(color) && COLOR.test(color))) return
  errors.push(
    L({
      ko: `${location} 값은 문자열 "1"~"6" 또는 #RGB/#RRGGBB여야 합니다.`,
      en: `${location} must be a string "1"–"6" or #RGB/#RRGGBB.`,
    }),
  )
}

function checkNode(
  value: unknown,
  location: string,
  ids: Set<string>,
  errors: string[],
): void {
  if (!isObject(value)) {
    errors.push(
      L({
        ko: `${location} 값은 객체여야 합니다.`,
        en: `${location} must be an object.`,
      }),
    )
    return
  }
  if (isString(value.id) && value.id.length > 0)
    checkUniqueId(`${location}.id`, value.id, ids, errors)
  else
    errors.push(
      L({
        ko: `${location}.id 값은 비어 있지 않은 문자열이어야 합니다.`,
        en: `${location}.id must be a non-empty string.`,
      }),
    )

  checkChoice(`${location}.type`, value.type, NODE_TYPES, errors)
  for (const field of ['x', 'y', 'width', 'height']) {
    if (!Number.isFinite(value[field])) {
      errors.push(
        L({
          ko: `${location}.${field} 값은 유한한 숫자여야 합니다.`,
          en: `${location}.${field} must be a finite number.`,
        }),
      )
    }
  }
  checkColor(`${location}.color`, value.color, errors)
  switch (value.type) {
    case 'text':
      checkString(`${location}.text`, value.text, errors)
      break
    case 'file':
      checkString(`${location}.file`, value.file, errors)
      break
    case 'link':
      checkString(`${location}.url`, value.url, errors)
      break
    case 'group':
      if (value.background !== undefined)
        checkString(`${location}.background`, value.background, errors)
      if (value.backgroundStyle !== undefined)
        checkChoice(
          `${location}.backgroundStyle`,
          value.backgroundStyle,
          BACKGROUND_STYLES,
          errors,
        )
      break
  }
}

function checkEdge(
  value: unknown,
  location: string,
  ids: Set<string>,
  nodeIds: Set<string>,
  errors: string[],
): void {
  if (!isObject(value)) {
    errors.push(
      L({
        ko: `${location} 값은 객체여야 합니다.`,
        en: `${location} must be an object.`,
      }),
    )
    return
  }
  if (isString(value.id)) checkUniqueId(`${location}.id`, value.id, ids, errors)
  else checkString(`${location}.id`, value.id, errors)

  for (const end of ['from', 'to']) {
    const node = value[`${end}Node`]
    const side = value[`${end}Side`]
    const marker = value[`${end}End`]
    if (!isString(node)) checkString(`${location}.${end}Node`, node, errors)
    else if (!nodeIds.has(node)) {
      errors.push(
        L({
          ko: `${location}.${end}Node '${node}'이(가) 가리키는 노드가 없습니다.`,
          en: `${location}.${end}Node '${node}' refers to a missing node.`,
        }),
      )
    }
    if (side !== undefined)
      checkChoice(`${location}.${end}Side`, side, SIDES, errors)
    if (marker !== undefined)
      checkChoice(`${location}.${end}End`, marker, ENDS, errors)
  }
  checkColor(`${location}.color`, value.color, errors)
  if (value.label !== undefined)
    checkString(`${location}.label`, value.label, errors)
}

export function validateCanvasDocument(
  jsonText: string,
  fileExists?: (path: string) => boolean,
): { errors: string[]; warnings?: string[] } {
  let canvas: unknown
  try {
    canvas = JSON.parse(jsonText)
  } catch {
    return {
      errors: [
        L({
          ko: '.canvas 문서에 JSON 구문 오류가 있습니다.',
          en: '.canvas document has invalid JSON syntax.',
        }),
      ],
    }
  }
  if (!isObject(canvas)) {
    return {
      errors: [
        L({
          ko: '.canvas 최상위 값은 JSON 객체여야 합니다.',
          en: '.canvas root must be a JSON object.',
        }),
      ],
    }
  }

  const errors: string[] = []
  const warnings: string[] = []
  for (const field of ['nodes', 'edges']) {
    if (canvas[field] !== undefined && !Array.isArray(canvas[field])) {
      errors.push(
        L({
          ko: `${field} 값은 배열이어야 합니다.`,
          en: `${field} must be an array.`,
        }),
      )
    }
  }
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  const nodes: unknown[] = Array.isArray(canvas.nodes) ? canvas.nodes : []
  const edges: unknown[] = Array.isArray(canvas.edges) ? canvas.edges : []
  nodes.forEach((node, index) => {
    const location = `nodes[${index}]`
    checkNode(node, location, nodeIds, errors)
    if (
      fileExists &&
      isObject(node) &&
      node.type === 'file' &&
      isString(node.file) &&
      !fileExists(node.file)
    ) {
      warnings.push(
        L({
          ko: `${location}.file '${node.file}'이(가) 가리키는 볼트 파일이 없습니다.`,
          en: `${location}.file '${node.file}' refers to a missing Vault file.`,
        }),
      )
    }
  })
  edges.forEach((edge, index) =>
    checkEdge(edge, `edges[${index}]`, edgeIds, nodeIds, errors),
  )
  return warnings.length ? { errors, warnings } : { errors }
}
