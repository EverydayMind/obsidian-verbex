/**
 * Block-level note comparison for merges. Identity is exact after
 * normalization; near-duplicates are the model's call and the user's approval.
 */

export type NoteBlock = {
  id: string
  kind: 'heading' | 'paragraph' | 'list_item' | 'code' | 'table' | 'quote'
  /** Offsets into the original content, end exclusive (excluding newline). */
  start: number
  end: number
  text: string
  norm: string
  headingLevel?: number
  headingText?: string
  blockId?: string
}

export type SplitFrontmatter = {
  /** Raw YAML between the fences, '' when absent. */
  yaml: string
  hasFrontmatter: boolean
  /** Offset where the body starts. */
  bodyStart: number
}

// An empty block (`---` directly followed by `---`) is valid frontmatter too.
const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/

export function splitFrontmatter(content: string): SplitFrontmatter {
  const match = FRONTMATTER.exec(content)
  if (!match) return { yaml: '', hasFrontmatter: false, bodyStart: 0 }
  return {
    yaml: match[1] ?? '',
    hasFrontmatter: true,
    bodyStart: match[0].length,
  }
}

type Line = { text: string; start: number; end: number }

function lines(content: string, from: number): Line[] {
  const result: Line[] = []
  let start = from
  while (start <= content.length) {
    const newline = content.indexOf('\n', start)
    const rawEnd = newline === -1 ? content.length : newline
    const end =
      rawEnd > start && content[rawEnd - 1] === '\r' ? rawEnd - 1 : rawEnd
    result.push({ text: content.slice(start, end), start, end })
    if (newline === -1) break
    start = newline + 1
  }
  return result
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d+[.)])\s+/
const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const BLOCK_ID = /\s\^([A-Za-z0-9-]+)\s*$/

