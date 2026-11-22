import { App, normalizePath } from 'obsidian'

import { CatalogService } from '../../catalog/CatalogService'
import {
  DEFAULT_PROMPTS_FOLDER,
  DEFAULT_WORKFLOWS_FOLDER,
} from '../../constants'
import { LexicalIndexRepository } from '../../context/LexicalIndex'
import { RAGEngine } from '../../core/rag/ragEngine'
import { VerbexSettings } from '../../settings/schema/setting.types'
import { skillAvailability } from '../../skills/skillAvailability'
import { SkillLoader } from '../../skills/SkillLoader'
import { SkillRouter } from '../../skills/SkillRouter'
import { matchSkillsByTriggers } from '../../skills/skillTriggerMatching'
import { isAutomaticallySelectable } from '../../skills/standaloneSkills'
import { ChatSkillContextItem, ChatWorkflowContextItem } from '../../types/chat'
import { RequestMessage, ResponseFormat } from '../../types/llm/request'
import {
  LoadedSkill,
  StepVerificationSpec,
  WorkflowDefinition,
} from '../../verbex/types'
import { WorkflowLoader } from '../../workflow/WorkflowLoader'
import { tokenCount } from '../llm/token'
import { formatSelectionSizeFact } from '../obsidian'
import type { SelectionSizeFact } from '../obsidian'

/** A chat run has at most one executable workflow. Skills may still compose. */
export const MAX_SELECTED_WORKFLOW_GUIDES = 1
const MAX_WORKFLOW_GUIDE_TOKENS = 2400
const MAX_WORKFLOW_TEMPLATE_TOKENS = 800

export class PromptGenerator {
  private app: App
  private settings: VerbexSettings
  private catalogService: CatalogService
  private selectedSkillNames: string[] | null = null
  // null/[] = no workflow; exactly one id = active workflow. Multiple ids are
  // rejected to [] instead of silently choosing by array order.
  private selectedWorkflowIds: string[] | null = null

  constructor(
    _getRagEngine: () => Promise<RAGEngine>,
    app: App,
    settings: VerbexSettings,
    _getRagEngineIfReady: () => RAGEngine | null = () => null,
    _lexicalIndex?: LexicalIndexRepository,
    catalogService?: CatalogService,
  ) {
    this.app = app
    this.settings = settings
    this.catalogService =
      catalogService ??
      new CatalogService(app, {
        skillsFolder: settings.skillsFolder,
        workflowsFolder: settings.workflowsFolder,
        promptsFolder: settings.promptsFolder,
      })
  }

  public setSelectedSkillNames(names: string[] | null): void {
    this.selectedSkillNames = names
  }

  public setSelectedWorkflowIds(ids: string[] | null): void {
    this.selectedWorkflowIds = ids && ids.length <= 1 ? ids : []
  }

  /**
   * Lists the runnable workflows for the chat UI: id + name + overview (one-line
   * description, falling back to the step flow) with exactly zero or one
   * `included` flag derived from `selectedWorkflowIds`.
   */
  public async buildWorkflowContext(
    selectedWorkflowIds: string[] | null,
  ): Promise<ChatWorkflowContextItem[]> {
    const workflows = await this.loadWorkflows()
    const selectedWorkflowId =
      selectedWorkflowIds?.length === 1 ? selectedWorkflowIds[0] : null
    return Promise.all(
      workflows.map(async ({ workflow, executionOrder }) => {
        const steps = await Promise.all(
          workflow.steps.map(async (step) => ({
            id: step.id,
            title: step.title,
            ...(step.description ? { description: step.description } : {}),
            ...(step.tool ? { tool: step.tool } : {}),
            ...(typeof step.open_output === 'boolean'
              ? { openOutput: step.open_output }
              : {}),
            ...(step.output_path ? { outputPath: step.output_path } : {}),
            ...(step.output_artifact
              ? { outputArtifact: step.output_artifact }
              : {}),
            ...(step.prompt_template || step.batch?.slice_prompt
              ? {
                  prompt:
                    (await this.readPromptTemplateForGuide(
                      step.batch?.slice_prompt ?? step.prompt_template ?? '',
                    )) ?? undefined,
                }
              : {}),
            dependsOn: step.depends_on ?? [],
            ...(step.verification ? { verification: step.verification } : {}),
            ...(step.batch ? { batch: step.batch } : {}),
            ...(step.target_labels ? { targetLabels: step.target_labels } : {}),
          })),
        )
        return {
          id: workflow.id,
          name: workflow.name,
          overview: this.getWorkflowOverview(workflow, executionOrder),
          guide: await this.buildWorkflowGuide(workflow, executionOrder),
          schemas: workflow.schemas,
          profiles: workflow.profiles,
          checklist: workflow.checklist,
          verification: this.mergeWorkflowVerification(workflow),
          steps,
          selfCorrection: workflow.steps.some((step) => step.self_correction),
          autoApply: workflow.auto_apply === true ? true : undefined,
          included: workflow.id === selectedWorkflowId,
        }
      }),
    )
  }

