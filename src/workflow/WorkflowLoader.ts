import { App, normalizePath } from 'obsidian'
import path from 'path-browserify'
import { parse } from 'yaml'

import { parseBatchContract } from '../core/batch/contracts'
import { CANONICAL_TOOL_MAP } from '../core/tools/toolDefinitions'
import { bridgeForRetiredTool } from '../provider/interop/knownBridges'
import { retiredToolReplacement } from '../provider/interop/retiredTools'
import { VERBEX_TOOL_NAME_SET } from '../verbex/tools'
import {
  StepVerificationSpec,
  WorkflowDefinition,
  WorkflowLoadError,
  WorkflowLoadResult,
  WorkflowStep,
} from '../verbex/types'

function ensureString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function ensureStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') return [value]
  return []
}

function normalizeVerification(
  value: unknown,
): StepVerificationSpec | undefined {
  if (!value || typeof value !== 'object') return undefined
  const spec = value as Record<string, unknown>
  const result: StepVerificationSpec = {}
  if (Array.isArray(spec.requiredSections)) {
    result.requiredSections = spec.requiredSections.map(String)
  }
  if (Array.isArray(spec.requiredArtifacts)) {
    result.requiredArtifacts = spec.requiredArtifacts.map(String)
  }
  if (typeof spec.requireCitations === 'boolean') {
    result.requireCitations = spec.requireCitations
  }
  if (typeof spec.requireCheckpoint === 'boolean') {
    result.requireCheckpoint = spec.requireCheckpoint
  }
  if (
    typeof spec.requireChecklistComplete === 'string' &&
    spec.requireChecklistComplete.trim()
  ) {
    result.requireChecklistComplete = spec.requireChecklistComplete
  }
  if (typeof spec.allowValidationOverride === 'boolean') {
    result.allowValidationOverride = spec.allowValidationOverride
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeWorkflow(raw: unknown, filePath: string): WorkflowDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Workflow YAML must be an object')
  }
  const data = raw as Record<string, unknown>
  const rawSteps = data.steps
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new Error('Workflow must contain at least one step')
  }
  const steps: WorkflowStep[] = rawSteps.map((rawStep, index) => {
    if (!rawStep || typeof rawStep !== 'object') {
      throw new Error(`steps[${index}] must be an object`)
    }
    const step = rawStep as Record<string, unknown>
    const id = ensureString(step.id, '')
    if (!id) {
      throw new Error(`steps[${index}].id is required`)
    }
    return {
      id,
      title: ensureString(step.title, id),
      description:
        typeof step.description === 'string' ? step.description : undefined,
      depends_on: ensureStringArray(step.depends_on),
      tool:
        typeof step.tool === 'string'
          ? (CANONICAL_TOOL_MAP[step.tool] ?? step.tool)
          : undefined,
      prompt_template:
        typeof step.prompt_template === 'string'
          ? step.prompt_template
          : undefined,
      model: typeof step.model === 'string' ? step.model : undefined,
      requires_approval:
        typeof step.requires_approval === 'boolean'
          ? step.requires_approval
          : undefined,
      open_output:
        typeof step.open_output === 'boolean' ? step.open_output : undefined,
      output_path:
        typeof step.output_path === 'string' ? step.output_path : undefined,
      output_artifact:
        typeof step.output_artifact === 'string'
          ? step.output_artifact
          : undefined,
      self_correction:
        typeof step.self_correction === 'boolean'
          ? step.self_correction
          : undefined,
      verification: normalizeVerification(step.verification),
      batch: parseBatchContract(step.batch, `steps[${index}].batch`),
      target_labels:
        step.target_labels && typeof step.target_labels === 'object'
          ? step.target_labels
          : undefined,
    }
  })

  return {
    id: ensureString(data.id, path.basename(filePath, '.workflow.yaml')),
    name: ensureString(data.name, path.basename(filePath, '.workflow.yaml')),
    description:
      typeof data.description === 'string' ? data.description : undefined,
    steps,
    auto_apply: data.auto_apply === true ? true : undefined,
    profiles:
      data.profiles && typeof data.profiles === 'object'
        ? (data.profiles as WorkflowDefinition['profiles'])
        : undefined,
    schemas:
      data.schemas && typeof data.schemas === 'object'
        ? (data.schemas as WorkflowDefinition['schemas'])
        : undefined,
    checklist:
      data.checklist && typeof data.checklist === 'object'
        ? data.checklist
        : undefined,
  }
}

function unsafeNestedQuantifier(pattern: string): boolean {
  return /\([^)]*[+*][^)]*\)\s*(?:[+*]|\{\d*,?\d*\})/.test(pattern)
}

