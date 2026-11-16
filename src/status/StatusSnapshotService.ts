import type { SemanticSearchProvider } from '../context/ContextBuilder'
import { collectEmbeddingIndexStats } from '../context/embeddingIndexStats'
import type { LexicalIndexRepository } from '../context/LexicalIndex'
import { t } from '../i18n'
import type { ProviderRegistrySnapshot } from '../provider/ProviderRegistry'
import type { ProviderRuntime } from '../provider/ToolProviderHub'
import type { RunLifecycle, StatusListener } from '../runstate/RunLifecycle'
import type { RunStateRepository } from '../runstate/RunStateRepository'
import { skillAvailability } from '../skills/skillAvailability'
import type {
  SkillSummary,
  VerbexProviderStatus,
  VerbexStatusSnapshot,
  WorkflowDefinition,
  WorkflowLoadError,
  WorkflowLoadResult,
} from '../verbex/types'

function emptyProviderStatus(): VerbexProviderStatus {
  return {
    registryAvailable: false,
    protocolVersion: null,
    generation: null,
    providers: [],
    toolNames: [],
  }
}

export function providerStatusFromSnapshot(
  snapshot: ProviderRegistrySnapshot,
): VerbexProviderStatus {
  return {
    registryAvailable: true,
    protocolVersion: snapshot.protocolVersion,
    generation: snapshot.generation,
    providers: snapshot.providers.map((provider) => ({
      providerId: provider.providerId,
      providerVersion: provider.providerVersion,
      schemaVersion: provider.schemaVersion,
      toolNames: [...provider.toolNames],
    })),
    toolNames: [...snapshot.toolNames],
  }
}

type CatalogReaders = {
  skillLoader: { listSkills: () => Promise<SkillSummary[]> }
  workflowLoader: {
    listWorkflows: () => Promise<{
      workflows: WorkflowLoadResult[]
      errors: WorkflowLoadError[]
    }>
  }
}

export class StatusSnapshotService {
  constructor(
    private readonly lifecycle: RunLifecycle,
    private readonly readers: CatalogReaders,
    private readonly lexicalIndex: LexicalIndexRepository,
    private readonly runStateRepository: RunStateRepository,
    private readonly getSemanticProvider:
      | (() => Promise<SemanticSearchProvider | null>)
      | null,
    private readonly peekSemanticProvider:
      | (() => SemanticSearchProvider | null)
      | null,
    private readonly setWorkflowDefinitions: (
      definitions: Map<string, WorkflowDefinition>,
    ) => void,
    private readonly providerRegistry?: ProviderRuntime,
    private readonly isPluginEnabled: (id: string) => boolean = () => true,
  ) {
    this.providerRegistry?.onReady(() => {
      void this.refreshProviderStatus()
    })
  }

  async refresh(
    options: { embeddingStats?: 'if-ready' | 'eager' } = {},
  ): Promise<VerbexStatusSnapshot> {
    try {
      const [skills, workflowResult, pausedRuns, lexicalIndex, providerStatus] =
        await Promise.all([
          this.readers.skillLoader.listSkills(),
          this.readers.workflowLoader.listWorkflows(),
          this.runStateRepository.findLatestPaused(),
          this.lexicalIndex.getStats(),
          this.readProviderStatus(),
        ])

      let embeddingIndex = this.lifecycle.getSnapshot().embeddingIndex
      this.setWorkflowDefinitions(
        new Map(
          workflowResult.workflows.map(({ workflow }) => [
            workflow.id,
            workflow,
          ]),
        ),
      )
      const getProvider =
        (options.embeddingStats ?? 'if-ready') === 'eager'
          ? this.getSemanticProvider
          : this.peekSemanticProvider
      if (getProvider) {
        try {
          const stats = await collectEmbeddingIndexStats(getProvider)
          if (stats) embeddingIndex = stats
        } catch (error) {
          console.warn(
            'Failed to load embedding stats in Verbex Status:',
            error,
          )
        }
      }

      this.lifecycle.setSnapshot({
        ...this.lifecycle.getSnapshot(),
        bootstrapped: true,
        skills,
        workflows: workflowResult.workflows,
        workflowErrors: workflowResult.errors,
        pausedRuns,
        lexicalIndex,
        embeddingIndex,
        providerStatus,
        lastError: null,
      })
    } catch (error) {
      this.lifecycle.setSnapshot({
        ...this.lifecycle.getSnapshot(),
        lastError: error instanceof Error ? error.message : String(error),
      })
    }
    this.lifecycle.emit()
    return this.lifecycle.getSnapshot()
  }

  async refreshLexicalIndex(): Promise<VerbexStatusSnapshot> {
    const lexicalIndex = await this.lexicalIndex.refresh()
    this.lifecycle.setSnapshot({
      ...this.lifecycle.getSnapshot(),
      lexicalIndex,
      lastError: null,
    })
    this.lifecycle.emit()
    return this.lifecycle.getSnapshot()
  }

  async syncLexicalStats(): Promise<void> {
    this.lifecycle.setSnapshot({
      ...this.lifecycle.getSnapshot(),
      lexicalIndex: await this.lexicalIndex.getStats(),
    })
    this.lifecycle.emit()
  }

  private async readProviderStatus(): Promise<VerbexProviderStatus> {
    if (!this.providerRegistry) return emptyProviderStatus()
    try {
      return providerStatusFromSnapshot(
        await this.providerRegistry.getSnapshot(),
      )
    } catch (error) {
      console.warn(
        'Failed to load provider registry status in Verbex Status:',
        error,
      )
      return emptyProviderStatus()
    }
  }

  private async refreshProviderStatus(): Promise<void> {
    this.lifecycle.setSnapshot({
      ...this.lifecycle.getSnapshot(),
      providerStatus: await this.readProviderStatus(),
    })
    this.lifecycle.emit()
  }

  getSnapshot(): VerbexStatusSnapshot {
    return this.lifecycle.getSnapshot()
  }

  addStatusListener(listener: StatusListener): () => void {
    return this.lifecycle.addStatusListener(listener)
  }

  getSkillsSummary(): string {
    const skills = this.getSnapshot().skills
    let unavailableCount = 0
    const lines = skills.map((skill) => {
      const availability = skillAvailability(skill, this.isPluginEnabled)
      const reason = availability.available
        ? ''
        : t('ui.StatusSnapshotService.requiredPluginsAreDisabled', {
            p0: availability.missingPlugins.join(', '),
          })
      if (!availability.available) unavailableCount++
      const keywords = skill.trigger_keywords.length
        ? ` [${skill.trigger_keywords.join(', ')}]`
        : ''
      return `- ${skill.name}${reason}${keywords}: ${skill.summary ?? skill.path}`
    })
    // Header only when something is disabled, so the usual summary is unchanged.
    return (
      unavailableCount
        ? [
            t('ui.StatusSnapshotService.inactiveSkills', {
              p0: unavailableCount,
            }),
            ...lines,
          ]
        : lines
    ).join('\n')
  }

  getPlanSummary(): string {
    const plan = this.getSnapshot().activeRun?.plan ?? []
    if (plan.length === 0) return 'No active Verbex plan.'
    return plan
      .map((step) => `- [${step.status}] ${step.title} (${step.id})`)
      .join('\n')
  }
}
