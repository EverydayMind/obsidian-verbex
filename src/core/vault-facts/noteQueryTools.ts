import { getAllTags } from 'obsidian'

import { L } from '../../i18n/modelText'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import { listedFiles } from '../tools/fileListing'
import type {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
} from '../tools/localToolCommon'

import { noteMinuteTie } from './minuteTie'
import { matches, queryNotes, values } from './noteQuery'
import type { Note } from './noteQuery'
import { parseNoteArgs } from './noteQueryArgs'
import { formatNoteQueryGroups } from './noteQueryCrossGroup'
import { displayFields, missingFieldFacts, tieFact } from './noteQueryFacts'
import * as modelText from './noteQueryToolsText'
import { taskResult } from './taskQueryResult'

const cut = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s
const abort = (ctx: ToolExecutionContext) => {
  if (ctx.signal?.aborted) throw new Error(modelText.aborted())
}
const over = (notes: Note[]) =>
  notes.length > 3000 ||
  notes.reduce((n, f) => n + f.stat.size, 0) > 20 * 1024 * 1024
export async function executeNoteQuery(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  try {
    abort(ctx)
    const tasks = tool === 'list_tasks',
      q = parseNoteArgs(args, tasks)
    const prefix = q.shorthand
      .map(({ op }) =>
        L({
          ko: `조건 {field, ${op}: …}를 {field, op:"${op}", value: …}로 읽었습니다.`,
          en: `Read condition {field, ${op}: …} as {field, op:"${op}", value: …}.`,
        }),
      )
      .join('\n')
    const withPrefix = (text: string) => (prefix ? `${prefix}\n${text}` : text)
    const files = listedFiles(ctx, q.folder, 'md').filter(
      (f) => (!q.path || f.path === q.path) && !isAiPrivatePath(f.path),
    )
    if (q.path && !files.length) throw new Error(modelText.notFound(q.path))
    let unindexed = 0
    const notes: Note[] = files.map((f) => {
      const cache = ctx.app.metadataCache.getFileCache(f)
      if (!cache) unindexed++
      return {
        path: f.path,
        stat: f.stat,
        frontmatter: cache?.frontmatter ?? {},
        tags: cache
          ? (getAllTags(cache) ?? []).map((t) => t.replace(/^#/, ''))
          : [],
        listItems: cache?.listItems ?? [],
        bodyOffset: cache?.frontmatterPosition?.end.offset ?? 0,
        read: () => ctx.app.vault.cachedRead(f),
      }
    })
    const warnings = missingFieldFacts(notes, q, tasks)
    const pre = notes.filter((n) =>
      q.where
        .filter((c) => c.field.toLowerCase() !== 'text_count')
        .every((c) => matches(n, c)),
    )
    if (
      q.where.some((c) => c.field.toLowerCase() === 'text_count') &&
      (tasks || !q.text)
    )
      throw new Error(modelText.textCountError())
    const candidates = tasks
      ? pre.filter((n) => n.listItems.some((i) => i.task !== undefined))
      : pre
    if ((q.text || (tasks && q.group_by === 'owner')) && over(candidates))
      return {
        kind: 'read',
        text: withPrefix(
          modelText.budget(
            candidates.length,
            (
              candidates.reduce((n, f) => n + f.stat.size, 0) /
              1024 /
              1024
            ).toFixed(2),
          ),
        ),
        facts: { completeness: 'partial', errorCode: 'budget' },
      }
    const needle = q.text?.toLowerCase()
    if (!tasks && needle)
      for (const n of candidates) {
        abort(ctx)
        const body = (await n.read()).slice(n.bodyOffset).toLowerCase()
        let pos = 0,
          count = 0
        while ((pos = body.indexOf(needle, pos)) !== -1) {
          count++
          pos += needle.length
        }
        n.textCount = count
      }
    if (tasks) {
      const result = await taskResult(
        candidates,
        q,
        ctx,
        files.length,
        unindexed,
        warnings,
      )
      return result.kind === 'read'
        ? { ...result, text: withPrefix(result.text) }
        : result
    }
    const result = queryNotes(candidates, q)
    let text = modelText.scope(
      unindexed ? modelText.unindexed(unindexed) : '',
      q.folder ?? modelText.all(),
      files.length,
      result.notes.length,
    )
    if (warnings.length) text = `${warnings.join('\n')}\n${text}`
    if (q.text) text += modelText.occurrences(q.text, result.textTotal)
    if (
      [...q.where.map((c) => c.field), q.sort_by, ...q.fields].some((f) =>
        /^tasks\.(open|done)$/i.test(f),
      )
    )
      text += modelText.taskTotals(result.open, result.done)
    const grouped = formatNoteQueryGroups(
      result.notes,
      result.groups,
      q,
      result.crossGroups,
    )
    const groupPartial = grouped.partial
    text += grouped.text
    if (result.notes.length)
      text += modelText.page(
        q.offset + 1,
        result.notes.length,
        q.sort_by,
        q.order,
      )
    let returned = 0
    for (const n of result.notes.slice(q.offset, q.offset + q.limit)) {
      const line = `\n${n.path}${displayFields(q)
        .map(
          (f) =>
            `\t${f}=${cut(values(n, f)[0]?.text ?? modelText.noValue(), 120)}`,
        )
        .join('')}`
      if (text.length + line.length > 11700) break
      text += line
      returned++
    }
    const next =
      q.offset + returned < result.notes.length
        ? q.offset + returned
        : undefined
    text += tieFact(result.notes, q, returned)
    if (next !== undefined) text += modelText.nextPage(next)
    text += noteMinuteTie(result.notes, q.sort_by)
    abort(ctx)
    return {
      kind: 'read',
      text: withPrefix(text),
      facts: {
        total: result.notes.length,
        returned,
        ...(next !== undefined ? { nextOffset: next } : {}),
        completeness:
          unindexed || groupPartial || next !== undefined
            ? 'partial'
            : 'complete',
      },
    }
  } catch (e) {
    return {
      kind: 'error',
      message: e instanceof Error ? e.message : modelText.queryError(),
    }
  }
}
