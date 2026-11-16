import { canonicalDigest } from '../../security/promptInjectionBoundary'
import type { ToolArgs, ToolResult } from '../tools/localToolCommon'

import { type StyleApi, inspectStyle } from './kordocStyleApi'
import { type ParsedProfileNote } from './note'
import { profileSummaryView } from './profileNextStep'
import { isV1StatsView, readAnalysisView } from './semanticViews'
import { readSourceTextRange } from './sourceTextRead'
const string = (args: ToolArgs, key: string) => args[key] as string
export class ProfileReader {
  constructor(
    private path: (path: string) => string,
    private api: () => StyleApi,
    private result: (value: unknown, paths: string[]) => ToolResult,
  ) {}
  async readView(
    args: ToolArgs,
    note: ParsedProfileNote & { noteSha256: string },
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    const view = args.view ?? 'summary',
      offset = (args.offset as number) ?? 0,
      limit = (args.limit as number) ?? 20,
      machine = note.machine
    const base = {
      noteSha256: note.noteSha256,
      revision: machine.revision,
      profileRevisionSha256: await canonicalDigest(machine),
    }
    if (signal?.aborted) throw new Error('Report style operation cancelled.')
    if (isV1StatsView(view))
      return this.result(
        { ...base, state: 'unavailable', reason: 'snapshot_v1' },
        [string(args, 'profile_path')],
      )
    if (view === 'summary')
      return this.result(...(await profileSummaryView(base, machine, args)))
    if (view === 'guidance')
      return this.result({ ...base, guidance: note.guidance }, [
        string(args, 'profile_path'),
      ])
    if (view === 'source_text') {
      const source = await readSourceTextRange({
        api: this.api(),
        machine,
        path: this.path(machine.sourcePath),
        args,
        signal,
      })
      return this.result({ ...base, source }, [
        string(args, 'profile_path'),
        machine.sourcePath,
      ])
    }
    if (view === 'semantic' || view === 'ambiguous' || view === 'structure') {
      const page = await readAnalysisView({
        args,
        api: this.api(),
        path: this.path(machine.sourcePath),
        machine,
        offset,
        limit,
        signal,
      })
      return this.result({ ...base, ...page }, [
        string(args, 'profile_path'),
        machine.sourcePath,
      ])
    }
    const all =
      view === 'bindings'
        ? [
            ...machine.bindings.map((binding) => ({
              kind: 'binding' as const,
              ...binding,
            })),
            ...machine.fixedRegions.map((region) => ({
              kind: 'fixed_region' as const,
              ...region,
            })),
          ]
        : machine.snapshot.paragraphs.map((p) => ({
            ref: p.ref,
            prefix: p.prefix,
            textCodePoints: p.textCodePoints,
            paragraphStyle: p.paragraphStyle,
            candidates: p.candidates.map((candidate) => ({
              ...candidate,
              evidenceRefs: candidate.evidenceRefs.slice(0, 4),
              totalEvidenceRefs: candidate.evidenceRefs.length,
            })),
            measuredParagraph:
              machine.snapshot.paragraphStyles[p.paragraphStyle],
            measuredCharacters: [
              ...new Set(p.runs.map((run) => run.characterStyle)),
            ]
              .slice(0, 1)
              .map((index) => ({
                index,
                style: machine.snapshot.characterStyles[index],
              })),
            totalCharacterStyles: new Set(
              p.runs.map((run) => run.characterStyle),
            ).size,
          }))
    const items: typeof all = []
    for (const item of all.slice(offset, offset + limit)) {
      if (
        new TextEncoder().encode(JSON.stringify([...items, item])).byteLength >
        90 * 1024
      )
        break
      items.push(item as never)
    }
    let preview: unknown = null
    if (view === 'candidates' && args.include_source_previews === true) {
      try {
        preview = await inspectStyle(this.api(), {
          path: this.path(machine.sourcePath),
          expectedSha256: machine.snapshot.source.sha256,
          refs: (items as { ref: string }[]).map((item) => item.ref),
          signal,
        })
      } catch {
        if (signal?.aborted) throw new Error('Style preview cancelled.')
        preview = { status: 'error', code: 'preview_unavailable' }
      }
    }
    if (signal?.aborted) throw new Error('Report style operation cancelled.')
    return this.result(
      {
        ...base,
        items,
        total: all.length,
        nextOffset:
          offset + items.length < all.length ? offset + items.length : null,
        ...(view === 'bindings'
          ? {
              bindingCount: machine.bindings.length,
              fixedRegionCount: machine.fixedRegions.length,
            }
          : {}),
        ...(preview ? { preview } : {}),
      },
      [string(args, 'profile_path'), ...(preview ? [machine.sourcePath] : [])],
    )
  }
}
