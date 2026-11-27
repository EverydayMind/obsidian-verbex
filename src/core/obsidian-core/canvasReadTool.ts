import { L } from '../../i18n/modelText'
import {
  type ToolArgs,
  type ToolExecutionContext,
  type ToolResult,
  str,
} from '../tools/localToolCommon'

import {
  type CanvasObject,
  hasRect,
  isCanvasObject,
  readCanvasTarget,
  rectContains,
  singleLinePreview,
} from './canvasCommon'
import { exactVaultFile } from './exactVaultFile'

const MAX_READ_NODES = 500
const MAX_TEXT_PREVIEW = 200
const MAX_EDGE_NODE_SUMMARY = 40

type NodeCounts = {
  group: number
  text: number
  file: number
  link: number
}

function nodeIdOf(node: CanvasObject): string {
  return typeof node.id === 'string' && node.id.length > 0 ? node.id : '(no-id)'
}

function nodeLabelOf(node: CanvasObject): string {
  return typeof node.label === 'string' && node.label.trim().length > 0
    ? singleLinePreview(node.label, MAX_TEXT_PREVIEW)
    : L({ ko: '(라벨 없음)', en: '(no label)' })
}

function assignGroups(nodes: readonly CanvasObject[]): {
  groups: CanvasObject[]
  nodeToGroup: Map<string, CanvasObject>
  groupMembers: Map<string, CanvasObject[]>
} {
  const groups = nodes.filter(
    (node) => node.type === 'group' && typeof node.id === 'string',
  )
  const positionedGroups = groups.filter(hasRect)
  const nodeToGroup = new Map<string, CanvasObject>()
  const groupMembers = new Map<string, CanvasObject[]>()
  for (const group of groups) {
    groupMembers.set(nodeIdOf(group), [])
  }

  for (const node of nodes) {
    if (!hasRect(node) || typeof node.id !== 'string') continue
    let bestGroup: (CanvasObject & { width: number; height: number }) | null =
      null
    let bestArea = Infinity
    for (const group of positionedGroups) {
      if (group.id === node.id) continue
      if (!rectContains(group, node)) continue
      const area = group.width * group.height
      if (area < bestArea) {
        bestArea = area
        bestGroup = group
      }
    }
    if (bestGroup) {
      const gid = nodeIdOf(bestGroup)
      nodeToGroup.set(node.id, bestGroup)
      groupMembers.get(gid)?.push(node)
    }
  }

  return { groups, nodeToGroup, groupMembers }
}

function describeNodeContent(
  node: CanvasObject,
  fileMissing: Set<string>,
): string {
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string'
        ? singleLinePreview(node.text, MAX_TEXT_PREVIEW)
        : ''
    case 'file': {
      const path = typeof node.file === 'string' ? node.file : ''
      const missingTag =
        path && fileMissing.has(path)
          ? ` ${L({ ko: '(없는 파일)', en: '(missing file)' })}`
          : ''
      return `${path}${missingTag}`
    }
    case 'link':
      return typeof node.url === 'string' ? node.url : ''
    case 'group':
      return nodeLabelOf(node)
    default:
      return ''
  }
}

function edgeEndpointSummary(node: CanvasObject | undefined): string {
  if (!node) return L({ ko: '없는 노드', en: 'missing node' })
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string'
        ? singleLinePreview(node.text, MAX_EDGE_NODE_SUMMARY)
        : ''
    case 'file':
      return typeof node.file === 'string' ? node.file : ''
    case 'link':
      return typeof node.url === 'string' ? node.url : ''
    case 'group':
      return nodeLabelOf(node)
    default:
      return typeof node.type === 'string' ? node.type : ''
  }
}

