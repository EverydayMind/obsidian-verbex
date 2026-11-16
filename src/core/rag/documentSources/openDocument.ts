import { App, TFile } from 'obsidian'

import { SourceTextReader } from '../sourceTextReader'

export async function openDocumentResult(
  app: App,
  path: string,
  startLine?: number,
  newTab = false,
): Promise<void> {
  const plugins = (
    app as App & { plugins?: { plugins?: Record<string, unknown> } }
  ).plugins?.plugins
  const source = await new SourceTextReader(app).read(path)
  const chunk = source?.document?.chunks.find(
    (c) =>
      startLine === undefined ||
      (c.startLine <= startLine && c.endLine >= startLine),
  )
  // Table Markdown is not an exact paragraph anchor; open the file in that case.
  const paragraph =
    chunk?.type !== 'table'
      ? chunk?.text
          .split('\n')
          .find((line) => line.trim())
          ?.replace(/^#{1,6}\s+/, '')
      : undefined
  const file = app.vault.getFileByPath(path)
  if (
    /\.pdf$/i.test(path) &&
    chunk?.page &&
    source?.document?.pageMode === 'layout'
  ) {
    await app.workspace.openLinkText(`${path}#page=${chunk.page}`, '', newTab)
    return
  }
  const hands = plugins?.['hwp-hands'] as
    | {
        openInEditor?: (
          file: TFile,
          target: { heading: string },
        ) => Promise<void>
      }
    | undefined
  if (hands?.openInEditor && file && paragraph) {
    try {
      // HWP's Markdown postprocessor handles anchors, but openLinkText does not.
      await hands.openInEditor(file, { heading: paragraph })
      return
    } catch {
      /* Fall back to the source file. */
    }
  }
  if (file) await app.workspace.getLeaf(newTab ? 'tab' : false).openFile(file)
}
