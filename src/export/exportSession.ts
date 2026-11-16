import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'

import { VERBEX_BUILD_INFO } from '../buildInfo'
import { t } from '../i18n'

import type { SessionSnapshot } from './sessionBundle'
import { scrubExport, sessionMarkdown } from './sessionBundle'

export type ExportSource = {
  name: string
  scope: 'conversation' | 'shared'
  read: () => Promise<unknown>
}

/** Exclusive new directory/files: never overwrites user files or reads attachments. */
export async function exportSession(input: {
  folder: string
  snapshot: SessionSnapshot
  secrets: string[]
  sources: ExportSource[]
}): Promise<string> {
  if (!path.isAbsolute(input.folder))
    throw new Error(t('ui.exportSession.enterAnAbsoluteFolderPath'))
  if (!(await fs.stat(input.folder)).isDirectory())
    throw new Error(t('ui.exportSession.thisIsNotAFolder'))
  const snapshot = scrubExport(input.snapshot, input.secrets) as SessionSnapshot
  const files: Record<string, string> = {
    'conversation.json': JSON.stringify(snapshot, null, 2),
    'conversation.md': sessionMarkdown(snapshot),
    'audit.json': JSON.stringify(snapshot.auditLog, null, 2),
    'build.json': JSON.stringify(VERBEX_BUILD_INFO, null, 2),
    'README.txt': t(
      'ui.exportSession.verbexImprovementAnalysisExportNIncludesConversationsTool',
    ),
  }
  const sources: { name: string; scope: string; status: string }[] = []
  for (const source of input.sources) {
    // Names are internal constants, never source IDs or paths from a transcript.
    if (
      !/^[a-z][a-z0-9-]*\.json$/.test(source.name) ||
      source.name in files ||
      source.name === 'manifest.json'
    )
      throw new Error(t('ui.exportSession.invalidExportFileName'))
    try {
      const value = await source.read()
      if (value !== null)
        files[source.name] = JSON.stringify(
          scrubExport(value, input.secrets),
          null,
          2,
        )
      sources.push({
        name: source.name,
        scope: source.scope,
        status: value === null ? 'missing' : 'included',
      })
    } catch {
      sources.push({
        name: source.name,
        scope: source.scope,
        status: 'read-failed',
      })
    }
  }
  const destination = await fs.mkdtemp(
    path.join(
      input.folder,
      `verbex-session-${new Date().toISOString().replace(/[:.]/g, '-')}-`,
    ),
  )
  const manifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    snapshotCapturedAt: snapshot.capturedAt ?? null,
    conversationId: snapshot.conversationId,
    inProgress: snapshot.inProgress,
    sources,
    files: Object.entries(files).map(([name, text]) => ({
      name,
      bytes: Buffer.byteLength(text),
      sha256: createHash('sha256').update(text).digest('hex'),
    })),
  }
  for (const [name, text] of Object.entries(files))
    await fs.writeFile(path.join(destination, name), text, {
      encoding: 'utf8',
      flag: 'wx',
    })
  await fs.writeFile(
    path.join(destination, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    { encoding: 'utf8', flag: 'wx' },
  )
  return destination
}