  private mergeWorkflowVerification(
    workflow: WorkflowDefinition,
  ): StepVerificationSpec | undefined {
    const specs = workflow.steps
      .map((step) => step.verification)
      .filter((spec): spec is StepVerificationSpec => Boolean(spec))
    if (specs.length === 0) return undefined
    const unique = (values: string[]) => [...new Set(values)]
    return {
      requiredSections: unique(
        specs.flatMap((spec) => spec.requiredSections ?? []),
      ),
      requiredArtifacts: unique(
        specs.flatMap((spec) => spec.requiredArtifacts ?? []),
      ),
      requireCitations: specs.some((spec) => spec.requireCitations),
      requireCheckpoint: specs.some((spec) => spec.requireCheckpoint),
    }
  }

  public async buildSkillContext(
    selectedSkillNames: string[] | null,
    overrides: Record<string, string> = {},
  ): Promise<ChatSkillContextItem[]> {
    const loader = new SkillLoader(this.app, this.settings.skillsFolder)
    const skills = (await this.loadSkills()).map((skill) => {
      const content = overrides[skill.path]
      if (content === undefined) return skill
      const { summary, body } = loader.parseSkillFile(
        skill.path,
        content,
        skill.name,
      )
      return { ...summary, body }
    })
    return Promise.all(
      skills.map(async (skill) => ({
        name: skill.name,
        path: skill.path,
        overview: skill.overview,
        workflow: skill.workflow,
        // SKILL.md body, injected when the skill is selected (see
        // buildGuideInstructions). Bounded by a token budget so one oversized
        // skill — or several selected at once — cannot flood a small model's
        // context. Normal skills are well under the cap and pass through
        // untouched; only a pathologically large body is trimmed, with a marker
        // so the model knows it was cut. Mirrors the workflow-guide budget.
        instructions: await this.truncateByTokenBudget(
          skill.body,
          // F-1: use the user-configured skill token budget (defaults to 5000
          // to preserve the previous hard-coded cap). Setting a lower value
          // lets memory-constrained deployments reduce skill injection size.
          this.settings.verbex.context.skillTokenBudget,
          'skill instructions truncated',
        ),
        // Scoping declarations enforced at injection time (B-3).
        appliesTo: skill.applies_to,
        allowedTools: skill.allowedTools,
        tools: skill.tools,
        preferredTools: skill.preferredTools,
        requiredPlugins: skill.requiredPlugins,
        triggerKeywords: skill.trigger_keywords,
        crossDocument: skill.cross_document,
        standalone: skill.standalone,
        disableModelInvocation: skill.disableModelInvocation,
        batch: skill.batch,
        included:
          selectedSkillNames === null ||
          selectedSkillNames.includes(skill.name),
      })),
    )
  }

  /** Automatic candidates exclude skills whose required plugins are disabled. */
  private isAutoCandidate(skill: LoadedSkill): boolean {
    const registry = (
      this.app as unknown as { plugins?: { enabledPlugins?: Set<string> } }
    )?.plugins?.enabledPlugins
    return (
      isAutomaticallySelectable(skill) &&
      skillAvailability(skill, (id) => registry?.has(id) ?? true).available
    )
  }

