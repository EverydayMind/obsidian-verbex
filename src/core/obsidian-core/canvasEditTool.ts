import { normalizePath } from 'obsidian'

import { L } from '../../i18n/modelText'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import {
  type ToolArgs,
  type ToolExecutionContext,
  type ToolResult,
  changeHelper,
  str,
} from '../tools/localToolCommon'

import {
  type CanvasObject,
  type CanvasRect,
  detectCanvasJsonFormat,
  hasRect,
  isCanvasObject,
  readCanvasTarget,
  rectContains,
  rectsOverlap,
  serializeCanvasJson,
  singleLinePreview,
} from './canvasCommon'
import { validateCanvasDocument } from './canvasValidation'
import { exactVaultFile } from './exactVaultFile'

const ALLOWED_OPS = [
  'add_text',
  'add_file',
  'add_edge',
  'update_text',
  'remove_node',
  'remove_edge',
] as const

const COLOR_RE = /^(?:[1-6]|#[\da-fA-F]{3}|#[\da-fA-F]{6})$/
const TEXT_WIDTH = 250
const TEXT_HEIGHT = 60
const DEFAULT_FILE_WIDTH = 400
const DEFAULT_FILE_HEIGHT = 400
const PLACE_GAP_X = 80
const PLACE_STEP_Y = 40
const MAX_SHIFT_STEPS = 10_000

export type EditCanvasOptions = {
  random?: () => number
}

function defaultRandom(): number {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint32Array(1)
    globalThis.crypto.getRandomValues(buf)
    return buf[0] / 0x100000000
  }
  return Math.random()
}

export function generateUniqueCanvasId(
  existingIds: ReadonlySet<string>,
  random: () => number = defaultRandom,
): string {
  for (let attempt = 0; attempt < 1024; attempt += 1) {
    let id = ''
    for (let i = 0; i < 16; i += 1) {
      const clamped = Math.max(0, Math.min(0.9999999999, random()))
      id += Math.floor(clamped * 16).toString(16)
    }
    if (!existingIds.has(id)) return id
  }
  throw new Error('Could not generate a unique canvas id.')
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function fileNodeSize(nodes: readonly CanvasObject[]): {
  width: number
  height: number
} {
  const widths: number[] = []
  const heights: number[] = []
  for (const node of nodes) {
    if (
      node.type === 'file' &&
      Number.isFinite(node.width) &&
      Number.isFinite(node.height) &&
      (node.width as number) > 0 &&
      (node.height as number) > 0
    ) {
      widths.push(node.width as number)
      heights.push(node.height as number)
    }
  }
  if (widths.length === 0) {
    return { width: DEFAULT_FILE_WIDTH, height: DEFAULT_FILE_HEIGHT }
  }
  return { width: median(widths), height: median(heights) }
}

function resolveNodeTarget(
  token: string,
  nodes: readonly CanvasObject[],
  refs: ReadonlyMap<string, string>,
  location: string,
  field: string,
): { node: CanvasObject } | { error: string } {
  const byId = nodes.find((node) => node.id === token)
  if (byId) return { node: byId }

  const refId = refs.get(token)
  if (refId) {
    const byRef = nodes.find((node) => node.id === refId)
    if (byRef) return { node: byRef }
  }

  const normalized = normalizePath(token)
  const byFile = nodes.filter(
    (node) =>
      node.type === 'file' &&
      typeof node.file === 'string' &&
      (node.file === token || normalizePath(node.file) === normalized),
  )
  if (byFile.length === 1) return { node: byFile[0] }
  if (byFile.length > 1) {
    const ids = byFile
      .map((n) => (typeof n.id === 'string' ? n.id : ''))
      .join(', ')
    return {
      error: L({
        ko: `${location}.${field}: 파일 '${token}'을(를) 가리키는 파일 노드가 여러 개입니다(${ids}). 노드 id로 지정하세요.`,
        en: `${location}.${field}: multiple file nodes refer to '${token}' (${ids}). Specify a node id instead.`,
      }),
    }
  }
  return {
    error: L({
      ko: `${location}.${field}: '${token}'에 해당하는 노드 id·ref·파일 노드를 찾지 못했습니다.`,
      en: `${location}.${field}: no node id, ref, or file node matches '${token}'.`,
    }),
  }
}

function computePlacement(
  nodes: readonly CanvasObject[],
  width: number,
  height: number,
  nearNode: CanvasObject | null,
): { x: number; y: number } {
  let x = 0
  let y = 0
  const positioned = nodes.filter(hasRect)
  if (nearNode && hasRect(nearNode)) {
    x = nearNode.x + nearNode.width + PLACE_GAP_X
    y = nearNode.y
  } else if (positioned.length > 0) {
    x = Math.max(...positioned.map((n) => n.x + n.width)) + PLACE_GAP_X
    y = Math.min(...positioned.map((n) => n.y))
  }

  const obstacles = positioned.filter(
    (node) =>
      !(
        node.type === 'group' &&
        nearNode &&
        hasRect(nearNode) &&
        rectContains(node, nearNode)
      ),
  )

  for (let step = 0; step < MAX_SHIFT_STEPS; step += 1) {
    const candidate: CanvasRect = { x, y, width, height }
    const collides = obstacles.some((obstacle) =>
      rectsOverlap(candidate, obstacle),
    )
    if (!collides) break
    y += height + PLACE_STEP_Y
  }

  return { x, y }
}

function validateOptionalColor(
  value: unknown,
  location: string,
): { ok: true; color?: string } | { ok: false; error: string } {
  if (value === undefined) return { ok: true }
  if (typeof value === 'string' && COLOR_RE.test(value)) {
    return { ok: true, color: value }
  }
  return {
    ok: false,
    error: L({
      ko: `${location}.color 값은 문자열 "1"~"6" 또는 #RGB/#RRGGBB여야 합니다.`,
      en: `${location}.color must be "1"-"6" or #RGB/#RRGGBB.`,
    }),
  }
}

function validateOptionalRef(
  value: unknown,
  refs: ReadonlyMap<string, string>,
  location: string,
): { ok: true; ref?: string } | { ok: false; error: string } {
  if (value === undefined) return { ok: true }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      ok: false,
      error: L({
        ko: `${location}.ref는 비어 있지 않은 문자열이어야 합니다.`,
        en: `${location}.ref must be a non-empty string.`,
      }),
    }
  }
  if (refs.has(value)) {
    return {
      ok: false,
      error: L({
        ko: `${location}.ref '${value}'가 중복됩니다.`,
        en: `${location}.ref '${value}' is duplicated.`,
      }),
    }
  }
  return { ok: true, ref: value }
}

