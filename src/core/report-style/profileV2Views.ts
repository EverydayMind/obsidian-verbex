import type { ToolArgs, ToolResult } from '../tools/localToolCommon'

import type { StyleApi } from './kordocStyleApi'
import type { ProfileV2 } from './profileV2'
import {
  type SavedNote,
  readV2Semantic,
  readV2Structure,
} from './profileV2Service'
import { readV2Stats } from './profileV2Stats'

const statsViews = new Set(['text_statistics', 'grammar', 'grammar_sequence'])
export function needsV2Live(view: unknown, hasReplay: boolean): boolean {
  return (
    typeof view === 'string' &&
    (view === 'structure' ||
      statsViews.has(view) ||
      (hasReplay && ['semantic', 'ambiguous'].includes(view)))
  )
}
export function readV2Live(
  args: ToolArgs,
  note: SavedNote<ProfileV2>,
  api: () => StyleApi,
  path: string,
  signal?: AbortSignal,
): Promise<ToolResult> {
  if (statsViews.has(args.view as string))
    return readV2Stats(
      args,
      note.machine,
      note.noteSha256,
      api,
      path,
      signal,
      note.compact,
    )
  if (args.view === 'structure')
    return readV2Structure(args, note, api(), path, signal)
  return readV2Semantic(args, note, api(), path, signal)
}
