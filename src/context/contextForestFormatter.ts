import type {
  ContextForestDirectCandidate,
  ContextForestNode,
  ContextForestResult,
} from '../core/rag/contextForestTypes'
import { estimateTokens } from '../utils/llm/estimateTokens'

export type FormattedContextForestOutput = {
  text: string
  mapText: string
  evidenceText: string
  estimatedMapTokens: number
  estimatedTotalTokens: number
  prunedForestPaths: string[]
  omittedSnippetPaths: string[]
}

const ROLE_AND_BOUNDARY_TAG_RE =
  /<\s*\/?\s*(?:system|user|assistant|developer|tool|tool_call|tool_result|context_forest|vault_note|prompt|instructions?)\b[^>]*>/gi

export function sanitizeUntrustedForestField(
  raw: string | null | undefined,
  maxChars = 160,
): string {
  if (!raw) {
    return ''
  }
  const cleaned = raw
    // eslint-disable-next-line no-control-regex -- Replace control characters in untrusted context text
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(ROLE_AND_BOUNDARY_TAG_RE, '[escaped-tag]')
    .replace(/```+/g, "'''")
    .replace(/\t+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= maxChars) {
    return cleaned
  }
  return `${cleaned.slice(0, Math.max(1, maxChars - 1))}…`
}

export function sanitizeUntrustedForestSnippet(
  raw: string | null | undefined,
  maxChars = 360,
): string {
  return sanitizeUntrustedForestField(raw, maxChars)
}

function formatRelationBadge(node: ContextForestNode): string {
  if (node.relationToParent === 'root') {
    return 'root'
  }
  const parentPath = node.parentPath ?? ''
  if (node.relationToParent === 'frontmatter') {
    const field = sanitizeUntrustedForestField(node.frontmatterField, 40)
    return field
      ? `frontmatter(${field})<-${parentPath}`
      : `frontmatter<-${parentPath}`
  }
  if (node.relationToParent === 'tag') {
    const tags = (node.sharedTags ?? [])
      .slice(0, 3)
      .map((t) => `#${sanitizeUntrustedForestField(t, 24)}`)
      .join(',')
    return `tag(${tags})<-${parentPath}`
  }
  const arrow = node.bidirectionalWithParent
    ? '<->'
    : node.relationToParent === 'backlink'
      ? '<-'
      : '->'
  return `${node.relationToParent}(${parentPath}${arrow}${node.path})`
}

function formatForestMapLine(node: ContextForestNode): string {
  const indent = '  '.repeat(Math.max(0, node.depth))
  const safeTitle = sanitizeUntrustedForestField(node.title, 80)
  const rel = formatRelationBadge(node)
  const floorBadge = node.edgeBreakdown?.structuralFloorApplied
    ? ' floor=1'
    : ''
  const altBadge =
    node.alsoReachedFrom.length > 0
      ? ` also=${node.alsoReachedFrom.map((a) => `${a.parentPath}:${a.relation}`).join(',')}`
      : ''
  // Put canonical .md path in the first tab-separated field so discovery
  // parsing records the path without marking it as full-body inspected.
  return `${node.path}\t${indent}[tree d=${node.depth} score=${node.pathScore.toFixed(3)} q=${node.queryScore.toFixed(3)} ${rel}${floorBadge}${altBadge}] "${safeTitle}"`
}

function collectCurrentLeaves(
  nodes: readonly ContextForestNode[],
): ContextForestNode[] {
  const activeSet = new Set(nodes.map((n) => n.path))
  const parentHasActiveChild = new Set<string>()
  for (const node of nodes) {
    if (node.parentPath && activeSet.has(node.parentPath)) {
      parentHasActiveChild.add(node.parentPath)
    }
  }
  return nodes.filter((node) => !parentHasActiveChild.has(node.path))
}

