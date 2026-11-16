import { t } from '../../i18n'

import { withTimeout } from './discoveryLifecycle'
import type { UndoOptions, UndoResult } from './editorUndo'
import { readToolResult } from './resultReader'
import { parseResolvedTarget, readSessionMeta } from './sessionProtocol'

/** An old card must never undo a newer edit, a reopened session, or another document. */
export async function resolveUndoTarget(options: UndoOptions) {
  const { handle, fact } = options
  if (
    !fact.incarnation ||
    fact.revisionAfter === undefined ||
    !handle.resolveTarget
  )
    throw new Error(t('nativeProviderR10.undoTargetUnavailable'))
  const target = parseResolvedTarget(
    await withTimeout(
      Promise.resolve().then(() =>
        Reflect.apply(handle.resolveTarget!, handle.provider, [
          'undo_last_edit',
          { path: options.vaultPath(fact.path) },
          {
            caller: {
              pluginId: options.selfId,
              conversationId: options.conversationId,
              runId: 'undo-check',
              turnId: 'undo-check',
            },
            requestId: 'undo-check',
            signal: new AbortController().signal,
          },
        ]),
      ),
      options.timeoutMs ?? 5000,
      t('nativeProviderR10.undoTargetTimeout'),
    ),
  )
  if (
    target.kind !== 'existing' ||
    target.document.path !== fact.path ||
    target.document.sessionId !== fact.sessionId ||
    target.document.incarnation !== fact.incarnation ||
    target.revision !== fact.revisionAfter
  )
    throw new Error(t('nativeProviderR10.undoDocumentChanged'))
  return target
}

/** Validate the receipt against the document the person selected in the card. */
export function parseUndoResult(
  raw: unknown,
  options: UndoOptions,
): UndoResult {
  const result = readToolResult(
    raw,
    {
      name: 'undo_last_edit',
      description: '',
      inputSchema: { type: 'object' },
      effect: 'session',
      resourceTypes: [],
      keywords: [],
    },
    options.vaultPath,
  )
  const { receipt } = readSessionMeta(result.meta)
  if (
    receipt.path !== options.fact.path ||
    receipt.sessionId !== options.fact.sessionId ||
    receipt.revisionBefore !== options.fact.revisionAfter
  )
    throw new Error(t('nativeProviderR10.undoReceiptMismatch'))
  return {
    undone: receipt.applied === 'yes',
    revisionAfter: receipt.revisionAfter,
    message: result.text,
  }
}
