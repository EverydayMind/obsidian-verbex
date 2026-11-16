import {
  AdvancedLinesDiffComputer,
  ILinesDiffComputerOptions,
  LineRangeMapping,
} from 'vscode-diff'

export type DiffBlock =
  | {
      type: 'unchanged'
      value: string
    }
  | {
      type: 'modified'
      originalValue?: string
      modifiedValue?: string
    }

function singleLongReplacement(
  previous: string[],
  next: string[],
): DiffBlock[] | undefined {
  if (previous.length !== next.length || previous.length < 2) return
  let changed = -1
  for (let i = 0; i < previous.length; i++) {
    if (!previous[i] || !next[i]) return
    if (previous[i] !== next[i]) {
      if (changed !== -1) return
      changed = i
    }
  }
  if (
    changed === -1 ||
    Math.max(previous[changed].length, next[changed].length) < 100_000 ||
    new Set(previous).size !== previous.length ||
    new Set(next).size !== next.length
  )
    return
  const blocks: DiffBlock[] = []
  if (changed > 0)
    blocks.push({
      type: 'unchanged',
      value: previous.slice(0, changed).join('\n'),
    })
  blocks.push({
    type: 'modified',
    originalValue: previous[changed],
    modifiedValue: next[changed],
  })
  if (changed + 1 < previous.length)
    blocks.push({
      type: 'unchanged',
      value: previous.slice(changed + 1).join('\n'),
    })
  return blocks
}
export function createDiffBlocks(
  currentMarkdown: string,
  incomingMarkdown: string,
): DiffBlock[] {
  // A single changed line has exactly one line-level hunk. Avoid the
  // character-level diff for very long lines; approval still sees both full
  // values and partial approval has the same single-hunk granularity.
  if (!currentMarkdown.includes('\n') && !incomingMarkdown.includes('\n')) {
    if (currentMarkdown === incomingMarkdown)
      return currentMarkdown
        ? [{ type: 'unchanged', value: currentMarkdown }]
        : []
    return [
      {
        type: 'modified',
        originalValue: currentMarkdown || undefined,
        modifiedValue: incomingMarkdown || undefined,
      },
    ]
  }
  // Match only unique nonempty context with one aligned long replacement.
  const previous = currentMarkdown.split('\n')
  const next = incomingMarkdown.split('\n')
  const fast = singleLongReplacement(previous, next)
  if (fast) return fast
  const blocks: DiffBlock[] = []

  const advOptions: ILinesDiffComputerOptions = {
    ignoreTrimWhitespace: false,
    computeMoves: true,
    maxComputationTimeMs: 0,
  }
  const advDiffComputer = new AdvancedLinesDiffComputer()

  const currentLines = previous
  const incomingLines = next
  const advLineChanges = advDiffComputer.computeDiff(
    currentLines,
    incomingLines,
    advOptions,
  ).changes

  let lastOriginalEndLineNumberExclusive = 1 // 1-indexed
  advLineChanges.forEach((change: LineRangeMapping) => {
    const oStart = change.originalRange.startLineNumber
    const oEnd = change.originalRange.endLineNumberExclusive
    const mStart = change.modifiedRange.startLineNumber
    const mEnd = change.modifiedRange.endLineNumberExclusive

    // Emit unchanged blocks
    if (oStart > lastOriginalEndLineNumberExclusive) {
      const unchangedValue = currentLines
        .slice(lastOriginalEndLineNumberExclusive - 1, oStart - 1)
        .join('\n')
      if (unchangedValue.length > 0) {
        blocks.push({
          type: 'unchanged',
          value: unchangedValue,
        })
      }
    }

    // Emit modified blocks
    const originalValue = currentLines.slice(oStart - 1, oEnd - 1).join('\n')
    const modifiedValue = incomingLines.slice(mStart - 1, mEnd - 1).join('\n')
    if (originalValue.length > 0 || modifiedValue.length > 0) {
      blocks.push({
        type: 'modified',
        originalValue: originalValue.length > 0 ? originalValue : undefined,
        modifiedValue: modifiedValue.length > 0 ? modifiedValue : undefined,
      })
    }

    lastOriginalEndLineNumberExclusive = oEnd
  })

  // Emit final unchanged blocks (if any)
  if (currentLines.length > lastOriginalEndLineNumberExclusive - 1) {
    const unchangedValue = currentLines
      .slice(lastOriginalEndLineNumberExclusive - 1)
      .join('\n')
    if (unchangedValue.length > 0) {
      blocks.push({
        type: 'unchanged',
        value: unchangedValue,
      })
    }
  }

  return blocks
}