/**
 * Formats a ContextForestResult under the strict token budget:
 * - Forest map takes at most 25% of tokenBudget, pruning lowest-scoring leaves
 *   bottom-up so no orphan child ever remains without its parent.
 * - Direct candidate snippets are packed first, followed by graph-only leaf
 *   snippets only when `includeLeafSnippets === true` and `mapOnly === false`.
 * - Mutates `bodyIncluded` and `diagnostics.truncatedCounts.token_budget` on
 *   `result` so structured fields match the actually delivered output.
 */
export function formatContextForestResult(
  result: ContextForestResult,
): FormattedContextForestOutput {
  const tokenBudget = result.params.tokenBudget
  const mapTokenCap = Math.max(64, Math.floor(tokenBudget * 0.25))

  const activeForestNodes = [...result.nodes]
  const prunedForestPaths: string[] = []

  const buildMapSection = (nodes: readonly ContextForestNode[]): string => {
    const header = `# Context Forest Map (query="${sanitizeUntrustedForestField(result.query, 80)}", nodes=${nodes.length}, direct=${result.directCandidates.length}, activeSources=${result.diagnostics.activeSourceCount})`
    if (nodes.length === 0) {
      return `${header}\n(no forest nodes matched)`
    }
    return [header, ...nodes.map(formatForestMapLine)].join('\n')
  }

  let mapText = buildMapSection(activeForestNodes)
  let estimatedMapTokens = estimateTokens(mapText)

  while (estimatedMapTokens > mapTokenCap && activeForestNodes.length > 1) {
    const leaves = collectCurrentLeaves(activeForestNodes)
    // Prefer pruning non-root leaves first; sort by pathScore ASC, depth DESC, path DESC
    leaves.sort((a, b) => {
      const aIsRoot = a.depth === 0 ? 1 : 0
      const bIsRoot = b.depth === 0 ? 1 : 0
      if (aIsRoot !== bIsRoot) {
        return aIsRoot - bIsRoot
      }
      if (a.pathScore !== b.pathScore) {
        return a.pathScore - b.pathScore
      }
      if (b.depth !== a.depth) {
        return b.depth - a.depth
      }
      return b.path.localeCompare(a.path)
    })
    const victim = leaves[0]
    if (!victim) {
      break
    }
    const idx = activeForestNodes.findIndex((n) => n.path === victim.path)
    if (idx < 0) {
      break
    }
    activeForestNodes.splice(idx, 1)
    victim.bodyIncluded = false
    prunedForestPaths.push(victim.path)
    result.diagnostics.truncatedCounts.token_budget =
      (result.diagnostics.truncatedCounts.token_budget ?? 0) + 1
    mapText = buildMapSection(activeForestNodes)
    estimatedMapTokens = estimateTokens(mapText)
  }

  // Synchronize pruned nodes back to result structure so callers never see orphans
  if (prunedForestPaths.length > 0) {
    const keptSet = new Set(activeForestNodes.map((n) => n.path))
    const filterChildren = (node: ContextForestNode) => {
      node.children = node.children.filter((child) => keptSet.has(child.path))
      for (const child of node.children) {
        filterChildren(child)
      }
    }
    result.roots = result.roots.filter((root) => keptSet.has(root.path))
    for (const root of result.roots) {
      filterChildren(root)
    }
    result.nodes = activeForestNodes
    const nextByPath: Record<string, ContextForestNode> = {}
    for (const node of activeForestNodes) {
      nextByPath[node.path] = node
    }
    result.nodesByPath = nextByPath
    for (const direct of result.directCandidates) {
      direct.inForest = keptSet.has(direct.path)
    }
  }

  const omittedSnippetPaths: string[] = []
  const evidenceLines: string[] = []
  let runningTokens = estimatedMapTokens

  if (result.params.mapOnly) {
    for (const node of result.nodes) {
      node.bodyIncluded = false
    }
    for (const direct of result.directCandidates) {
      direct.bodyIncluded = false
    }
  } else {
    // 1. Pack direct candidates first (queryScore DESC, path ASC)
    const deliveredSnippetPaths = new Set<string>()
    const formatDirectLine = (direct: ContextForestDirectCandidate): string => {
      const safeTitle = sanitizeUntrustedForestField(direct.title, 80)
      const safeHeading = direct.heading
        ? ` heading="${sanitizeUntrustedForestField(direct.heading, 60)}"`
        : ''
      const locText = direct.locator
        ? ` L${direct.locator.startLine}-${direct.locator.endLine}`
        : ''
      const safeSnippet = sanitizeUntrustedForestSnippet(direct.snippet, 320)
      if (safeSnippet) {
        return `${direct.path}\t[direct q=${direct.queryScore.toFixed(3)} lexRank=${direct.lexicalRank ?? '-'} vecRank=${direct.vectorRank ?? '-'}${locText}${safeHeading}] "${safeTitle}" — ${safeSnippet}`
      }
      return `${direct.path}\t[direct q=${direct.queryScore.toFixed(3)} lexRank=${direct.lexicalRank ?? '-'} vecRank=${direct.vectorRank ?? '-'}${locText}] "${safeTitle}"`
    }

    for (const direct of result.directCandidates) {
      const hasSnippet = Boolean(direct.snippet?.trim())
      const line = formatDirectLine(direct)
      const lineTokens = estimateTokens(line) + 2
      if (runningTokens + lineTokens <= tokenBudget) {
        evidenceLines.push(line)
        runningTokens += lineTokens
        direct.bodyIncluded = hasSnippet
        const forestNode = result.nodesByPath[direct.path]
        if (forestNode) {
          forestNode.bodyIncluded = hasSnippet
        }
        if (hasSnippet) {
          deliveredSnippetPaths.add(direct.path)
        }
      } else {
        direct.bodyIncluded = false
        const forestNode = result.nodesByPath[direct.path]
        if (forestNode) {
          forestNode.bodyIncluded = false
        }
        if (hasSnippet) {
          omittedSnippetPaths.push(direct.path)
        }
        result.diagnostics.truncatedCounts.token_budget =
          (result.diagnostics.truncatedCounts.token_budget ?? 0) + 1
      }
    }

    // 2. Pack graph-only node snippets ONLY when includeLeafSnippets === true
    for (const node of result.nodes) {
      if (deliveredSnippetPaths.has(node.path)) {
        continue
      }
      if (!result.params.includeLeafSnippets) {
        node.bodyIncluded = false
        continue
      }
      const safeSnippet = sanitizeUntrustedForestSnippet(node.snippet, 300)
      if (!safeSnippet) {
        node.bodyIncluded = false
        continue
      }
      const safeHeading = node.heading
        ? ` heading="${sanitizeUntrustedForestField(node.heading, 60)}"`
        : ''
      const locText = node.locator
        ? ` L${node.locator.startLine}-${node.locator.endLine}`
        : ''
      const line = `${node.path}\t[leaf-snippet d=${node.depth} score=${node.pathScore.toFixed(3)}${locText}${safeHeading}] — ${safeSnippet}`
      const lineTokens = estimateTokens(line) + 2
      if (runningTokens + lineTokens <= tokenBudget) {
        evidenceLines.push(line)
        runningTokens += lineTokens
        node.bodyIncluded = true
        deliveredSnippetPaths.add(node.path)
      } else {
        node.bodyIncluded = false
        omittedSnippetPaths.push(node.path)
        result.diagnostics.truncatedCounts.token_budget =
          (result.diagnostics.truncatedCounts.token_budget ?? 0) + 1
      }
    }
  }

  const evidenceText =
    evidenceLines.length > 0
      ? ['# Direct & Snippet Evidence', ...evidenceLines].join('\n')
      : ''
  const text = evidenceText ? `${mapText}\n\n${evidenceText}` : mapText
  const estimatedTotalTokens = estimateTokens(text)

  return {
    text,
    mapText,
    evidenceText,
    estimatedMapTokens,
    estimatedTotalTokens,
    prunedForestPaths,
    omittedSnippetPaths,
  }
}
