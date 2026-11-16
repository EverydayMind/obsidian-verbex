import type { Paragraph } from './types'

/** Sum text code points per character style; ties retain the first text run. */
export function representativeRun(paragraph: Paragraph, dominant = false) {
  const text = paragraph.runs.filter((run) => run.length > 0)
  if (!dominant) return text[0] ?? paragraph.runs[0]
  const totals = new Map<number, number>()
  for (const run of text)
    totals.set(
      run.characterStyle,
      (totals.get(run.characterStyle) ?? 0) + run.length,
    )
  let selected: Paragraph['runs'][number] | undefined
  for (const run of text)
    if (
      !selected ||
      (totals.get(run.characterStyle) ?? 0) >
        (totals.get(selected.characterStyle) ?? 0)
    )
      selected = run
  return selected ?? paragraph.runs[0]
}