function validateWorkflow(workflow: WorkflowDefinition): string[] {
  const errors: string[] = []
  const ids = new Set<string>()

  for (const step of workflow.steps) {
    if (ids.has(step.id)) {
      errors.push(`Duplicate step id: ${step.id}`)
    }
    ids.add(step.id)
    if (
      step.tool &&
      !VERBEX_TOOL_NAME_SET.has(step.tool) &&
      // A retired name still loads; the model's call to it is refused with the
      // host-written fact (toolExposureRefusal), nothing runs.
      !bridgeForRetiredTool(step.tool) &&
      !retiredToolReplacement(step.tool)
    ) {
      errors.push(`Unknown tool in step ${step.id}: ${step.tool}`)
    }
  }

  for (const step of workflow.steps) {
    for (const dependency of step.depends_on ?? []) {
      if (!ids.has(dependency)) {
        errors.push(`Step ${step.id} depends on missing step: ${dependency}`)
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byId = new Map(workflow.steps.map((step) => [step.id, step]))
  const visit = (stepId: string) => {
    if (visited.has(stepId)) return
    if (visiting.has(stepId)) {
      errors.push(`Circular dependency detected at step: ${stepId}`)
      return
    }
    visiting.add(stepId)
    for (const dependency of byId.get(stepId)?.depends_on ?? []) {
      visit(dependency)
    }
    visiting.delete(stepId)
    visited.add(stepId)
  }
  workflow.steps.forEach((step) => visit(step.id))

  for (const [profileId, profile] of Object.entries(workflow.profiles ?? {})) {
    for (const boundary of profile.boundaries ?? []) {
      if (unsafeNestedQuantifier(boundary.pattern)) {
        errors.push(
          `Unsafe nested quantifier in profile ${profileId}: ${boundary.pattern}`,
        )
        continue
      }
      try {
        new RegExp(boundary.pattern)
      } catch (error) {
        errors.push(
          `Invalid regex in profile ${profileId}: ${String(error)}. YAML regex patterns should use single quotes.`,
        )
      }
      // A3: rejectRemainder is compiled into `^(${rejectRemainder})\b` at
      // parse time (structureParser.ts), so validate it the same way as a
      // boundary pattern here rather than failing lazily during a build.
      if (boundary.rejectRemainder) {
        if (unsafeNestedQuantifier(boundary.rejectRemainder)) {
          errors.push(
            `Unsafe nested quantifier in profile ${profileId} rejectRemainder: ${boundary.rejectRemainder}`,
          )
        } else {
          try {
            new RegExp(`^(${boundary.rejectRemainder})\\b`, 'i')
          } catch (error) {
            errors.push(
              `Invalid rejectRemainder regex in profile ${profileId}: ${String(error)}.`,
            )
          }
        }
      }
    }
  }
  for (const [schemaId, schema] of Object.entries(workflow.schemas ?? {})) {
    if (!Array.isArray(schema.columns) || schema.columns.length === 0) {
      errors.push(`Schema ${schemaId} must declare at least one column`)
    }
  }

  return errors
}

function getExecutionOrder(workflow: WorkflowDefinition): string[] {
  const ordered: string[] = []
  const visited = new Set<string>()
  const byId = new Map(workflow.steps.map((step) => [step.id, step]))
  const visit = (stepId: string) => {
    if (visited.has(stepId)) return
    visited.add(stepId)
    for (const dependency of byId.get(stepId)?.depends_on ?? []) {
      visit(dependency)
    }
    ordered.push(stepId)
  }
  workflow.steps.forEach((step) => visit(step.id))
  return ordered
}

export class WorkflowLoader {
  constructor(
    private app: App,
    private workflowsDir: string,
    private promptsDir: string,
  ) {}

  // Verify every referenced prompt file exists under the Prompts folder. A
  // missing template is a load-time error so the workflow is excluded from the
  // runnable list instead of failing mid-run.
  private async validatePromptTemplates(
    workflow: WorkflowDefinition,
  ): Promise<string[]> {
    const errors: string[] = []
    for (const step of workflow.steps) {
      const references = [
        ...(step.prompt_template
          ? [{ label: 'prompt template', name: step.prompt_template }]
          : []),
        ...(step.batch?.slice_prompt
          ? [{ label: 'batch slice prompt', name: step.batch.slice_prompt }]
          : []),
      ]
      for (const reference of references) {
        const templatePath = normalizePath(
          `${this.promptsDir}/${reference.name}`,
        )
        if (!(await this.app.vault.adapter.exists(templatePath))) {
          errors.push(
            `Step ${step.id} references missing ${reference.label}: ${reference.name}`,
          )
        }
      }
    }
    return errors
  }

  async listWorkflows(): Promise<{
    workflows: WorkflowLoadResult[]
    errors: WorkflowLoadError[]
  }> {
    const dir = normalizePath(this.workflowsDir)
    if (!(await this.app.vault.adapter.exists(dir))) {
      const error = {
        path: dir,
        message: 'workflow folder does not exist',
      }
      console.warn('[Verbex][workflows] folder failed', error)
      return { workflows: [], errors: [error] }
    }
    const listed = await this.app.vault.adapter.list(dir)
    const files = listed.files
      .map((file) => normalizePath(file))
      .filter(
        (file) =>
          file.endsWith('.workflow.yaml') || file.endsWith('.workflow.yml'),
      )

    console.debug('[Verbex][workflows] scan started', {
      folder: dir,
      promptsFolder: normalizePath(this.promptsDir),
      directFileCount: listed.files?.length ?? 0,
      directFolderCount: listed.folders?.length ?? 0,
      workflowFiles: files,
    })

    const workflows: WorkflowLoadResult[] = []
    const errors: WorkflowLoadError[] = []

    for (const file of files) {
      try {
        const content = await this.app.vault.adapter.read(file)
        const workflow = normalizeWorkflow(parse(content), file)
        const validationErrors = [
          ...validateWorkflow(workflow),
          ...(await this.validatePromptTemplates(workflow)),
        ]
        if (validationErrors.length > 0) {
          throw new Error(validationErrors.join('; '))
        }
        workflows.push({
          workflow,
          path: file,
          executionOrder: getExecutionOrder(workflow),
        })
      } catch (error) {
        errors.push({
          path: file,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    workflows.sort((a, b) => a.workflow.name.localeCompare(b.workflow.name))
    console.debug('[Verbex][workflows] scan finished', {
      folder: dir,
      loadedCount: workflows.length,
      loadedIds: workflows.map(({ workflow }) => workflow.id),
      errorCount: errors.length,
    })
    for (const error of errors) {
      console.warn('[Verbex][workflows] workflow excluded', error)
    }
    return { workflows, errors }
  }
}