export async function executeReadCanvasTool(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const target = await readCanvasTarget('read_canvas', str(args, 'path'), ctx)
  if ('kind' in target) return target

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

  const nodes: CanvasObject[] = Array.isArray(parsed.nodes)
    ? parsed.nodes.filter(isCanvasObject)
    : []
  const edges: CanvasObject[] = Array.isArray(parsed.edges)
    ? parsed.edges.filter(isCanvasObject)
    : []

  const counts: NodeCounts = { group: 0, text: 0, file: 0, link: 0 }
  const nodeById = new Map<string, CanvasObject>()
  const missingFilesOrdered: string[] = []
  const missingFilesSet = new Set<string>()

  for (const node of nodes) {
    if (typeof node.id === 'string' && node.id.length > 0) {
      nodeById.set(node.id, node)
    }
    if (node.type === 'group') counts.group += 1
    else if (node.type === 'text') counts.text += 1
    else if (node.type === 'file') {
      counts.file += 1
      if (
        typeof node.file === 'string' &&
        node.file.length > 0 &&
        !exactVaultFile(ctx.app, node.file)
      ) {
        if (!missingFilesSet.has(node.file)) {
          missingFilesSet.add(node.file)
          missingFilesOrdered.push(node.file)
        }
      }
    } else if (node.type === 'link') counts.link += 1
  }

  const { groups, nodeToGroup, groupMembers } = assignGroups(nodes)
  const lines: string[] = [
    L({ ko: `캔버스: ${target.path}`, en: `Canvas: ${target.path}` }),
    L({
      ko: `노드 ${nodes.length}개(그룹 ${counts.group}, 텍스트 ${counts.text}, 파일 ${counts.file}, 링크 ${counts.link}), 연결 ${edges.length}개`,
      en: `Nodes: ${nodes.length} (group ${counts.group}, text ${counts.text}, file ${counts.file}, link ${counts.link}), Edges: ${edges.length}`,
    }),
  ]

  if (groups.length > 0) {
    lines.push('', L({ ko: '## 그룹', en: '## Groups' }))
    for (const group of groups) {
      const gid = nodeIdOf(group)
      const label = nodeLabelOf(group)
      const members = groupMembers.get(gid) ?? []
      const memberIds = members.map((m) => nodeIdOf(m)).join(', ')
      lines.push(
        L({
          ko: `- ${gid} · ${label} (${members.length}개${memberIds ? `: ${memberIds}` : ''})`,
          en: `- ${gid} · ${label} (${members.length}${memberIds ? `: ${memberIds}` : ''})`,
        }),
      )
    }
  }

  const truncatedNodes = nodes.length > MAX_READ_NODES
  const visibleNodes = truncatedNodes ? nodes.slice(0, MAX_READ_NODES) : nodes

  lines.push('', L({ ko: '## 노드', en: '## Nodes' }))
  if (visibleNodes.length === 0) {
    lines.push(L({ ko: '(노드 없음)', en: '(no nodes)' }))
  } else {
    for (const node of visibleNodes) {
      const id = nodeIdOf(node)
      const type = typeof node.type === 'string' ? node.type : 'unknown'
      const content = describeNodeContent(node, missingFilesSet)
      const parentGroup = nodeToGroup.get(id)
      const groupPart = parentGroup
        ? ` · ${L({ ko: '그룹', en: 'group' })}: ${nodeIdOf(parentGroup)}(${nodeLabelOf(parentGroup)})`
        : ''
      lines.push(`- ${id} · ${type} · ${content}${groupPart}`)
    }
    if (truncatedNodes) {
      const remaining = nodes.length - MAX_READ_NODES
      lines.push(
        L({
          ko: `… 외 ${remaining}개 노드 생략(총 ${nodes.length}개 중 앞 ${MAX_READ_NODES}개 표시)`,
          en: `… ${remaining} more nodes omitted (showing first ${MAX_READ_NODES} of ${nodes.length})`,
        }),
      )
    }
  }

  if (edges.length > 0) {
    lines.push('', L({ ko: '## 연결', en: '## Edges' }))
    for (const edge of edges) {
      const eid = nodeIdOf(edge)
      const fromId = typeof edge.fromNode === 'string' ? edge.fromNode : '?'
      const toId = typeof edge.toNode === 'string' ? edge.toNode : '?'
      const fromSummary = edgeEndpointSummary(nodeById.get(fromId))
      const toSummary = edgeEndpointSummary(nodeById.get(toId))
      const labelPart =
        typeof edge.label === 'string' && edge.label.length > 0
          ? ` · ${L({ ko: '라벨', en: 'label' })}: ${singleLinePreview(edge.label, 80)}`
          : ''
      const fromEnd = typeof edge.fromEnd === 'string' ? edge.fromEnd : 'none'
      const toEnd = typeof edge.toEnd === 'string' ? edge.toEnd : 'arrow'
      const dirPart = ` · ${L({ ko: '방향', en: 'direction' })}: fromEnd=${fromEnd}, toEnd=${toEnd}`
      lines.push(
        `- ${eid}: ${fromId}(${fromSummary}) → ${toId}(${toSummary})${labelPart}${dirPart}`,
      )
    }
  }

  lines.push('', L({ ko: '## 없는 파일', en: '## Missing files' }))
  if (missingFilesOrdered.length === 0) {
    lines.push(L({ ko: '없음', en: 'None' }))
  } else {
    for (const missingPath of missingFilesOrdered) {
      lines.push(`- ${missingPath}`)
    }
  }

  return {
    kind: 'read',
    evidencePaths: [target.path],
    facts: {
      completeness: truncatedNodes ? 'partial' : 'complete',
      total: nodes.length,
      returned: visibleNodes.length,
    },
    text: lines.join('\n'),
  }
}
