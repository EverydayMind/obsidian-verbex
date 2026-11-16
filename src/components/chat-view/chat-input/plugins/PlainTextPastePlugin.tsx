import { $insertDataTransferForPlainText } from '@lexical/clipboard'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  PasteCommandType,
} from 'lexical'
import { useEffect } from 'react'

/**
 * The chat input is intentionally a plain-text editor. NoFormatPlugin removes
 * text formatting, and submitted prompts are read as plain text, so importing
 * a browser's HTML clipboard payload can only add lossy structure. Prefer the
 * original text/plain payload whenever it is available.
 */
export function shouldPasteAsPlainText(
  clipboardData: Pick<DataTransfer, 'getData'>,
): boolean {
  return clipboardData.getData('text/plain').length > 0
}

function handlePaste(event: PasteCommandType): boolean {
  const clipboardData =
    event instanceof ClipboardEvent ? event.clipboardData : null

  // Leave image-only pastes to ImagePastePlugin/RichTextPlugin. They normally
  // have no text/plain payload, so this also preserves existing image support.
  if (!clipboardData || !shouldPasteAsPlainText(clipboardData)) {
    return false
  }

  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return false

  event.preventDefault()
  $insertDataTransferForPlainText(clipboardData, selection)
  return true
}

export default function PlainTextPastePlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      editor.registerCommand(PASTE_COMMAND, handlePaste, COMMAND_PRIORITY_HIGH),
    [editor],
  )

  return null
}
