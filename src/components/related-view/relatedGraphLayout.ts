import type { RelatedNote } from '../../core/rag/relatedNotes'

import { propertyColorIndex } from './relatedPropertyColor'

export const RELATED_GRAPH_R = 18
export const RELATED_GRAPH_RC = 26
export const RELATED_GRAPH_SLOT_W = 68
export const RELATED_GRAPH_ROW_H = 76
export const RELATED_GRAPH_BAND_GAP = 44
export const RELATED_GRAPH_CENTER_W = 80
export const RELATED_GRAPH_CENTER_LABEL_H = 32
export const RELATED_GRAPH_TIP = 5
export const RELATED_GRAPH_PAD = 12
export const RELATED_GRAPH_MIN_WIDTH = 240

export type RelatedGraphRole = 'center' | 'incoming' | 'outgoing' | 'side'

export type RelatedGraphLabelSide = 'above' | 'below'

export type RelatedGraphItem = {
  note: RelatedNote
  bidirectional: boolean
  similar: boolean
  /** Property names that carry this reference; empty for a body link. */
  properties: string[]
}

/** Property names per referenced or referencing note path. */
export type RelatedGraphPropertyLinks = {
  incoming: Record<string, string[]>
  outgoing: Record<string, string[]>
}

export type RelatedGraphGroups = {
  incoming: RelatedGraphItem[]
  outgoing: RelatedGraphItem[]
  left: RelatedGraphItem[]
  right: RelatedGraphItem[]
}

export type RelatedGraphNode = {
  key: string
  path: string
  title: string
  role: RelatedGraphRole
  x: number
  y: number
  r: number
  labelSide: RelatedGraphLabelSide
  note?: RelatedNote
  bidirectional: boolean
  similar: boolean
}

export type RelatedGraphEdge = {
  key: string
  role: 'incoming' | 'outgoing'
  d: string
  properties: string[]
  /** Colour slot of the first property, or null for a body link. */
  color: number | null
}

export type RelatedGraphLayout = {
  width: number
  height: number
  nodes: RelatedGraphNode[]
  edges: RelatedGraphEdge[]
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function mergeCompanionPaths(
  existing: readonly string[] | undefined,
  incoming: readonly string[] | undefined,
): string[] | undefined {
  if (!existing?.length && !incoming?.length) return undefined
  const merged = [...(existing ?? [])]
  for (const path of incoming ?? []) {
    if (!merged.includes(path)) merged.push(path)
  }
  return merged
}

function notePaths(note: RelatedNote): string[] {
  const paths = [note.path]
  for (const companion of note.companionPaths ?? []) {
    if (!paths.includes(companion)) paths.push(companion)
  }
  return paths
}

function chunkRows<T>(items: readonly T[], cols: number): T[][] {
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += cols) {
    rows.push(items.slice(index, index + cols))
  }
  return rows
}

/**
 * Rows for the bands above and below the centre. Every other row holds one
 * item fewer, so centred rows sit half a slot apart and an arrow from an outer
 * row runs between the circles of the row nearer the centre.
 */
function chunkStaggeredRows<T>(items: readonly T[], cols: number): T[][] {
  const rows: T[][] = []
  let index = 0
  while (index < items.length) {
    const capacity = cols >= 2 && rows.length % 2 === 1 ? cols - 1 : cols
    rows.push(items.slice(index, index + capacity))
    index += capacity
  }
  return rows
}

