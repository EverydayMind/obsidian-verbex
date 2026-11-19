import { pendingApprovalReadFact } from '../../provider/interop/pendingApprovalFact'

import * as fileText from './fileLocalToolsText'
import type { ToolExecutionContext } from './localToolCommon'
import { sourceReadHint } from './sourceReadHint'

/**
 * Document states where a reader plugin could still deliver the text. A
 * document excluded by settings or absent from the vault is not one of them.
 */
const WAITING_FOR_READER = new Set([
  'disabled',
  'missing_projection',
  'stale',
  'needs_ocr',
  'extraction_failed',
])

/** '' unless a plugin awaits approval and a document read was not delivered. */
export function pendingApprovalSuffix(
  ctx: ToolExecutionContext,
  states: readonly string[],
): string {
  if (!states.some((state) => WAITING_FOR_READER.has(state))) return ''
  const fact = pendingApprovalReadFact(ctx.pendingApprovals?.() ?? [])
  return fact ? `\n${fact}` : ''
}

export async function unreadDocumentText(
  path: string,
  state: string,
  ctx: ToolExecutionContext,
): Promise<string> {
  return (
    fileText.unreadDocument(path, state, await sourceReadHint(path, ctx)) +
    pendingApprovalSuffix(ctx, [state])
  )
}
