import { matchObsidianNote } from '../../utils/obsidian-query'

import { ToolExecutionContext, frontmatterDateText } from './localToolCommon'
import { LINE_LIMITS, scanBodyLines } from './obsidianQueryLinesScan'
import { LinesError } from './obsidianQueryLinesSession'
import type {
  LineScanState,
  NoteScanState,
  QueryScanInput,
} from './obsidianQueryScanState'

export type WalkBudget = {
  deadline: number
  bytes: number
  processed: number
  steps: number
  byteLimit?: number
  fullLines?: boolean
  beforeRead?: (index: number) => void
  checkDeadline?: () => void
}
export function checkLinesAbort(
  s: LineScanState | NoteScanState,
  ctx: ToolExecutionContext,
) {
  if (ctx.signal?.aborted) {
    s.invalidated = ''
    s.active = undefined
    s.pending = undefined
    throw new LinesError('aborted')
  }
}

/** At most one file's body is retained; misses never accumulate in memory. */
export async function nextLine(
  s: LineScanState,
  input: QueryScanInput,
  ctx: ToolExecutionContext,
  work: WalkBudget,
) {
  while (s.index < input.targets.length || s.active) {
    checkLinesAbort(s, ctx)
    work.checkDeadline?.()
    if (!s.active) {
      if (work.processed) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        checkLinesAbort(s, ctx)
      }
      if (
        work.processed &&
        (Date.now() >= work.deadline ||
          (input.targets[s.index].size <= LINE_LIMITS.fileBytes &&
            work.bytes + input.targets[s.index].size >
              (work.byteLimit ?? LINE_LIMITS.callBytes)))
      )
        return
      const target = input.targets[s.index]
      work.beforeRead?.(s.index)
      work.processed++
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
      if (
        !matchObsidianNote(target.file, content, cache, input.parsed).matches
      ) {
        s.index++
        s.notesScanned++
        continue
      }
      const date = frontmatterDateText(cache?.frontmatter?.date)
      s.active = {
        iterator: scanBodyLines(
          content,
          input.terms,
          target.path,
          date,
          work.fullLines ? Infinity : undefined,
        ),
        matched: false,
      }
    }
    // Always scan at least one block after a slow read or metadata collection.
    if (work.steps && work.steps % 2000 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      checkLinesAbort(s, ctx)
      if (Date.now() >= work.deadline) return
    }
    const next = s.active.iterator.next()
    work.steps++
    if (next.done) {
      if (!s.active.matched) s.noLineMatch.push(input.targets[s.index].path)
      s.active = undefined
      s.index++
      s.notesScanned++
      continue
    }
    if (next.value) {
      if (!s.active.matched) {
        s.notesMatched++
        s.active.matched = true
      }
      return next.value
    }
  }
}
