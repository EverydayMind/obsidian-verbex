import { App } from 'obsidian'

import { getIndexProvenance } from './reviewIndexMetadata'
import { parseChecklist } from './treatyWiki'

export async function discoverIndexFolder(
  app: App,
): Promise<{ folder: string } | { candidates: string[] } | null> {
  const candidates: string[] = []
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.name !== '_checklist.md') continue
    const markdown = await app.vault.cachedRead(file)
    if (!getIndexProvenance(markdown)) continue
    if (parseChecklist(markdown).some((item) => item.state === 'pending')) {
      candidates.push(file.parent?.path ?? '')
    }
  }
  if (candidates.length === 1) return { folder: candidates[0] }
  if (candidates.length > 1) return { candidates }
  return null
}