export function classifyRelatedNotes(input: {
  activePath: string
  notes: readonly RelatedNote[]
  resolvedLinks: Record<string, Record<string, number>> | undefined
  propertyLinks?: RelatedGraphPropertyLinks
  limit: number
}): RelatedGraphGroups {
  const merged = new Map<string, { note: RelatedNote; similar: boolean }>()

  for (const item of input.notes) {
    if (
      !item.path ||
      item.path === input.activePath ||
      item.relation === 'folder_adjacent'
    ) {
      continue
    }
    const existing = merged.get(item.path)
    if (!existing) {
      merged.set(item.path, {
        note: { ...item, signals: [...item.signals] },
        similar: item.category === 'similar',
      })
      continue
    }
    const signals = [...existing.note.signals]
    for (const signal of item.signals) {
      if (!signals.includes(signal)) signals.push(signal)
    }
    const companionPaths = mergeCompanionPaths(
      existing.note.companionPaths,
      item.companionPaths,
    )
    const relation =
      item.category === 'related' && item.relation
        ? item.relation
        : (existing.note.relation ?? item.relation)
    merged.set(item.path, {
      note: {
        ...existing.note,
        signals,
        ...(relation ? { relation } : {}),
        ...(companionPaths ? { companionPaths } : {}),
      },
      similar: existing.similar || item.category === 'similar',
    })
  }

  const maxCount = Math.max(0, Math.floor(input.limit))
  const incoming: RelatedGraphItem[] = []
  const outgoing: RelatedGraphItem[] = []
  const left: RelatedGraphItem[] = []
  const right: RelatedGraphItem[] = []

  for (const { note, similar } of merged.values()) {
    const paths = notePaths(note)
    const linksIn =
      note.relation === 'backlink_in' ||
      paths.some(
        (path) => (input.resolvedLinks?.[path]?.[input.activePath] ?? 0) > 0,
      )
    const linksOut =
      note.relation === 'wikilink_out' ||
      note.relation === 'frontmatter_ref' ||
      paths.some(
        (path) => (input.resolvedLinks?.[input.activePath]?.[path] ?? 0) > 0,
      )

    // A note linked both ways is shown twice: above and below.
    const bidirectional = linksIn && linksOut
    const propertiesOf = (links: Record<string, string[]> | undefined) => [
      ...new Set(paths.flatMap((path) => links?.[path] ?? [])),
    ]
    if (linksIn && incoming.length < maxCount) {
      const properties = propertiesOf(input.propertyLinks?.incoming)
      incoming.push({ note, bidirectional, similar, properties })
    }
    if (linksOut && outgoing.length < maxCount) {
      const properties = propertiesOf(input.propertyLinks?.outgoing)
      outgoing.push({ note, bidirectional, similar, properties })
    }
    if (linksIn || linksOut) continue
    const sideCount = left.length + right.length
    if (sideCount < maxCount) {
      if (sideCount % 2 === 0) {
        left.push({ note, bidirectional: false, similar, properties: [] })
      } else {
        right.push({ note, bidirectional: false, similar, properties: [] })
      }
    }
  }

  return { incoming, outgoing, left, right }
}

