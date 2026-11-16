import { sha256Hex } from '../../utils/hash'
import { splitTextIntoChunks } from '../llm/chunking'
import { parseHeadings } from '../tools/noteSlicing'
import { IndexSource, parseStructure } from '../tools/structureParser'

export type SegmenterProfile = string

export type SegmentSource = {
  path: string
  content: string
}

export type SegmentAtom = {
  id: string
  stableId: string
  profile: SegmenterProfile
  sourcePath: string
  sourceIndex: number
  startLine: number
  endLine: number
  body: string
  contentHash: string
  boundaryKey: string
}

export type SegmentResult = {
  profile: SegmenterProfile
  atoms: SegmentAtom[]
  warnings: string[]
}

export async function segmentSources(input: {
  sources: SegmentSource[]
  profile: SegmenterProfile
  maxTokens: number
  overlapLines?: number
}): Promise<SegmentResult> {
  if (input.sources.length === 0) {
    return { profile: input.profile, atoms: [], warnings: [] }
  }
  if (input.profile !== 'headings' && input.profile !== 'token_chunks')
    return segmentByProfile(input)
  const atoms: SegmentAtom[] = []
  for (let sourceIndex = 0; sourceIndex < input.sources.length; sourceIndex++) {
    const source = input.sources[sourceIndex]
    const sourceAtoms =
      input.profile === 'headings'
        ? headingAtoms(source, sourceIndex)
        : await tokenChunkAtoms(
            source,
            sourceIndex,
            input.maxTokens,
            input.overlapLines ?? 0,
          )
    atoms.push(...(await finalizeAtoms(sourceAtoms, input.sources.length)))
  }
  return { profile: input.profile, atoms, warnings: [] }
}

export async function segmentByProfile(input: {
  sources: SegmentSource[]
  profile: SegmenterProfile
  maxTokens: number
}): Promise<SegmentResult> {
  const sources: IndexSource[] = input.sources.map((source) => ({
    path: source.path,
    lines: source.content.split('\n'),
  }))
  const parsed = parseStructure(
    sources,
    input.maxTokens,
    'chunks',
    input.profile,
  )
  const sourceIndexByPath = new Map(
    input.sources.map((source, index) => [source.path, index]),
  )
  const drafts = parsed.units.map((unit) => {
    const sourceIndex = sourceIndexByPath.get(unit.sourcePath) ?? 0
    const lines = input.sources[sourceIndex].content.split('\n')
    return {
      stableId: unit.orderKey,
      profile: input.profile,
      sourcePath: unit.sourcePath,
      sourceIndex,
      startLine: unit.startLine,
      endLine: unit.endLine,
      body: lines.slice(unit.startLine - 1, unit.endLine).join('\n'),
      boundaryKey: unit.orderKey.split('-', 1)[0],
    }
  })
  return {
    profile: input.profile,
    atoms: await finalizeAtoms(drafts, input.sources.length),
    warnings: parsed.warnings,
  }
}

type AtomDraft = Omit<SegmentAtom, 'id' | 'contentHash'>

