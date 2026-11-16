import { estimateTokens } from '../../utils/llm/estimateTokens'
import {
  headingPathForLine,
  parseHeadings,
  sectionEndLine,
  splitLines,
} from '../tools/noteSlicing'

import type { RetrievalHit, RetrievalProvenance } from './retrievalTypes'

export type AnchorFallback = 'whole_file' | 'nearest_heading'

export type AnchorLineRange = {
  startLine: number
  endLine: number
  headingPath?: string[]
  matched: boolean
  fallback: AnchorFallback | 'exact_heading'
}

export type AnchorResolutionOptions = {
  fallback?: AnchorFallback
}

function decodeAnchor(anchor: string): string {
  try {
    return decodeURIComponent(anchor)
  } catch {
    return anchor
  }
}

function normalizeAnchor(anchor: string): string {
  return decodeAnchor(anchor).trim().replace(/^#+/, '').toLowerCase()
}

function headingSlug(value: string): string {
  return normalizeAnchor(value)
    .replace(/[\s_-]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function headingMatchesAnchor(heading: string, anchor: string): boolean {
  const normalizedAnchor = normalizeAnchor(anchor)
  return (
    normalizeAnchor(heading) === normalizedAnchor ||
    headingSlug(heading) === headingSlug(normalizedAnchor)
  )
}

function findNearestHeadingIndex(
  headings: ReturnType<typeof parseHeadings>,
  anchor: string,
): number | null {
  const target = headingSlug(anchor)
  if (!target) return null
  const candidates = headings
    .map((heading, index) => ({
      heading,
      index,
      slug: headingSlug(heading.heading),
    }))
    .filter(
      ({ slug }) =>
        slug.length > 0 && (slug.includes(target) || target.includes(slug)),
    )
    .sort(
      (left, right) =>
        Math.abs(left.slug.length - target.length) -
          Math.abs(right.slug.length - target.length) ||
        left.heading.line - right.heading.line,
    )
  return candidates[0]?.index ?? null
}

/**
 * Convert a markdown heading anchor to the exact 1-based inclusive section
 * range. Unknown anchors deliberately fall back to the whole file by
 * default; callers may opt into a conservative nearest-heading fallback.
 */
export function resolveAnchorLineRange(
  content: string,
  anchor?: string,
  options: AnchorResolutionOptions = {},
): AnchorLineRange {
  const lines = splitLines(content)
  const totalLines = Math.max(lines.length, 1)
  const normalizedAnchor = anchor ? normalizeAnchor(anchor) : ''
  if (!normalizedAnchor) {
    return {
      startLine: 1,
      endLine: totalLines,
      matched: false,
      fallback: 'whole_file',
    }
  }

  const headings = parseHeadings(lines)
  const exactIndex = headings.findIndex((heading) =>
    headingMatchesAnchor(heading.heading, normalizedAnchor),
  )
  const fallbackIndex =
    exactIndex >= 0
      ? exactIndex
      : options.fallback === 'nearest_heading'
        ? findNearestHeadingIndex(headings, normalizedAnchor)
        : null

  if (fallbackIndex === null || fallbackIndex < 0) {
    return {
      startLine: 1,
      endLine: totalLines,
      matched: false,
      fallback: 'whole_file',
    }
  }

  const heading = headings[fallbackIndex]
  const endLine = sectionEndLine(headings, fallbackIndex, totalLines, true)
  return {
    startLine: heading.line,
    endLine: Math.max(heading.line, endLine),
    headingPath: headingPathForLine(headings, heading.line),
    matched: exactIndex >= 0,
    fallback: exactIndex >= 0 ? 'exact_heading' : 'nearest_heading',
  }
}

/** Slice a 1-based inclusive line range using the shared LF-normalized lines. */
export function sliceInclusiveLines(
  content: string,
  startLine: number,
  endLine: number,
): string {
  const lines = splitLines(content)
  const start = Math.max(1, Math.floor(startLine))
  const end = Math.max(start, Math.floor(endLine))
  return lines.slice(start - 1, end).join('\n')
}

export type RetrievalContentReader = (path: string) => Promise<string | null>

/**
 * Hydrate only candidates whose body was intentionally dropped by routing
 * (for example an overlap merge). Missing files remain body-less so a stale
 * index cannot turn an optional search enhancement into a hard failure.
 */
export async function hydrateRetrievalHits(
  hits: readonly RetrievalHit[],
  readFile: RetrievalContentReader,
): Promise<RetrievalHit[]> {
  const sourceCache = new Map<string, string | null>()
  const hydrated: RetrievalHit[] = []

  for (const hit of hits) {
    if (hit.content !== undefined) {
      hydrated.push(hit)
      continue
    }

    let source = sourceCache.get(hit.locator.path)
    if (source === undefined && !sourceCache.has(hit.locator.path)) {
      try {
        source = await readFile(hit.locator.path)
      } catch {
        source = null
      }
      sourceCache.set(hit.locator.path, source)
    }
    if (source === null || source === undefined) {
      hydrated.push(hit)
      continue
    }

    const content = sliceInclusiveLines(
      source,
      hit.locator.startLine,
      hit.locator.endLine,
    )
    const headings = parseHeadings(splitLines(source))
    const headingPath = headingPathForLine(
      headings,
      Math.max(1, hit.locator.startLine),
    )
    hydrated.push({
      ...hit,
      locator: {
        ...hit.locator,
        ...(hit.locator.headingPath === undefined && headingPath.length > 0
          ? { headingPath }
          : {}),
      },
      content,
      tokenEstimate: estimateTokens(content),
    })
  }

  return hydrated
}

export type AdjacentExpansionOptions = {
  enabled?: boolean
  maxPerHit?: number
}

function rangesOverlap(left: RetrievalHit, right: RetrievalHit): boolean {
  return (
    left.locator.startLine <= right.locator.endLine &&
    right.locator.startLine <= left.locator.endLine
  )
}

function endsWithSentenceBoundary(content: string): boolean {
  return /[.!?。！？…」』”’"')\]）〕】》]+$/.test(content.trim())
}

function startsWithContinuation(content: string): boolean {
  const firstLine = content.trim().split(/\r?\n/, 1)[0] ?? ''
  return (
    /^[a-z]/.test(firstLine) ||
    /^(?:and|but|or|also|however|therefore|그리고|그러나|하지만|또한|및|또는|따라서|이에 따라)(?:\b|\s|$)/i.test(
      firstLine,
    )
  )
}

/**
 * Add only mechanically adjacent chunks when the selected body visibly ends
 * mid-sentence or starts as a continuation. This is a bounded context hint,
 * not a completeness or prose-quality judgment.
 */
export function expandConditionalAdjacentRetrievalHits(
  primaryHits: readonly RetrievalHit[],
  candidates: readonly RetrievalHit[],
  options: AdjacentExpansionOptions = {},
): RetrievalHit[] {
  if (options.enabled === false) return [...primaryHits]
  const maxPerHit = Math.max(0, Math.floor(options.maxPerHit ?? 1))
  if (maxPerHit === 0) return [...primaryHits]

  const expanded = [...primaryHits]
  const selectedUnitIds = new Set(expanded.map((hit) => hit.locator.unitId))

  for (const primary of primaryHits) {
    if (primary.content === undefined) continue
    const directions: ('previous' | 'next')[] = []
    if (startsWithContinuation(primary.content)) directions.push('previous')
    if (!endsWithSentenceBoundary(primary.content)) directions.push('next')
    if (directions.length === 0) continue

    const pathCandidates = candidates.filter(
      (candidate) =>
        candidate.locator.path === primary.locator.path &&
        !selectedUnitIds.has(candidate.locator.unitId) &&
        !expanded.some((selected) => rangesOverlap(selected, candidate)),
    )
    for (const direction of directions) {
      if (directions.indexOf(direction) >= maxPerHit) continue
      const adjacent = pathCandidates
        .filter((candidate) =>
          direction === 'previous'
            ? candidate.locator.endLine < primary.locator.startLine
            : candidate.locator.startLine > primary.locator.endLine,
        )
        .sort((left, right) =>
          direction === 'previous'
            ? right.locator.endLine - left.locator.endLine ||
              right.locator.startLine - left.locator.startLine
            : left.locator.startLine - right.locator.startLine ||
              left.locator.endLine - right.locator.endLine,
        )[0]
      if (!adjacent || selectedUnitIds.has(adjacent.locator.unitId)) continue
      expanded.push({
        ...adjacent,
        provenance: [
          ...new Set<RetrievalProvenance>([...adjacent.provenance, 'adjacent']),
        ],
      })
      selectedUnitIds.add(adjacent.locator.unitId)
      if (
        expanded.length >=
        primaryHits.length + maxPerHit * primaryHits.length
      ) {
        return expanded
      }
    }
  }
  return expanded
}
