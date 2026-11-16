import { App, normalizePath } from 'obsidian'

import {
  DEFAULT_PROMPTS_FOLDER,
  DEFAULT_SKILLS_FOLDER,
  DEFAULT_WORKFLOWS_FOLDER,
  VERBEX_DIR,
} from '../constants'
import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'

import { seedReportWorkspace } from './seedReportWorkspace'
import { seedSystemPrompt } from './seedSystemPrompt'
import { ensureVaultDir, writeTextIfMissing } from './vault'

// Hidden, internal-only directories (not meant for direct user editing).
const VERBEX_INTERNAL_DIRS = [
  VERBEX_DIR,
  `${VERBEX_DIR}/Runs`,
  `${VERBEX_DIR}/Batch`,
  `${VERBEX_DIR}/index`,
  `${VERBEX_DIR}/checkpoints`,
  `${VERBEX_DIR}/backups`,
] as const

export async function bootstrapVerbexWorkspace(
  app: App,
  skillsFolder: string,
  workflowsFolder: string,
  promptsFolder: string,
  locale: ModelLocale = getModelLocale(),
): Promise<void> {
  const folders = [skillsFolder, workflowsFolder, promptsFolder].map((dir) =>
    normalizePath(dir.trim()).replace(/\/+$/, ''),
  )
  const existed = await Promise.all(
    folders.map((dir) => app.vault.adapter.exists(dir)),
  )
  const seed =
    folders.every(
      (dir, i) =>
        dir ===
        [
          DEFAULT_SKILLS_FOLDER,
          DEFAULT_WORKFLOWS_FOLDER,
          DEFAULT_PROMPTS_FOLDER,
        ][i],
    ) && existed.every((value) => !value)
  for (const dir of VERBEX_INTERNAL_DIRS) {
    await ensureVaultDir(app, dir)
  }

  for (const dir of folders) {
    await ensureVaultDir(app, dir)
  }

  if (seed) {
    const content = seedReportWorkspace(locale)
    await writeTextIfMissing(
      app,
      `${folders[0]}/report-writing/SKILL.md`,
      content.skill,
    )
    await writeTextIfMissing(
      app,
      `${folders[1]}/report.workflow.yaml`,
      content.workflow,
    )
    await writeTextIfMissing(app, `${folders[2]}/collect.md`, content.collect)
    await writeTextIfMissing(app, `${folders[2]}/draft.md`, content.draft)
  }
  await writeTextIfMissing(
    app,
    `${VERBEX_DIR}/system-prompt.md`,
    seedSystemPrompt(locale),
  )
}