  /**
   * Deterministic skill routing by `trigger_keywords` (no LLM round trip).
   * Returns the names of skills whose declared trigger keywords appear in the
   * query, so small / local models get reliable skill activation independent of
   * (and as a fallback for) the LLM-based selector. See
   * {@link matchSkillsByTriggers}.
   */
  public async selectSkillsByTriggers(query: string): Promise<string[]> {
    const skills = await this.loadSkills()
    return matchSkillsByTriggers(
      query,
      skills.filter((skill) => this.isAutoCandidate(skill)),
    )
  }

  /** Resolve one runnable workflow explicitly bound to keyword-matched skills. */
  public async selectWorkflowBySkillBindings(
    keywordSkillNames: readonly string[],
  ): Promise<string | null> {
    if (keywordSkillNames.length === 0) return null
    const [skills, workflows] = await Promise.all([
      this.buildSkillContext([...keywordSkillNames]),
      this.loadWorkflows(),
    ])
    return SkillRouter.resolveSkillBoundWorkflow(
      keywordSkillNames,
      skills,
      workflows.map(({ workflow }) => workflow.id),
    )
  }

  /** Returns skill name + first descriptive line for each skill file. */
  public async buildSkillSelectionMessages(
    userQuery: string,
  ): Promise<RequestMessage[] | null> {
    const skills = (await this.loadSkills()).filter((skill) =>
      this.isAutoCandidate(skill),
    )
    if (skills.length === 0) return null

    const overviews = skills.map(
      (skill) => `- "${skill.name}": ${skill.overview}`,
    )

    return [
      {
        role: 'system' as const,
        content:
          'You are a skill selector. Given available skills and a user query, return a JSON array of skill names that are relevant to the query. Return [] if none apply. Respond with ONLY the JSON array, nothing else.',
      },
      {
        role: 'user' as const,
        content: `Available skills:\n${overviews.join('\n')}\n\nUser query: ${userQuery}\n\nReturn JSON array of applicable skill names:`,
      },
    ]
  }

  public static parseSkillSelectionResponse(response: string): string[] {
    return PromptGenerator.parseJsonStringArrayResponse(response)
  }

  /** Returns workflow id + overview for lightweight LLM workflow selection. */
  public async buildWorkflowSelectionMessages(
    userQuery: string,
  ): Promise<RequestMessage[] | null> {
    const workflows = await this.loadWorkflows()
    if (workflows.length === 0) return null

    const overviews = workflows.map(({ workflow, executionOrder }) => {
      return `- "${workflow.id}" (${workflow.name}): ${this.getWorkflowOverview(workflow, executionOrder)}`
    })

    return [
      {
        role: 'system' as const,
        content:
          'You are a workflow guide selector. Choose AT MOST ONE workflow whose requested operation and deliverable fully match the user query. Shared subject matter alone is insufficient: a legal or budget question does not request clause-by-clause document review, index creation, or a revision report. Return [] for ordinary questions or information lookup when no workflow matches the requested operation. Never combine workflows. Respond with ONLY a JSON array containing zero or one id, nothing else.',
      },
      {
        role: 'user' as const,
        content: `Available workflow guides:\n${overviews.join('\n')}\n\nUser query: ${userQuery}\n\nReturn JSON array of applicable workflow ids:`,
      },
    ]
  }

  public static parseWorkflowSelectionResponse(response: string): string[] {
    const workflows = PromptGenerator.parseJsonStringArrayResponse(response)
    return workflows.length === 1 ? workflows : []
  }

