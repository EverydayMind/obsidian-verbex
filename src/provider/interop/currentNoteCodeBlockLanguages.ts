import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import { markdownCodeBlockLanguages } from '../../utils/markdownCodeBlocks'

/**
 * Code block languages in the turn's current Markdown note, used only as an
 * exposure hint. An AI-private, non-Markdown, missing or unreadable note
 * yields none; the text never leaves this function.
 */
export async function currentNoteCodeBlockLanguages(
  path: string | undefined,
  read: ((path: string) => Promise<string | undefined>) | undefined,
): Promise<readonly string[]> {
  if (!path || !read || !/\.md$/i.test(path) || isAiPrivatePath(path)) return []
  try {
    const text = await read(path)
    return text ? markdownCodeBlockLanguages(text) : []
  } catch {
    return []
  }
}
