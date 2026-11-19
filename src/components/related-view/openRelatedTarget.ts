import { App, View } from 'obsidian'

import { isDocumentPath } from '../../core/rag/documentSources/indexableSources'
import { openMarkdownFile } from '../../utils/obsidian'

function leafFilePath(view: View): string | undefined {
  if ('file' in view) {
    const file = (view as { file?: { path?: unknown } | null }).file
    return typeof file?.path === 'string' ? file.path : undefined
  }
  return undefined
}

export function openRelatedTarget(
  app: App,
  path: string,
  centerPath?: string,
): void {
  if (isDocumentPath(path)) {
    openMarkdownFile(app, path)
    return
  }
  const file = app.vault.getFileByPath(path)
  if (!file) return

  const targetLeaf =
    (centerPath
      ? app.workspace
          .getLeavesOfType('markdown')
          .find(
            (leaf) =>
              !(
                typeof leaf.getViewState === 'function' &&
                leaf.getViewState().pinned
              ) && leafFilePath(leaf.view) === centerPath,
          )
      : undefined) ?? app.workspace.getLeaf(false)

  void targetLeaf.openFile(file, { active: true })
}
