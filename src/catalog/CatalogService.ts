import { App, normalizePath } from 'obsidian'

import { DEFAULT_PROMPTS_FOLDER, DEFAULT_WORKFLOWS_FOLDER } from '../constants'
import {
  SkillLoadDiagnostic,
  SkillLoader,
  SkillScanResult,
} from '../skills/SkillLoader'
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

  async loadSkills(): Promise<LoadedSkill[]> {
    const result = await this.scanSkills()
    return result.skills.map(({ summary, body }) => ({ ...summary, body }))
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
