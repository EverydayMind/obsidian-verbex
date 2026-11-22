import { DiffBlock, createDiffBlocks } from '../utils/chat/diff'

export const LOST_LINE_DICE_THRESHOLD = 0.5
export const LOST_LINE_MAX_PAIRS = 10_000
export const LOST_LINE_MAX_LENGTH = 4_096

function lines(value?: string): string[] {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function bigrams(line: string): Map<string, number> {
  const result = new Map<string, number>()
  for (let i = 0; i < line.length - 1; i++) {
    const pair = line.slice(i, i + 2)
    result.set(pair, (result.get(pair) ?? 0) + 1)
  }
  return result
}

function dice(a: string, b: string): number {
  const left = bigrams(a)
  const right = bigrams(b)
  let shared = 0
  for (const [pair, count] of left)
    shared += Math.min(count, right.get(pair) ?? 0)
  return a.length + b.length <= 2 ? 0 : (2 * shared) / (a.length + b.length - 2)
}

export function countLostLines(
  before: string,
  after: string,
  blocks?: DiffBlock[],
): { lost: number; capped: boolean } {
  const modified = (blocks ?? createDiffBlocks(before, after))
    .filter(
      (block): block is Extract<DiffBlock, { type: 'modified' }> =>
        block.type === 'modified',
    )
    .map((block) => ({
      removed: lines(block.originalValue),
      added: lines(block.modifiedValue),
    }))

  // Unchanged blocks already consume their own copies. Match remaining identical
  // lines across modified blocks, including moves and duplicate lines.
  const additions = new Map<string, number>()
  for (const block of modified)
    for (const line of block.added)
      additions.set(line, (additions.get(line) ?? 0) + 1)
  const matched = new Map<string, number>()
  for (const block of modified)
    block.removed = block.removed.filter((line) => {
      const count = additions.get(line) ?? 0
      if (!count) return true
      additions.set(line, count - 1)
      matched.set(line, (matched.get(line) ?? 0) + 1)
      return false
    })
  for (const block of modified)
    block.added = block.added.filter((line) => {
      const count = matched.get(line) ?? 0
      if (!count) return true
      matched.set(line, count - 1)
      return false
    })

  let lost = 0
  for (const { removed, added } of modified) {
    if (removed.length === added.length) continue
    if (!removed.length || !added.length) {
      lost += removed.length
      continue
    }
    if (
      removed.length * added.length > LOST_LINE_MAX_PAIRS ||
      [...removed, ...added].some((line) => line.length > LOST_LINE_MAX_LENGTH)
    )
      return { lost, capped: true }
    const candidates: { r: number; a: number; score: number }[] = []
    removed.forEach((oldLine, r) =>
      added.forEach((newLine, a) => {
        const score = dice(oldLine, newLine)
        if (score >= LOST_LINE_DICE_THRESHOLD) candidates.push({ r, a, score })
      }),
    )
    candidates.sort((a, b) => b.score - a.score)
    const usedRemoved = new Set<number>()
    const usedAdded = new Set<number>()
    for (const candidate of candidates) {
      if (usedRemoved.has(candidate.r) || usedAdded.has(candidate.a)) continue
      usedRemoved.add(candidate.r)
      usedAdded.add(candidate.a)
    }
    lost += removed.length - usedRemoved.size
  }
  return { lost, capped: false }
}