  /**
   * Combined skill + workflow selector. Returns the messages AND a
   * `response_format` JSON schema whose `skills`/`workflows` arrays are
   * enum-constrained to the exact names/ids on offer, so an OpenAI-compatible
   * server (LM Studio / llama.cpp etc.) can only emit valid selections instead
   * of hallucinating names like a tiny local model otherwise does. The allowed
   * sets are returned too for defense-in-depth filtering on providers that
   * ignore `response_format`. One LLM round trip. Returns null when there is
   * nothing to select from.
   */
  public async buildSelection(
    userQuery: string,
    sizeFact?: SelectionSizeFact | null,
  ): Promise<{
    messages: RequestMessage[]
    responseFormat: ResponseFormat
    allowedSkillNames: string[]
    allowedWorkflowIds: string[]
  } | null> {
    const [skills, workflows] = await Promise.all([
      this.loadSkills().then((skills) =>
        skills.filter((skill) => this.isAutoCandidate(skill)),
      ),
      this.loadWorkflows(),
    ])
    if (skills.length === 0 && workflows.length === 0) return null

    const allowedSkillNames = skills.map((skill) => skill.name)
    const allowedWorkflowIds = workflows.map(({ workflow }) => workflow.id)

    const skillOverviews = skills.map(
      (skill) => `- "${skill.name}": ${skill.overview}`,
    )
    const workflowOverviews = workflows.map(
      ({ workflow, executionOrder }) =>
        `- "${workflow.id}" (${workflow.name}): ${this.getWorkflowOverview(workflow, executionOrder)}`,
    )
    const sizeFactText = formatSelectionSizeFact(sizeFact ?? null)

    const messages: RequestMessage[] = [
      {
        role: 'system' as const,
        content:
          'You select skills and a workflow guide for the operation and deliverable requested by the user. Shared subject matter alone is insufficient: a legal or budget question does not request clause-by-clause document review, index creation, summarization, or report writing. Select a writing/review skill only when that operation is requested. Skills may be combined. Choose AT MOST ONE workflow whose operation and deliverable fully match; never combine workflows. Ordinary questions or information lookup usually need workflows: []. Respond with ONLY a JSON object {"skills": ["name", ...], "workflows": [] or ["one-id"]} using the exact names and ids given. Use empty arrays when nothing applies. No prose.',
      },
      {
        role: 'user' as const,
        content: [
          skillOverviews.length > 0
            ? `Available skills:\n${skillOverviews.join('\n')}`
            : 'Available skills: (none)',
          workflowOverviews.length > 0
            ? `Available workflow guides:\n${workflowOverviews.join('\n')}`
            : 'Available workflow guides: (none)',
          ...(sizeFactText
            ? [`Selected file/folder facts:\n${sizeFactText}`]
            : []),
          `User query: ${userQuery}`,
          'Return JSON {"skills": [...], "workflows": [...]}:',
        ].join('\n\n'),
      },
    ]

    return {
      messages,
      responseFormat: PromptGenerator.buildSelectionResponseFormat(
        allowedSkillNames,
        allowedWorkflowIds,
      ),
      allowedSkillNames,
      allowedWorkflowIds,
    }
  }

  /**
   * JSON schema constraining the selector output to `{skills, workflows}` where
   * each array's items are restricted to the offered names/ids. An empty offer
   * list becomes a "must be empty array" constraint (an empty `enum` is invalid
   * JSON Schema) so the model can't invent values for a category with none.
   */
  private static buildSelectionResponseFormat(
    allowedSkillNames: string[],
    allowedWorkflowIds: string[],
  ): ResponseFormat {
    const arraySchema = (
      values: string[],
      maxItems?: number,
    ): Record<string, unknown> =>
      values.length > 0
        ? {
            type: 'array',
            ...(maxItems === undefined ? {} : { maxItems }),
            items: { type: 'string', enum: values },
          }
        : { type: 'array', maxItems: 0, items: { type: 'string' } }
    return {
      type: 'json_schema',
      json_schema: {
        name: 'skill_workflow_selection',
        schema: {
          type: 'object',
          properties: {
            skills: arraySchema(allowedSkillNames),
            workflows: arraySchema(allowedWorkflowIds, 1),
          },
          required: ['skills', 'workflows'],
          additionalProperties: false,
        },
      },
    }
  }