export function normalizeBlockText(text: string): string {
  return text
    .normalize('NFC')
    .replace(BLOCK_ID, '')
    .split(/\r?\n/)
    .map((line) => line.replace(LIST_ITEM, '').trim())
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function hash(text: string): string {
  let value = 5381
  for (let i = 0; i < text.length; i += 1)
    value = ((value << 5) + value + text.charCodeAt(i)) | 0
  return (value >>> 0).toString(36).slice(0, 6)
}

/** Split the body (after frontmatter) into comparable blocks. */
export function splitBlocks(content: string): NoteBlock[] {
  const all = lines(content, splitFrontmatter(content).bodyStart)
  const blocks: NoteBlock[] = []
  const push = (kind: NoteBlock['kind'], group: Line[], extra = {}) => {
    const start = group[0].start
    const end = group[group.length - 1].end
    const text = content.slice(start, end)
    const norm = normalizeBlockText(text)
    if (!norm) return
    const blockId = BLOCK_ID.exec(text)?.[1]
    blocks.push({
      id: `b${blocks.length + 1}-${hash(norm)}`,
      kind,
      start,
      end,
      text,
      norm,
      ...(blockId ? { blockId } : {}),
      ...extra,
    })
  }
  let i = 0
  while (i < all.length) {
    const line = all[i]
    if (!line.text.trim()) {
      i += 1
      continue
    }
    const fence = FENCE.exec(line.text)
    if (fence) {
      let j = i + 1
      while (j < all.length && !all[j].text.trimStart().startsWith(fence[1]))
        j += 1
      const group = all.slice(i, Math.min(j + 1, all.length))
      push('code', group)
      i = j + 1
      continue
    }
    const heading = HEADING.exec(line.text)
    if (heading) {
      push('heading', [line], {
        headingLevel: heading[1].length,
        headingText: heading[2],
      })
      i += 1
      continue
    }
    if (LIST_ITEM.test(line.text)) {
      let j = i + 1
      while (
        j < all.length &&
        all[j].text.trim() &&
        !LIST_ITEM.test(all[j].text) &&
        /^\s{2,}/.test(all[j].text)
      )
        j += 1
      push('list_item', all.slice(i, j))
      i = j
      continue
    }
    const kind: NoteBlock['kind'] = line.text.trimStart().startsWith('|')
      ? 'table'
      : line.text.trimStart().startsWith('>')
        ? 'quote'
        : 'paragraph'
    let j = i + 1
    while (
      j < all.length &&
      all[j].text.trim() &&
      !HEADING.test(all[j].text) &&
      !FENCE.test(all[j].text) &&
      (kind !== 'paragraph' || !LIST_ITEM.test(all[j].text))
    )
      j += 1
    push(kind, all.slice(i, j))
    i = j
  }
  return blocks
}

export type BlockComparison = {
  identical: NoteBlock[]
  onlyInSource: NoteBlock[]
  onlyInTarget: NoteBlock[]
  /** Source blocks kept although duplicated: other notes link to them. */
  protectedDuplicates: { block: NoteBlock; anchor: string }[]
}

/**
 * `referencedAnchors` are subpaths other notes use for the source (`^id` or a
 * heading text). Those blocks are never dropped: after a merge the links point
 * at the target and need the anchor there.
 */
export function compareBlocks(
  source: string,
  target: string,
  referencedAnchors: ReadonlySet<string> = new Set(),
): BlockComparison {
  const sourceBlocks = splitBlocks(source)
  const targetBlocks = splitBlocks(target)
  const targetNorms = new Set(targetBlocks.map((block) => block.norm))
  const sourceNorms = new Set(sourceBlocks.map((block) => block.norm))
  const identical: NoteBlock[] = []
  const onlyInSource: NoteBlock[] = []
  const protectedDuplicates: BlockComparison['protectedDuplicates'] = []
  for (const block of sourceBlocks) {
    if (!targetNorms.has(block.norm)) {
      onlyInSource.push(block)
      continue
    }
    const anchor = blockAnchor(block, referencedAnchors)
    if (anchor) protectedDuplicates.push({ block, anchor })
    else identical.push(block)
  }
  return {
    identical,
    onlyInSource,
    onlyInTarget: targetBlocks.filter((block) => !sourceNorms.has(block.norm)),
    protectedDuplicates,
  }
}

function blockAnchor(
  block: NoteBlock,
  referencedAnchors: ReadonlySet<string>,
): string | null {
  if (block.blockId && referencedAnchors.has(`^${block.blockId}`))
    return `^${block.blockId}`
  if (block.headingText && referencedAnchors.has(block.headingText))
    return block.headingText
  return null
}

/**
 * Which source blocks a merge drops. A heading is dropped only when its whole
 * section is dropped too, so kept text never lands under a foreign heading.
 */
export function blocksToDrop(
  source: string,
  candidateIds: ReadonlySet<string>,
  protectedIds: ReadonlySet<string> = new Set(),
): NoteBlock[] {
  const blocks = splitBlocks(source)
  const drop = new Set(
    blocks
      .filter(
        (block) =>
          candidateIds.has(block.id) &&
          !protectedIds.has(block.id) &&
          block.kind !== 'heading',
      )
      .map((block) => block.id),
  )
  blocks.forEach((block, index) => {
    if (
      block.kind !== 'heading' ||
      !candidateIds.has(block.id) ||
      protectedIds.has(block.id)
    )
      return
    const level = block.headingLevel ?? 1
    let j = index + 1
    let sectionDropped = true
    while (
      j < blocks.length &&
      !(blocks[j].kind === 'heading' && (blocks[j].headingLevel ?? 1) <= level)
    ) {
      if (!drop.has(blocks[j].id) && blocks[j].kind !== 'heading')
        sectionDropped = false
      j += 1
    }
    if (sectionDropped) drop.add(block.id)
  })
  return blocks.filter((block) => drop.has(block.id))
}

/**
 * Remove the given blocks with their line breaks, and one blank separator line
 * when the removal would otherwise leave two in a row. Text elsewhere (code
 * blocks included) keeps its blank lines.
 */
export function removeBlocks(content: string, blocks: NoteBlock[]): string {
  let result = content
  for (const block of [...blocks].sort((a, b) => b.start - a.start)) {
    let end = lineBreakEnd(result, block.end)
    const before = result.slice(0, block.start)
    const precededByBlank = /(?:^|\n)\r?\n$/.test(before) || before === ''
    if (precededByBlank) {
      const blankEnd = lineBreakEnd(result, end)
      if (blankEnd > end && result.slice(end, blankEnd).trim() === '')
        end = blankEnd
    }
    result = before + result.slice(end)
  }
  return result
}

function lineBreakEnd(text: string, at: number): number {
  let end = at
  if (text[end] === '\r') end += 1
  if (text[end] === '\n') end += 1
  return end
}
