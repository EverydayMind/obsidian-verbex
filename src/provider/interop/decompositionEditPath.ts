import { L } from '../../i18n/modelText'

import { commitAllowed } from './commitPolicy'
import type { HostContext } from './editorActions'
import type { NativeHostOptions } from './hostOptions'
import type { JsonObject } from './protocol'

/** Availability is a fact about exposed tools and permissions, never a fallback execution. */
export function decompositionEditPath(
  host: HostContext,
  options: NativeHostOptions,
  exposed: readonly string[] = [],
  savePath?: string,
): JsonObject {
  const unavailable = (reason: string): JsonObject => ({
    state: 'unavailable',
    reason,
    manual: L({
      ko: '한글에서 원본 사본을 열어 직접 고치기',
      en: 'Open a copy of the original in Hancom Hangul and edit it manually',
    }),
  })
  if (!options.sessionEffects) return unavailable('session_effects_disabled')
  const found = host.getActiveDiscovered('hwp-hands')
  if (!found || !host.isCurrent('hwp-hands'))
    return unavailable('editor_unavailable')
  const plan = found.descriptor?.tools.find((t) => t.name === 'plan_edits')
  const save = found.descriptor?.tools.find((t) => t.name === 'save_document')
  if (!plan || !save || !host.isCurrent('hwp-hands', 'plan_edits'))
    return unavailable('edit_tools_unavailable')
  if (!exposed.includes('plg__hwp-hands__plan_edits'))
    return unavailable('edit_tool_not_exposed')
  if (!commitAllowed(options, found, save))
    return unavailable('save_document_grant_missing')
  if (
    !savePath ||
    host.vaultPath(savePath) !== savePath ||
    !/\.hwpx?$/i.test(savePath)
  )
    return unavailable('save_path_unverified')
  return { state: 'available', tool: 'plg__hwp-hands__plan_edits', savePath }
}