  /**
   * Parse the selector's JSON. When `allowed` sets are supplied, values outside
   * them are dropped — defense in depth for providers that ignore
   * `response_format` (or a model that breaks the schema anyway), so a
   * hallucinated skill/workflow name never reaches selection.
   */
  public static parseSelectionResponse(
    response: string,
    allowed?: { skills?: string[]; workflows?: string[] },
  ): {
    skills: string[]
    workflows: string[]
  } {
    try {
      const match = response.match(/\{[\s\S]*\}/)
      if (!match) return { skills: [], workflows: [] }
      const parsed = JSON.parse(match[0]) as unknown
      if (typeof parsed !== 'object' || parsed === null) {
        return { skills: [], workflows: [] }
      }
      const obj = parsed as Record<string, unknown>
      const workflows = PromptGenerator.filterToAllowed(
        PromptGenerator.toStringArray(obj.workflows),
        allowed?.workflows,
      )
      return {
        skills: PromptGenerator.filterToAllowed(
          PromptGenerator.toStringArray(obj.skills),
          allowed?.skills,
        ),
        workflows: workflows.length === 1 ? workflows : [],
      }
    } catch {
      return { skills: [], workflows: [] }
    }
  }

  /**
   * Keep only values present in `allowed` (deduped, original order). When
   * `allowed` is omitted, the list passes through unchanged.
   */
  private static filterToAllowed(
    values: string[],
    allowed?: string[],
  ): string[] {
    if (!allowed) return values
    const allowedSet = new Set(allowed)
    const seen = new Set<string>()
    return values.filter(
      (value) =>
        allowedSet.has(value) && !seen.has(value) && (seen.add(value), true),
    )
  }