export function layoutRelatedGraph(
  groups: RelatedGraphGroups,
  options: { width: number; center: { path: string; title: string } },
): RelatedGraphLayout {
  const width = Math.max(
    RELATED_GRAPH_MIN_WIDTH,
    Number.isFinite(options.width) ? options.width : RELATED_GRAPH_MIN_WIDTH,
  )
  const cx = width / 2
  const bandCols = Math.max(
    1,
    Math.floor((width - 2 * RELATED_GRAPH_PAD) / RELATED_GRAPH_SLOT_W),
  )
  const sideWidth = (width - RELATED_GRAPH_CENTER_W) / 2 - RELATED_GRAPH_PAD
  const sideCols = Math.max(1, Math.floor(sideWidth / RELATED_GRAPH_SLOT_W))

  const incomingRows = chunkStaggeredRows(groups.incoming, bandCols)
  const outgoingRows = chunkStaggeredRows(groups.outgoing, bandCols)
  const leftRows = chunkRows(groups.left, sideCols)
  const rightRows = chunkRows(groups.right, sideCols)

  const centerLabelSide: RelatedGraphLabelSide =
    groups.incoming.length === 0 && groups.outgoing.length > 0
      ? 'above'
      : 'below'
  const centerSelfAbove =
    centerLabelSide === 'above'
      ? RELATED_GRAPH_RC + RELATED_GRAPH_CENTER_LABEL_H
      : RELATED_GRAPH_RC
  const centerSelfBelow =
    centerLabelSide === 'below'
      ? RELATED_GRAPH_RC + RELATED_GRAPH_CENTER_LABEL_H
      : RELATED_GRAPH_RC

  const maxSideRows = Math.max(leftRows.length, rightRows.length)
  const sideAbove =
    maxSideRows > 0
      ? ((maxSideRows - 1) / 2) * RELATED_GRAPH_ROW_H + RELATED_GRAPH_R
      : 0
  const sideBelow =
    maxSideRows > 0
      ? ((maxSideRows - 1) / 2) * RELATED_GRAPH_ROW_H +
        (RELATED_GRAPH_ROW_H - RELATED_GRAPH_R)
      : 0

  const centerAbove = Math.max(centerSelfAbove, sideAbove)
  const centerBelow = Math.max(centerSelfBelow, sideBelow)

  const incomingH = incomingRows.length * RELATED_GRAPH_ROW_H
  const topGap = incomingRows.length > 0 ? RELATED_GRAPH_BAND_GAP : 0
  const cy = RELATED_GRAPH_PAD + incomingH + topGap + centerAbove
  const centerBottom = cy + centerBelow
  const bottomGap = outgoingRows.length > 0 ? RELATED_GRAPH_BAND_GAP : 0
  const outgoingTop = centerBottom + bottomGap
  const outgoingH = outgoingRows.length * RELATED_GRAPH_ROW_H
  const height = outgoingTop + outgoingH + RELATED_GRAPH_PAD

  const nodes: RelatedGraphNode[] = [
    {
      key: options.center.path,
      path: options.center.path,
      title: options.center.title,
      role: 'center',
      x: cx,
      y: cy,
      r: RELATED_GRAPH_RC,
      labelSide: centerLabelSide,
      bidirectional: false,
      similar: false,
    },
  ]

  const edgeProperties = new Map<RelatedGraphNode, string[]>()
  const incomingNodes: RelatedGraphNode[] = []
  incomingRows.forEach((row, chunkIndex) => {
    const visualRow = incomingRows.length - 1 - chunkIndex
    const y =
      RELATED_GRAPH_PAD +
      (visualRow + 1) * RELATED_GRAPH_ROW_H -
      RELATED_GRAPH_R
    row.forEach((item, colIndex) => {
      const x = cx + (colIndex - (row.length - 1) / 2) * RELATED_GRAPH_SLOT_W
      const node: RelatedGraphNode = {
        key: item.note.path,
        path: item.note.path,
        title: item.note.title,
        role: 'incoming',
        x,
        y,
        r: RELATED_GRAPH_R,
        labelSide: 'above',
        note: item.note,
        bidirectional: item.bidirectional,
        similar: item.similar,
      }
      incomingNodes.push(node)
      edgeProperties.set(node, item.properties)
      nodes.push(node)
    })
  })

  const outgoingNodes: RelatedGraphNode[] = []
  outgoingRows.forEach((row, chunkIndex) => {
    const y = outgoingTop + chunkIndex * RELATED_GRAPH_ROW_H + RELATED_GRAPH_R
    row.forEach((item, colIndex) => {
      const x = cx + (colIndex - (row.length - 1) / 2) * RELATED_GRAPH_SLOT_W
      const node: RelatedGraphNode = {
        // The copy above keeps the bare path as its key, so that one is the
        // element that moves when the note becomes the centre.
        key: item.bidirectional ? `outgoing:${item.note.path}` : item.note.path,
        path: item.note.path,
        title: item.note.title,
        role: 'outgoing',
        x,
        y,
        r: RELATED_GRAPH_R,
        labelSide: 'below',
        note: item.note,
        bidirectional: item.bidirectional,
        similar: item.similar,
      }
      outgoingNodes.push(node)
      edgeProperties.set(node, item.properties)
      nodes.push(node)
    })
  })

  leftRows.forEach((row, rowIndex) => {
    const y = cy + (rowIndex - (leftRows.length - 1) / 2) * RELATED_GRAPH_ROW_H
    row.forEach((item, colIndex) => {
      const x =
        cx -
        RELATED_GRAPH_CENTER_W / 2 -
        (colIndex + 0.5) * RELATED_GRAPH_SLOT_W
      nodes.push({
        key: item.note.path,
        path: item.note.path,
        title: item.note.title,
        role: 'side',
        x,
        y,
        r: RELATED_GRAPH_R,
        labelSide: 'below',
        note: item.note,
        bidirectional: false,
        similar: item.similar,
      })
    })
  })

  rightRows.forEach((row, rowIndex) => {
    const y = cy + (rowIndex - (rightRows.length - 1) / 2) * RELATED_GRAPH_ROW_H
    row.forEach((item, colIndex) => {
      const x =
        cx +
        RELATED_GRAPH_CENTER_W / 2 +
        (colIndex + 0.5) * RELATED_GRAPH_SLOT_W
      nodes.push({
        key: item.note.path,
        path: item.note.path,
        title: item.note.title,
        role: 'side',
        x,
        y,
        r: RELATED_GRAPH_R,
        labelSide: 'below',
        note: item.note,
        bidirectional: false,
        similar: item.similar,
      })
    })
  })

  // Every arrow into the centre ends at one point on top of it, and every
  // arrow out of it starts at one point below it (below the title when the
  // title sits under the circle).
  const edges: RelatedGraphEdge[] = []
  const arriveY = cy - RELATED_GRAPH_RC - RELATED_GRAPH_TIP
  const departY =
    centerLabelSide === 'below'
      ? cy + RELATED_GRAPH_RC + RELATED_GRAPH_CENTER_LABEL_H + 2
      : cy + RELATED_GRAPH_RC
  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const ym = (y1 + y2) / 2
    return `M ${x1} ${y1} C ${x1} ${ym}, ${x2} ${ym}, ${x2} ${y2}`
  }
  const named = (node: RelatedGraphNode) => {
    const properties = edgeProperties.get(node) ?? []
    return {
      properties,
      color: properties.length > 0 ? propertyColorIndex(properties[0]) : null,
    }
  }
  for (const node of incomingNodes) {
    edges.push({
      key: `incoming:${node.path}`,
      role: 'incoming',
      d: curve(node.x, node.y + RELATED_GRAPH_R, cx, arriveY),
      ...named(node),
    })
  }
  for (const node of outgoingNodes) {
    edges.push({
      key: `outgoing:${node.path}`,
      role: 'outgoing',
      d: curve(
        cx,
        departY,
        node.x,
        node.y - RELATED_GRAPH_R - RELATED_GRAPH_TIP,
      ),
      ...named(node),
    })
  }

  nodes.sort((left, right) => compareKeys(left.key, right.key))
  edges.sort((left, right) => compareKeys(left.key, right.key))

  return { width, height, nodes, edges }
}
