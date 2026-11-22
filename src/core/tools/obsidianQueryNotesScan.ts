import { getAllTags, parseFrontMatterAliases } from 'obsidian'

import { matchObsidianNote } from '../../utils/obsidian-query'

import { ToolExecutionContext, frontmatterDateText } from './localToolCommon'
import { LINE_LIMITS, LineHit, scanBodyLines } from './obsidianQueryLinesScan'
import { NoteHit } from './obsidianQueryLinesSession'
import { WalkBudget, checkLinesAbort } from './obsidianQueryLinesWalk'
import type { NoteScanState, QueryScanInput } from './obsidianQueryScanState'

/** One note per hit; note selection uses the existing full-note matcher. */
export async function nextNote(
  s: Omit<NoteScanState, 'pending'>,
  input: QueryScanInput,
  ctx: ToolExecutionContext,
  work: WalkBudget,
): Promise<NoteHit | undefined> {
  while (s.index < input.targets.length) {
    checkLinesAbort(s, ctx)
    work.checkDeadline?.()
    if (work.processed) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      checkLinesAbort(s, ctx)
    }
    const target = input.targets[s.index]
    if (
      work.processed &&
      (Date.now() >= work.deadline ||
        (target.size <= LINE_LIMITS.fileBytes &&
          work.bytes + target.size > (work.byteLimit ?? LINE_LIMITS.callBytes)))
    )
      return
    work.processed++
    work.beforeRead?.(s.index)
    if (target.size > LINE_LIMITS.fileBytes) {
      s.skippedFiles.push({ path: target.path, reason: 'size' })
      s.index++
      s.notesScanned++
      continue
    }
    work.bytes += target.size
    let content: string
    try {
      content = await ctx.app.vault.cachedRead(target.file)
    } catch {
      checkLinesAbort(s, ctx)
      s.skippedFiles.push({ path: target.path, reason: 'read' })
      s.index++
      s.notesScanned++
      continue
    }
    checkLinesAbort(s, ctx)
    const cache = ctx.app.metadataCache.getFileCache(target.file)
    const match = matchObsidianNote(target.file, content, cache, input.parsed)
    s.index++
    s.notesScanned++
    s.notesChecked++
    if (!match.matches) continue
    s.notesMatched++
    const date = frontmatterDateText(cache?.frontmatter?.date)
    let first: LineHit | null = null
    for (const hit of scanBodyLines(content, input.terms, target.path, date)) {
      work.checkDeadline?.()
      if (hit) {
        first = hit
        break
      }
      if (++work.steps % 2000 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        checkLinesAbort(s, ctx)
      }
    }
    const pieces = [
      target.path,
      target.file.basename,
      content,
      JSON.stringify(cache?.frontmatter ?? {}),
      (getAllTags(cache ?? {}) ?? []).join(' '),
      (parseFrontMatterAliases(cache?.frontmatter ?? null) ?? []).join(' '),
    ]
    const piece =
      first?.preview ??
      pieces.find((text) =>
        input.terms.some((term) => text.toLowerCase().includes(term)),
      ) ??
      pieces[3]
    const positions = input.terms
      .map((term) => piece.toLowerCase().indexOf(term))
      .filter((at) => at >= 0)
    const offset = !first && positions.length ? Math.min(...positions) : 0
    const start = Math.max(0, offset - 100)
    const preview = piece
      .slice(start, start + LINE_LIMITS.previewChars)
      .replace(/\s+/g, ' ')
      .trim()
    return {
      path: target.path,
      date,
      score: match.score,
      line: first?.line ?? null,
      preview: preview.slice(0, LINE_LIMITS.previewChars),
      truncated: first?.truncated ?? piece.length > LINE_LIMITS.previewChars,
    }
  }
}