  private static toStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  }

  private static parseJsonStringArrayResponse(response: string): string[] {
    try {
      const match = response.match(/\[[\s\S]*?\]/)
      if (!match) return []
      const parsed: unknown = JSON.parse(match[0])
      if (!Array.isArray(parsed)) return []
      return parsed.filter((item): item is string => typeof item === 'string')
    } catch {
      return []
    }
  }

  /**
   * Loads every skill (with its instruction body) from the configured skills
   * folder. Delegates discovery to {@link SkillLoader}, which understands both
   * the Claude Code layout (`<skill-name>/SKILL.md`) and the legacy flat
   * `<skill>.md` layout, so a Claude Code skill can be dropped in as-is.
   *
   * Reads via the vault adapter (raw filesystem), not getAbstractFileByPath:
   * the skills folder lives under .verbex/ (a dotfolder), and Obsidian's
   * file-explorer tree does not track dotfolders.
   */
  private async loadSkills(): Promise<LoadedSkill[]> {
    const folderPath = this.settings.skillsFolder?.trim()
    if (!folderPath) {
      console.warn(
        '[Verbex][skills] No skills folder configured (settings.skillsFolder is empty); no skills will load.',
      )
      return []
    }
    try {
      const skills = await this.catalogService.loadSkills()
      console.debug(
        `[Verbex][skills] Discovered ${skills.length} skill(s) in "${normalizePath(
          folderPath,
        )}": [${skills.map((s) => s.name).join(', ')}]`,
      )
      return skills
    } catch (error) {
      console.warn(
        `[Verbex][skills] Failed to load skills from "${folderPath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return []
    }
  }

  /** Diagnostics are consumed only by interactive UI boundaries. */
  async getSkillDiagnostics() {
    return this.catalogService.getSkillDiagnostics()
  }

  // Reads the runnable configured workflows via WorkflowLoader so
  // the chat UI workflow list and the guide-injection selection match exactly the
  // workflows that load cleanly (invalid ones — bad steps, missing prompt
  // templates — are excluded). Returns [] on any load failure.
  private async loadWorkflows(): Promise<
    Awaited<ReturnType<WorkflowLoader['listWorkflows']>>['workflows']
  > {
    const folderPath =
      this.settings.workflowsFolder?.trim() || DEFAULT_WORKFLOWS_FOLDER
    const promptsPath =
      this.settings.promptsFolder?.trim() || DEFAULT_PROMPTS_FOLDER
    try {
      const { workflows, errors } = await this.catalogService.listWorkflows()
      console.debug('[Verbex][workflows] chat catalog result', {
        folder: normalizePath(folderPath),
        promptsFolder: normalizePath(promptsPath),
        loadedCount: workflows.length,
        loadedIds: workflows.map(({ workflow }) => workflow.id),
        errorCount: errors.length,
        errors,
      })
      return workflows
    } catch (error) {
      console.warn(
        `[Verbex][workflows] Failed to list workflows in "${folderPath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return []
    }
  }

  /** One-line overview for a workflow: its description, or the step flow. */
  private getWorkflowOverview(
    workflow: WorkflowDefinition,
    executionOrder: string[],
  ): string {
    if (workflow.description?.trim()) return workflow.description.trim()
    const byId = new Map(workflow.steps.map((step) => [step.id, step]))
    return executionOrder
      .map((stepId) => byId.get(stepId)?.title ?? stepId)
      .join(' → ')
  }

  private async buildWorkflowGuide(
    workflow: WorkflowDefinition,
    executionOrder: string[],
  ): Promise<string> {
    const byId = new Map(workflow.steps.map((step) => [step.id, step]))
    const lines = [
      `# ${workflow.name} (id: ${workflow.id})`,
      workflow.description?.trim()
        ? `Purpose: ${workflow.description.trim()}`
        : null,
      `Execution order: ${executionOrder.join(' → ')}`,
      '',
      'Use this as procedural guidance inside the current chat. Preserve the conversation history and ask for missing inputs when a step cannot be completed from available vault context.',
    ].filter(Boolean) as string[]

    for (const stepId of executionOrder) {
      const step = byId.get(stepId)
      if (!step) continue
      lines.push('', `## Step: ${step.title} (id: ${step.id})`)
      if (step.description?.trim()) {
        lines.push(`Description: ${step.description.trim()}`)
      }
      if (step.depends_on?.length) {
        lines.push(`Depends on: ${step.depends_on.join(', ')}`)
      }
      if (step.tool) {
        lines.push(`Legacy tool hint: ${step.tool}`)
      }
      if (step.output_artifact) {
        lines.push(`Expected artifact: ${step.output_artifact}`)
      }
      if (step.output_path) {
        lines.push(`Legacy output path: ${step.output_path}`)
      }
      if (step.verification) {
        lines.push(
          `Verification: ${JSON.stringify(step.verification, null, 2)}`,
        )
      }
      if (step.prompt_template) {
        const prompt = await this.readPromptTemplateForGuide(
          step.prompt_template,
        )
        lines.push(
          `Prompt template (${step.prompt_template}):\n${prompt ?? '(template unavailable)'}`,
        )
      }
      if (step.batch?.slice_prompt) {
        const prompt = await this.readPromptTemplateForGuide(
          step.batch.slice_prompt,
        )
        lines.push(
          `Batch slice prompt (${step.batch.slice_prompt}):\n${prompt ?? '(template unavailable)'}`,
        )
      }
    }
    return this.truncateByTokenBudget(
      lines.join('\n'),
      MAX_WORKFLOW_GUIDE_TOKENS,
      'workflow guide truncated',
    )
  }

  private async readPromptTemplateForGuide(
    templateName: string,
  ): Promise<string | null> {
    const promptsFolder =
      this.settings.promptsFolder?.trim() || DEFAULT_PROMPTS_FOLDER
    const path = normalizePath(`${promptsFolder}/${templateName}`)
    try {
      if (!(await this.app.vault.adapter.exists(path))) return null
      const content = await this.app.vault.adapter.read(path)
      const trimmed = content.trim()
      return this.truncateByTokenBudget(
        trimmed,
        MAX_WORKFLOW_TEMPLATE_TOKENS,
        'template truncated for chat guide',
      )
    } catch {
      return null
    }
  }

  private async truncateByTokenBudget(
    text: string,
    maxTokens: number,
    reason: string,
  ): Promise<string> {
    if ((await tokenCount(text)) <= maxTokens) {
      return text
    }
    let low = 0
    let high = text.length
    let best = ''
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const candidate = text.slice(0, mid).trimEnd()
      if ((await tokenCount(candidate)) <= maxTokens) {
        best = candidate
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return `${best}\n...(${reason}; max ${maxTokens} tokens)`
  }
}
