import {
  SerializedEditorState,
  SerializedParagraphNode,
  SerializedTextNode,
} from 'lexical'

/**
 * Build a minimal Lexical editor state holding a single paragraph of plain
 * text. Used to submit messages programmatically (e.g. the "NEXT" button) so
 * the user does not have to type "진행하세요" / "go ahead" themselves.
 */
export function plainTextToEditorState(text: string): SerializedEditorState {
  const textNode: SerializedTextNode = {
    type: 'text',
    version: 1,
    text,
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
  }
  const paragraphNode: SerializedParagraphNode = {
    type: 'paragraph',
    version: 1,
    indent: 0,
    direction: 'ltr',
    format: '',
    textFormat: 0,
    textStyle: '',
    children: [textNode],
  }
  return {
    root: {
      type: 'root',
      version: 1,
      indent: 0,
      direction: 'ltr',
      format: '',
      children: [paragraphNode],
    },
  }
}