function headingAtoms(source: SegmentSource, sourceIndex: number): AtomDraft[] {
  const lines = source.content.split('\n')
  const headings = parseHeadings(lines)
  if (headings.length === 0) {
    return [
      {
        stableId: '__document__',
        profile: 'headings',
        sourcePath: source.path,
        sourceIndex,
        startLine: 1,
        endLine: lines.length,
        body: source.content,
        boundaryKey: '__document__',
      },
    ]
  }

  const drafts: AtomDraft[] = []
  if (headings[0].line > 1) {
    drafts.push({
      stableId: '__preamble__',
      profile: 'headings',
      sourcePath: source.path,
      sourceIndex,
      startLine: 1,
      endLine: headings[0].line - 1,
      body: lines.slice(0, headings[0].line - 1).join('\n'),
      boundaryKey: '__preamble__',
    })
  }

  const stack: { level: number; component: string; path: string }[] = []
  const siblingCounts = new Map<string, number>()
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]
    while ((stack.at(-1)?.level ?? 0) >= heading.level) stack.pop()
    const parentPath = stack.at(-1)?.path ?? ''
    const normalized = heading.heading.trim().replace(/\s+/g, ' ')
    const siblingKey = `${parentPath}\u0000${normalized}`
    const occurrence = (siblingCounts.get(siblingKey) ?? 0) + 1
    siblingCounts.set(siblingKey, occurrence)
    const component =
      occurrence === 1 ? normalized : `${normalized}[${occurrence}]`
    const path = parentPath ? `${parentPath}/${component}` : component
    const endLine = (headings[index + 1]?.line ?? lines.length + 1) - 1
    drafts.push({
      stableId: path,
      profile: 'headings',
      sourcePath: source.path,
      sourceIndex,
      startLine: heading.line,
      endLine,
      body: lines.slice(heading.line - 1, endLine).join('\n'),
      boundaryKey: parentPath || path,
    })
    stack.push({ level: heading.level, component, path })
  }
  return drafts
}

async function tokenChunkAtoms(
  source: SegmentSource,
  sourceIndex: number,
  maxTokens: number,
  overlapLines: number,
): Promise<AtomDraft[]> {
  const chunks = await splitTextIntoChunks(source.content, { maxTokens })
  const drafts: AtomDraft[] = []
  let searchOffset = 0
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]
    const offset = source.content.indexOf(chunk, searchOffset)
    const safeOffset = offset >= 0 ? offset : searchOffset
    let startLine = source.content.slice(0, safeOffset).split('\n').length
    let body = chunk
    if (overlapLines > 0 && drafts.length > 0) {
      const prefix = source.content
        .split('\n')
        .slice(Math.max(0, startLine - 1 - overlapLines), startLine - 1)
      body = [...prefix, chunk].join('\n')
      startLine -= prefix.length
    }
    const endLine = startLine + body.split('\n').length - 1
    drafts.push({
      stableId: `chunk:${String(index + 1).padStart(6, '0')}`,
      profile: 'token_chunks',
      sourcePath: source.path,
      sourceIndex,
      startLine,
      endLine,
      body,
      boundaryKey: source.path,
    })
    searchOffset = safeOffset + chunk.length
  }
  return drafts
}

async function finalizeAtoms(
  drafts: AtomDraft[],
  sourceCount: number,
): Promise<SegmentAtom[]> {
  return Promise.all(
    drafts.map(async (draft) => ({
      ...draft,
      id:
        sourceCount > 1
          ? `${draft.sourceIndex}:${draft.stableId}`
          : draft.stableId,
      contentHash: await sha256Hex(draft.body),
    })),
  )
}

export function compareAtomReuse(input: {
  profile: SegmenterProfile
  previous: SegmentAtom[]
  next: SegmentAtom[]
  overlap?: boolean
}): { reusableIds: string[]; invalidatedIds: string[] } {
  if (input.profile !== 'token_chunks') {
    const previousHashes = new Map(
      input.previous.map((atom) => [atom.stableId, atom.contentHash]),
    )
    const reusableIds = input.next
      .filter((atom) => previousHashes.get(atom.stableId) === atom.contentHash)
      .map((atom) => atom.id)
    const reusable = new Set(reusableIds)
    return {
      reusableIds,
      invalidatedIds: input.next
        .filter((atom) => !reusable.has(atom.id))
        .map((atom) => atom.id),
    }
  }

  let prefix = 0
  while (
    prefix < input.previous.length &&
    prefix < input.next.length &&
    input.previous[prefix].contentHash === input.next[prefix].contentHash
  ) {
    prefix += 1
  }
  if (input.overlap && prefix > 0 && prefix < input.next.length) prefix -= 1
  return {
    reusableIds: input.next.slice(0, prefix).map((atom) => atom.id),
    invalidatedIds: input.next.slice(prefix).map((atom) => atom.id),
  }
}