export async function executeEditCanvasTool(
  args: ToolArgs,
  ctx: ToolExecutionContext,
  options?: EditCanvasOptions,
): Promise<ToolResult> {
  const target = await readCanvasTarget('edit_canvas', str(args, 'path'), ctx)
  if ('kind' in target) return target

  if (!Array.isArray(args.operations) || args.operations.length === 0) {
    return {
      kind: 'error',
      message: L({
        ko: 'edit_canvas는 비어 있지 않은 operations 배열이 필요합니다.',
        en: 'edit_canvas requires a non-empty "operations" array.',
      }),
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(target.before)
  } catch {
    return {
      kind: 'error',
      message: L({
        ko: '.canvas 문서를 JSON으로 해석할 수 없습니다.',
        en: 'Could not parse .canvas document as JSON.',
      }),
    }
  }
  if (!isCanvasObject(parsed)) {
    return {
      kind: 'error',
      message: L({
        ko: '.canvas 최상위 값은 JSON 객체여야 합니다.',
        en: '.canvas root must be a JSON object.',
      }),
    }
  }
  if (parsed.nodes !== undefined && !Array.isArray(parsed.nodes)) {
    return {
      kind: 'error',
      message: L({
        ko: '.canvas의 nodes 값이 배열이 아닙니다.',
        en: '.canvas "nodes" must be an array.',
      }),
    }
  }
  if (parsed.edges !== undefined && !Array.isArray(parsed.edges)) {
    return {
      kind: 'error',
      message: L({
        ko: '.canvas의 edges 값이 배열이 아닙니다.',
        en: '.canvas "edges" must be an array.',
      }),
    }
  }

  const nodes: CanvasObject[] = Array.isArray(parsed.nodes)
    ? (parsed.nodes as CanvasObject[])
    : []
  const edges: CanvasObject[] = Array.isArray(parsed.edges)
    ? (parsed.edges as CanvasObject[])
    : []

  const existingIds = new Set<string>()
  for (const node of nodes) {
    if (isCanvasObject(node) && typeof node.id === 'string') {
      existingIds.add(node.id)
    }
  }
  for (const edge of edges) {
    if (isCanvasObject(edge) && typeof edge.id === 'string') {
      existingIds.add(edge.id)
    }
  }

  const refs = new Map<string, string>()
  const summaryLines: string[] = []
  const random = options?.random ?? defaultRandom

  for (let i = 0; i < args.operations.length; i += 1) {
    const rawOp: unknown = args.operations[i]
    const location = `operations[${i}]`
    if (!isCanvasObject(rawOp)) {
      return {
        kind: 'error',
        message: L({
          ko: `${location}: 작업 항목은 객체여야 합니다.`,
          en: `${location}: operation must be an object.`,
        }),
      }
    }

    const op = typeof rawOp.op === 'string' ? rawOp.op : ''
    switch (op) {
      case 'add_text': {
        if (typeof rawOp.text !== 'string') {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.text는 문자열이어야 합니다.`,
              en: `${location}.text must be a string.`,
            }),
          }
        }
        const colorCheck = validateOptionalColor(rawOp.color, location)
        if (!colorCheck.ok) return { kind: 'error', message: colorCheck.error }
        const refCheck = validateOptionalRef(rawOp.ref, refs, location)
        if (!refCheck.ok) return { kind: 'error', message: refCheck.error }

        let nearNode: CanvasObject | null = null
        if (rawOp.near !== undefined) {
          if (typeof rawOp.near !== 'string' || !rawOp.near.trim()) {
            return {
              kind: 'error',
              message: L({
                ko: `${location}.near는 비어 있지 않은 문자열이어야 합니다.`,
                en: `${location}.near must be a non-empty string.`,
              }),
            }
          }
          const resolved = resolveNodeTarget(
            rawOp.near,
            nodes,
            refs,
            location,
            'near',
          )
          if ('error' in resolved)
            return { kind: 'error', message: resolved.error }
          nearNode = resolved.node
        }

        const { x, y } = computePlacement(
          nodes,
          TEXT_WIDTH,
          TEXT_HEIGHT,
          nearNode,
        )
        const id = generateUniqueCanvasId(existingIds, random)
        existingIds.add(id)
        const newNode: CanvasObject = {
          id,
          type: 'text',
          text: rawOp.text,
          x,
          y,
          width: TEXT_WIDTH,
          height: TEXT_HEIGHT,
          ...(colorCheck.color !== undefined
            ? { color: colorCheck.color }
            : {}),
        }
        nodes.push(newNode)
        if (refCheck.ref) refs.set(refCheck.ref, id)
        const preview = singleLinePreview(rawOp.text, 60)
        summaryLines.push(
          L({
            ko: `텍스트 노드 추가: ${id} (${x}, ${y}, ${TEXT_WIDTH}×${TEXT_HEIGHT}) "${preview}"`,
            en: `Added text node: ${id} (${x}, ${y}, ${TEXT_WIDTH}×${TEXT_HEIGHT}) "${preview}"`,
          }),
        )
        break
      }

      case 'add_file': {
        if (typeof rawOp.file !== 'string' || !rawOp.file.trim()) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.file은 볼트 파일의 정확한 경로여야 합니다.`,
              en: `${location}.file must be an exact vault file path.`,
            }),
          }
        }
        let validFile: string
        try {
          validFile = normalizePath(
            assertUserVaultPath(ctx.app, rawOp.file.trim()),
          )
        } catch (error) {
          return {
            kind: 'error',
            message: `${location}.file: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
        if (isAiPrivatePath(validFile)) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.file: AI 비공개 경로는 추가할 수 없습니다(${validFile}).`,
              en: `${location}.file: cannot add AI-private path (${validFile}).`,
            }),
          }
        }
        const vaultFile = exactVaultFile(ctx.app, validFile)
        if (!vaultFile) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.file: 볼트에서 정확한 경로의 파일을 찾지 못했습니다('${rawOp.file}').`,
              en: `${location}.file: file not found at exact vault path ('${rawOp.file}').`,
            }),
          }
        }

        const colorCheck = validateOptionalColor(rawOp.color, location)
        if (!colorCheck.ok) return { kind: 'error', message: colorCheck.error }
        const refCheck = validateOptionalRef(rawOp.ref, refs, location)
        if (!refCheck.ok) return { kind: 'error', message: refCheck.error }

        let nearNode: CanvasObject | null = null
        if (rawOp.near !== undefined) {
          if (typeof rawOp.near !== 'string' || !rawOp.near.trim()) {
            return {
              kind: 'error',
              message: L({
                ko: `${location}.near는 비어 있지 않은 문자열이어야 합니다.`,
                en: `${location}.near must be a non-empty string.`,
              }),
            }
          }
          const resolved = resolveNodeTarget(
            rawOp.near,
            nodes,
            refs,
            location,
            'near',
          )
          if ('error' in resolved)
            return { kind: 'error', message: resolved.error }
          nearNode = resolved.node
        }

        const { width, height } = fileNodeSize(nodes)
        const { x, y } = computePlacement(nodes, width, height, nearNode)
        const id = generateUniqueCanvasId(existingIds, random)
        existingIds.add(id)
        const newNode: CanvasObject = {
          id,
          type: 'file',
          file: vaultFile.path,
          x,
          y,
          width,
          height,
          ...(colorCheck.color !== undefined
            ? { color: colorCheck.color }
            : {}),
        }
        nodes.push(newNode)
        if (refCheck.ref) refs.set(refCheck.ref, id)
        summaryLines.push(
          L({
            ko: `파일 노드 추가: ${id} (${x}, ${y}, ${width}×${height}) ${vaultFile.path}`,
            en: `Added file node: ${id} (${x}, ${y}, ${width}×${height}) ${vaultFile.path}`,
          }),
        )
        break
      }

      case 'add_edge': {
        if (typeof rawOp.from !== 'string' || !rawOp.from.trim()) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.from은 비어 있지 않은 문자열이어야 합니다.`,
              en: `${location}.from must be a non-empty string.`,
            }),
          }
        }
        if (typeof rawOp.to !== 'string' || !rawOp.to.trim()) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.to는 비어 있지 않은 문자열이어야 합니다.`,
              en: `${location}.to must be a non-empty string.`,
            }),
          }
        }
        if (rawOp.label !== undefined && typeof rawOp.label !== 'string') {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.label은 문자열이어야 합니다.`,
              en: `${location}.label must be a string.`,
            }),
          }
        }

        const fromResolved = resolveNodeTarget(
          rawOp.from,
          nodes,
          refs,
          location,
          'from',
        )
        if ('error' in fromResolved)
          return { kind: 'error', message: fromResolved.error }
        const toResolved = resolveNodeTarget(
          rawOp.to,
          nodes,
          refs,
          location,
          'to',
        )
        if ('error' in toResolved)
          return { kind: 'error', message: toResolved.error }

        const fromId = String(fromResolved.node.id)
        const toId = String(toResolved.node.id)
        const id = generateUniqueCanvasId(existingIds, random)
        existingIds.add(id)
        const newEdge: CanvasObject = {
          id,
          fromNode: fromId,
          toNode: toId,
          ...(rawOp.label !== undefined ? { label: rawOp.label } : {}),
        }
        edges.push(newEdge)
        const labelPart =
          typeof rawOp.label === 'string' && rawOp.label.length > 0
            ? L({
                ko: `, 라벨: "${rawOp.label}"`,
                en: `, label: "${rawOp.label}"`,
              })
            : ''
        summaryLines.push(
          L({
            ko: `연결 추가: ${id} (${fromId} → ${toId}${labelPart})`,
            en: `Added edge: ${id} (${fromId} → ${toId}${labelPart})`,
          }),
        )
        break
      }

      case 'update_text': {
        if (typeof rawOp.id !== 'string' || !rawOp.id.trim()) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.id는 비어 있지 않은 문자열이어야 합니다.`,
              en: `${location}.id must be a non-empty string.`,
            }),
          }
        }
        if (typeof rawOp.text !== 'string') {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.text는 문자열이어야 합니다.`,
              en: `${location}.text must be a string.`,
            }),
          }
        }
        const node = nodes.find((n) => n.id === rawOp.id)
        if (!node) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.id: 노드 '${rawOp.id}'을(를) 찾지 못했습니다.`,
              en: `${location}.id: node '${rawOp.id}' not found.`,
            }),
          }
        }
        if (node.type !== 'text') {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.id: 노드 '${rawOp.id}'은(는) text 노드가 아닙니다(type=${String(node.type)}).`,
              en: `${location}.id: node '${rawOp.id}' is not a text node (type=${String(node.type)}).`,
            }),
          }
        }
        node.text = rawOp.text
        summaryLines.push(
          L({
            ko: `텍스트 수정: ${rawOp.id} "${singleLinePreview(rawOp.text, 60)}"`,
            en: `Updated text node: ${rawOp.id} "${singleLinePreview(rawOp.text, 60)}"`,
          }),
        )
        break
      }

      case 'remove_node': {
        if (typeof rawOp.id !== 'string' || !rawOp.id.trim()) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.id는 비어 있지 않은 문자열이어야 합니다.`,
              en: `${location}.id must be a non-empty string.`,
            }),
          }
        }
        const index = nodes.findIndex((n) => n.id === rawOp.id)
        if (index < 0) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.id: 노드 '${rawOp.id}'을(를) 찾지 못했습니다.`,
              en: `${location}.id: node '${rawOp.id}' not found.`,
            }),
          }
        }
        nodes.splice(index, 1)
        let removedEdges = 0
        for (let ei = edges.length - 1; ei >= 0; ei -= 1) {
          if (
            edges[ei].fromNode === rawOp.id ||
            edges[ei].toNode === rawOp.id
          ) {
            edges.splice(ei, 1)
            removedEdges += 1
          }
        }
        const edgeNote =
          removedEdges > 0
            ? L({
                ko: ` (붙은 연결 ${removedEdges}개 삭제)`,
                en: ` (${removedEdges} attached ${removedEdges === 1 ? 'edge' : 'edges'} removed)`,
              })
            : ''
        summaryLines.push(
          L({
            ko: `노드 삭제: ${rawOp.id}${edgeNote}`,
            en: `Removed node: ${rawOp.id}${edgeNote}`,
          }),
        )
        break
      }

      case 'remove_edge': {
        if (typeof rawOp.id !== 'string' || !rawOp.id.trim()) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.id는 비어 있지 않은 문자열이어야 합니다.`,
              en: `${location}.id must be a non-empty string.`,
            }),
          }
        }
        const index = edges.findIndex((e) => e.id === rawOp.id)
        if (index < 0) {
          return {
            kind: 'error',
            message: L({
              ko: `${location}.id: 연결 '${rawOp.id}'을(를) 찾지 못했습니다.`,
              en: `${location}.id: edge '${rawOp.id}' not found.`,
            }),
          }
        }
        edges.splice(index, 1)
        summaryLines.push(
          L({
            ko: `연결 삭제: ${rawOp.id}`,
            en: `Removed edge: ${rawOp.id}`,
          }),
        )
        break
      }

      default:
        return {
          kind: 'error',
          message: L({
            ko: `${location}: 알 수 없는 작업 op '${op}'. 허용 값: ${ALLOWED_OPS.join(', ')}.`,
            en: `${location}: unknown operation '${op}'. Allowed: ${ALLOWED_OPS.join(', ')}.`,
          }),
        }
    }
  }

  const updatedDoc: CanvasObject = { ...parsed, nodes, edges }
  const format = detectCanvasJsonFormat(target.before)
  const after = serializeCanvasJson(updatedDoc, format)

  const afterValidation = validateCanvasDocument(
    after,
    (p) => exactVaultFile(ctx.app, p) !== null,
  )
  if (afterValidation.errors.length > 0) {
    const beforeErrors = new Set(validateCanvasDocument(target.before).errors)
    const newErrors = afterValidation.errors.filter(
      (message) => !beforeErrors.has(message),
    )
    if (newErrors.length > 0) {
      return { kind: 'error', message: newErrors.join('\n') }
    }
  }

  return changeHelper('edit_canvas', {
    op: 'modify',
    kind: 'body',
    path: target.path,
    before: target.before,
    after,
    approvalNotes: summaryLines,
    resultSummary: summaryLines.join('\n'),
  })
}
