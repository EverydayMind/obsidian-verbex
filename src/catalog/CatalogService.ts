import { App, normalizePath } from 'obsidian'

import { DEFAULT_PROMPTS_FOLDER, DEFAULT_WORKFLOWS_FOLDER } from '../constants'
import {
  TOOL_REGISTRY,
  canonicalToolName,
} from '../core/tools/toolCatalogRegistry'
import { withPluginSkillStates } from '../skills/pluginSkillListing'
import { mergeSkillCatalog } from '../skills/pluginSkillMerge'
import type {
  PluginSkillBody,
  PluginSkillSource,
} from '../skills/pluginSkillSource'
import retiredStarterHashes from '../skills/retiredStarterHashes.json'
import {
  SkillLoadDiagnostic,
  SkillLoader,
  SkillScanResult,
} from '../skills/SkillLoader'
import { sha256Hex } from '../utils/hash'
import {
  LoadedSkill,
  SkillSummary,
  WorkflowLoadError,
  WorkflowLoadResult,
} from '../verbex/types'
import { WorkflowLoader } from '../workflow/WorkflowLoader'

export type CatalogPaths = {
  skillsFolder: string
  workflowsFolder: string
  promptsFolder: string
}

export type CatalogWorkflowResult = {
  workflows: WorkflowLoadResult[]
  errors: WorkflowLoadError[]
}

/**
 * Shared, invalidatable catalog snapshots for the controller and chat UI.
 * In-flight scans are shared, while a vault/settings change invalidates the
 * relevant snapshot so a stale scan cannot become the next cached result.
 */
export class CatalogService {
  private paths: CatalogPaths
  private skillsLoader: SkillLoader
  private workflowLoader: WorkflowLoader
  private skillsPromise: Promise<SkillScanResult> | null = null
  private workflowsPromise: Promise<CatalogWorkflowResult> | null = null
  private mergedPromise: Promise<LoadedSkill[]> | null = null
  private pluginSkills: PluginSkillSource | null = null
  private generation = 0

  constructor(
    private readonly app: App,
    paths: CatalogPaths,
  ) {
    this.paths = normalizePaths(paths)
    this.skillsLoader = new SkillLoader(app, this.paths.skillsFolder)
    this.workflowLoader = new WorkflowLoader(
      app,
      this.paths.workflowsFolder,
      this.paths.promptsFolder,
    )
  }

  get revision(): number {
    return this.generation
  }

  setPaths(paths: CatalogPaths): void {
    const next = normalizePaths(paths)
    if (samePaths(this.paths, next)) return
    this.paths = next
    this.skillsLoader = new SkillLoader(this.app, next.skillsFolder)
    this.workflowLoader = new WorkflowLoader(
      this.app,
      next.workflowsFolder,
      next.promptsFolder,
    )
    this.invalidate()
  }

  invalidate(): void {
    this.generation += 1
    this.skillsPromise = null
    this.workflowsPromise = null
    this.mergedPromise = null
  }

  /** The plugin side of the Skill list (null: vault Skills only). */
  setPluginSkillSource(source: PluginSkillSource | null): void {
    this.pluginSkills = source
    this.invalidatePluginSkills()
  }

  /** Provider states changed: only the merged list is rebuilt. */
  invalidatePluginSkills(): void {
    this.generation += 1
    this.mergedPromise = null
  }

  async readPluginSkillBody(
    canonicalId: string,
    signal?: AbortSignal,
  ): Promise<PluginSkillBody> {
    return (
      (await this.pluginSkills?.readBody(canonicalId, signal)) ?? {
        ok: false,
        reason: 'not_current',
      }
    )
  }

  /** Forgets remembered plugin Skill body failures so the next request retries. */
  clearPluginSkillFaults(): void {
    this.pluginSkills?.clearFaults?.()
    this.invalidatePluginSkills()
  }

  invalidateForPath(...paths: (string | null | undefined)[]): void {
    if (
      paths.some((path) =>
        path ? isWithinCatalogPath(path, this.paths) : false,
      )
    ) {
      this.invalidate()
    }
  }

  async scanSkills(): Promise<SkillScanResult> {
    const generation = this.generation
    if (!this.skillsPromise) {
      this.skillsPromise = this.skillsLoader.scanSkills()
    }
    const result = await this.skillsPromise
    if (generation !== this.generation) return this.scanSkills()
    return result
  }

  /** Vault Skills plus those of active plugins, as one list. */
  async loadSkills(): Promise<LoadedSkill[]> {
    const generation = this.generation
    if (!this.mergedPromise) this.mergedPromise = this.mergeSkills()
    const result = await this.mergedPromise
    if (generation !== this.generation) return this.loadSkills()
    return [...result]
  }

  private async mergeSkills(): Promise<LoadedSkill[]> {
    const scan = await this.scanSkills()
    const merged = await mergeSkillCatalog({
      vault: scan.skills.map(({ summary, body }) => ({ ...summary, body })),
      plugin: this.pluginSkills?.list() ?? [],
      retired: retiredStarterHashes,
      vaultHash: (skill) => this.hashVaultSkill(skill.path),
      hostToolKnown: (name) =>
        Object.hasOwn(TOOL_REGISTRY, canonicalToolName(name)),
    })
    return withPluginSkillStates(merged, this.pluginSkills)
  }

  private async hashVaultSkill(path: string): Promise<string | undefined> {
    try {
      return await sha256Hex(
        (await this.app.vault.adapter.read(path)).replace(/\r\n/g, '\n'),
      )
    } catch {
      return undefined
    }
  }

  async listSkills(): Promise<SkillSummary[]> {
    return (await this.scanSkills()).skills.map(({ summary }) => summary)
  }

  async getSkillDiagnostics(): Promise<SkillLoadDiagnostic[]> {
    return (await this.scanSkills()).diagnostics
  }

  async listWorkflows(): Promise<CatalogWorkflowResult> {
    const generation = this.generation
    if (!this.workflowsPromise) {
      this.workflowsPromise = this.workflowLoader.listWorkflows()
    }
    const result = await this.workflowsPromise
    if (generation !== this.generation) return this.listWorkflows()
    return result
  }
}

function normalizePaths(paths: CatalogPaths): CatalogPaths {
  return {
    skillsFolder: normalizePath(paths.skillsFolder?.trim() ?? ''),
    workflowsFolder: normalizePath(
      paths.workflowsFolder?.trim() || DEFAULT_WORKFLOWS_FOLDER,
    ),
    promptsFolder: normalizePath(
      paths.promptsFolder?.trim() || DEFAULT_PROMPTS_FOLDER,
    ),
  }
}

function samePaths(left: CatalogPaths, right: CatalogPaths): boolean {
  return (
    left.skillsFolder === right.skillsFolder &&
    left.workflowsFolder === right.workflowsFolder &&
    left.promptsFolder === right.promptsFolder
  )
}

function isWithinCatalogPath(path: string, paths: CatalogPaths): boolean {
  const normalized = normalizePath(path)
  return [paths.skillsFolder, paths.workflowsFolder, paths.promptsFolder].some(
    (folder) =>
      Boolean(folder) &&
      (normalized === folder || normalized.startsWith(`${folder}/`)),
  )
}
