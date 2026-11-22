import type { ToolExecutionContext } from '../tools/localToolCommon'
import { linePathAllowed, linesPolicy } from '../tools/obsidianQueryLinesAccess'
import type { LineHit } from '../tools/obsidianQueryLinesScan'
import { LINE_LIMITS } from '../tools/obsidianQueryLinesScan'
import type { NoteHit } from '../tools/obsidianQueryLinesSession'
import { nextLine } from '../tools/obsidianQueryLinesWalk'
import { nextNote } from '../tools/obsidianQueryNotesScan'
import { freshScanState } from '../tools/obsidianQueryScanState'

import { checkCensusAbort } from './abort'
import type { CensusSnapshot } from './types'

export const CENSUS_SCAN_LIMITS = {
  ms: 5000,
  bytes: 32 * 1024 * 1024,
  rows: 20_000,
}
export type CensusScanBudget = { deadline: number; bytes: number; rows: number }
export const newCensusScanBudget = (): CensusScanBudget => ({
  deadline: Date.now() + CENSUS_SCAN_LIMITS.ms,
  bytes: CENSUS_SCAN_LIMITS.bytes,
  rows: CENSUS_SCAN_LIMITS.rows,
})
class CensusBudgetReached extends Error {}
class CensusRevisionChanged extends Error {}
export type CensusScanResult = {
  status: 'complete' | 'host_partial' | 'invalidated'
  rows: (LineHit | NoteHit)[]
  scanned: number
  remaining: number
  skippedPaths: string[]
}

/** No model session, page generation, cursor, ledger writes, or provider calls. */
export async function scanCensus(
  snapshot: CensusSnapshot,
  ctx: ToolExecutionContext,
  budget = newCensusScanBudget(),
  fullLines = false,
): Promise<CensusScanResult> {
  const state = freshScanState()
  const rows: (LineHit | NoteHit)[] = []
  const policy = linesPolicy(ctx)
  const checkTime = () => {
    checkCensusAbort(ctx.signal)
    if (Date.now() >= budget.deadline) throw new CensusBudgetReached()
  }
  const validate = (
    index: number,
    files?: Map<string, import('obsidian').TFile>,
  ) => {
    checkCensusAbort(ctx.signal)
    const target = snapshot.targets[index]
    const file = files
      ? files.get(target.path)
      : ctx.app.vault.getFileByPath
        ? ctx.app.vault.getFileByPath(target.path)
        : ctx.app.vault.getMarkdownFiles().find((f) => f.path === target.path)
    if (
      policy !== linesPolicy(ctx) ||
      !file ||
      file !== target.file ||
      file.path !== target.path ||
      file.stat.mtime !== target.mtime ||
      file.stat.size !== target.size ||
      !linePathAllowed(target.path, ctx)
    )
      throw new CensusRevisionChanged()
  }
  const work = {
    deadline: budget.deadline,
    bytes: 0,
    processed: 0,
    steps: 0,
    fullLines,
    byteLimit: budget.bytes,
    checkDeadline: checkTime,
    beforeRead: (index: number) => {
      checkTime()
      validate(index)
      const size = snapshot.targets[index].size
      if (size <= LINE_LIMITS.fileBytes && work.bytes + size > budget.bytes)
        throw new CensusBudgetReached()
    },
  }
  let status: CensusScanResult['status'] = 'complete'
  try {
    while (state.index < snapshot.targets.length || state.active) {
      checkTime()
      if (rows.length >= budget.rows) throw new CensusBudgetReached()
      const hit =
        snapshot.mode === 'lines'
          ? await nextLine(state, snapshot, ctx, work)
          : await nextNote(state, snapshot, ctx, work)
      checkCensusAbort(ctx.signal)
      if (!hit) {
        if (state.index < snapshot.targets.length || state.active)
          status = 'host_partial'
        break
      }
      rows.push(hit)
    }
  } catch (error) {
    checkCensusAbort(ctx.signal)
    if (error instanceof CensusBudgetReached) status = 'host_partial'
    else if (error instanceof CensusRevisionChanged) status = 'invalidated'
    else throw error
  }
  // Recheck even already scanned targets and skipped targets before combining rows.
  if (status !== 'invalidated') {
    try {
      const files = new Map(
        ctx.app.vault.getMarkdownFiles().map((f) => [f.path, f]),
      )
      snapshot.targets.forEach((_, i) => validate(i, files))
    } catch (error) {
      if (!(error instanceof CensusRevisionChanged)) throw error
      status = 'invalidated'
    }
  }
  checkCensusAbort(ctx.signal)
  budget.bytes -= work.bytes
  budget.rows -= rows.length
  return {
    status,
    rows: status === 'invalidated' ? [] : rows,
    scanned: state.notesScanned,
    remaining: snapshot.targets.length - state.notesScanned,
    skippedPaths: state.skippedFiles.map((f) => f.path),
  }
}
