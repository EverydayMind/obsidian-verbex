import { App, normalizePath, parseYaml } from 'obsidian'
import path from 'path-browserify'

import { parseBatchContract } from '../core/batch/contracts'
import { migrateStoredToolNames } from '../tools/storedToolNames'
import { LoadedSkill, SkillFrontmatter, SkillSummary } from '../verbex/types'

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/

// Claude Code skills live in a folder named after the skill containing a
// `SKILL.md`. We also accept lowercase `skill.md` defensively.
const SKILL_FILE_NAMES = ['SKILL.md', 'skill.md']

/** Canonical vault Skill id: `vault:<folder or file name>`, NFC-normalized. */
export function vaultSkillId(folderOrFileName: string): string {
  return `vault:${folderOrFileName.normalize('NFC')}`
}

export type SkillLoadDiagnostic = {
  path: string
  stage: 'folder' | 'read' | 'parse' | 'empty'
  message: string
}

export type SkillScanResult = {
  skills: { summary: SkillSummary; body: string }[]
  diagnostics: SkillLoadDiagnostic[]
}

function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const match = markdown.match(FRONTMATTER_RE)
  if (!match) {
    return { frontmatter: {}, body: markdown }
  }
  const parsed = parseYaml(match[1]) as Record<string, unknown> | null
  return {
    frontmatter: parsed ?? {},
    body: markdown.slice(match[0].length),
  }
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * First descriptive line of a skill body, used as the overview only when the
 * frontmatter has neither `description` (Claude Code) nor `summary` (legacy).
 * Skips a leading H1 title; falls back to the first non-empty line otherwise.
 */
function deriveOverviewFromBody(body: string): string {
  const lines = body.split('\n').map((line) => line.trim())
  let passedHeading = false
  for (const line of lines) {
    if (!passedHeading && line.startsWith('#')) {
      passedHeading = true
      continue
    }
    if (passedHeading && line) return line
  }
  const firstNonEmpty = lines.find(Boolean)
  return firstNonEmpty ? firstNonEmpty.replace(/^#+\s*/, '').trim() : ''
}

function normalizeSkillFrontmatter(
  data: Record<string, unknown>,
  fallbackName: string,
): SkillFrontmatter {
  const name =
    typeof data.name === 'string' && data.name.trim()
      ? data.name.trim()
      : fallbackName
  const requiresHostTools = toStringArray(
    data['requires-host-tools'] ?? data.requiresHostTools,
  )
  return {
    name,
    description:
      typeof data.description === 'string' ? data.description : undefined,
    summary: typeof data.summary === 'string' ? data.summary : undefined,
    workflow: typeof data.workflow === 'string' ? data.workflow : undefined,
    trigger_keywords: toStringArray(data.trigger_keywords),
    applies_to: toStringArray(data.applies_to),
    // Claude Code uses the hyphenated `allowed-tools`; accept the camelCase
    // form too for convenience.
    allowedTools: migrateStoredToolNames(
      toStringArray(data['allowed-tools'] ?? data.allowedTools),
    ),
    tools: migrateStoredToolNames(toStringArray(data.tools)),
    requiredPlugins: toStringArray(
      data['required-plugins'] ?? data.requiredPlugins,
    ),
    preferredTools: toStringArray(
      data['preferred-tools'] ?? data.preferredTools,
    ),
    ...(requiresHostTools.length > 0 ? { requiresHostTools } : {}),
    cross_document: data.cross_document === true ? true : undefined,
    standalone: data.standalone === true ? true : undefined,
    disableModelInvocation:
      (data['disable-model-invocation'] ?? data.disableModelInvocation) === true
        ? true
        : undefined,
    batch: parseBatchContract(data.batch, 'skill.batch'),
  }
}

/**
 * Loads skills from a vault folder. Supports both layouts:
 *  - Claude Code: a subfolder per skill containing `SKILL.md`, so a skill
 *    authored for Claude Code can be copied in verbatim.
 *  - Legacy Verbex: a flat `<skill>.md` file directly in the folder.
 */
export class SkillLoader {
  constructor(
    private app: App,
    private skillsDir: string,
  ) {}

  async listSkills(): Promise<SkillSummary[]> {
    return (await this.scanSkills()).skills.map(({ summary }) => summary)
  }

  /** Like {@link listSkills} but also returns each skill's instruction body. */
  async loadAllSkills(): Promise<LoadedSkill[]> {
    return (await this.scanSkills()).skills.map(({ summary, body }) => ({
      ...summary,
      body,
    }))
  }

  async loadSkill(id: string): Promise<LoadedSkill | null> {
    const skills = await this.loadAllSkills()
    return skills.find((skill) => skill.id === id) ?? null
  }

  async scanSkills(): Promise<SkillScanResult> {
    const dir = normalizePath(this.skillsDir)
    if (!(await this.app.vault.adapter.exists(dir))) {
      const diagnostic: SkillLoadDiagnostic = {
        path: dir,
        stage: 'folder',
        message: 'skills folder does not exist',
      }
      console.warn(
        `[Verbex][skills] folder failed for ${dir}: ${diagnostic.message}`,
      )
      return { skills: [], diagnostics: [diagnostic] }
    }
    const listed = await this.app.vault.adapter.list(dir)

    console.debug('[Verbex][skills] scan started', {
      folder: dir,
      directFileCount: listed.files?.length ?? 0,
      directFolderCount: listed.folders?.length ?? 0,
      directFiles: (listed.files ?? []).map(normalizePath),
      directFolders: (listed.folders ?? []).map(normalizePath),
    })

    const results: { summary: SkillSummary; body: string }[] = []
    const diagnostics: SkillLoadDiagnostic[] = []

    // Claude Code layout: <skill-name>/SKILL.md
    for (const folder of listed.folders ?? []) {
      const parsed = await this.readDirSkill(folder, diagnostics)
      if (parsed) results.push(parsed)
    }

    // Legacy Verbex layout: flat <skill>.md in the folder
    const flatFiles = (listed.files ?? [])
      .map((file) => normalizePath(file))
      .filter((file) => file.toLowerCase().endsWith('.md'))
    for (const file of flatFiles) {
      try {
        const content = await this.app.vault.adapter.read(file)
        if (!content.trim()) {
          diagnostics.push({
            path: file,
            stage: 'empty',
            message: 'empty skill file',
          })
          continue
        }
        try {
          results.push(
            this.parseSkillFile(file, content, path.basename(file, '.md')),
          )
        } catch (error) {
          diagnostics.push({
            path: file,
            stage: 'parse',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      } catch (error) {
        diagnostics.push({
          path: file,
          stage: 'read',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    for (const diagnostic of diagnostics) {
      console.warn(
        `[Verbex][skills] ${diagnostic.stage} failed for ${diagnostic.path}: ${diagnostic.message}`,
      )
    }
    const sortedSkills = results.sort((a, b) =>
      a.summary.name.localeCompare(b.summary.name),
    )
    console.debug('[Verbex][skills] scan finished', {
      folder: dir,
      loadedCount: sortedSkills.length,
      loadedNames: sortedSkills.map(({ summary }) => summary.name),
      diagnosticCount: diagnostics.length,
    })
    return {
      skills: sortedSkills,
      diagnostics,
    }
  }

  private async readDirSkill(
    folder: string,
    diagnostics: SkillLoadDiagnostic[],
  ): Promise<{ summary: SkillSummary; body: string } | null> {
    const dir = normalizePath(folder)
    for (const fileName of SKILL_FILE_NAMES) {
      const filePath = normalizePath(`${dir}/${fileName}`)
      try {
        if (!(await this.app.vault.adapter.exists(filePath))) continue
        const content = await this.app.vault.adapter.read(filePath)
        if (!content.trim()) {
          diagnostics.push({
            path: filePath,
            stage: 'empty',
            message: 'empty skill file',
          })
          continue
        }
        try {
          return this.parseSkillFile(filePath, content, path.basename(dir))
        } catch (error) {
          diagnostics.push({
            path: filePath,
            stage: 'parse',
            message: error instanceof Error ? error.message : String(error),
          })
          return null
        }
      } catch (error) {
        diagnostics.push({
          path: filePath,
          stage: 'read',
          message: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    }
    return null
  }

  parseSkillFile(
    filePath: string,
    content: string,
    fallbackName: string,
    id: string = vaultSkillId(fallbackName),
  ): { summary: SkillSummary; body: string } {
    const { frontmatter, body } = parseFrontmatter(content)
    const fm = normalizeSkillFrontmatter(frontmatter, fallbackName)
    const description = fm.description?.trim()
    const summary = fm.summary?.trim()
    const overview = description
      ? description
      : summary
        ? summary
        : deriveOverviewFromBody(body)
    return { summary: { ...fm, id, overview, path: filePath }, body }
  }
}
