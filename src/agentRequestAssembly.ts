import { prepareAgentCompletion } from './agentCompletionRequest'
import { assembleAgentContext } from './agentRequestContext'
import { commonAgentRequest } from './agentRequestFingerprint'
import {
  initialAgentDirective,
  prepareAgentRequestPlan,
} from './agentRequestPlan'
import { readOnlyAgentPorts } from './agentRequestReadOnlyPorts'
import type { AgentRunInput } from './AgentRunExecution'
import { ContextCompactor } from './context/compaction'
import { contextBudgetsFor } from './context/modelContextBudgets'
import { EVICTION_TRIGGER_RATIO } from './context/relevanceEviction'
import { fitMessagesToTokenBudget } from './context/requestPreflight'
import { collapseRedundantToolReads } from './context/toolTranscript'
import { beginAgentTranscript } from './core/llm/agentProtocol'
import { getChatModelClient } from './core/llm/manager'
import { assertAgentModelApi } from './core/llm/openAIRequestPolicy'
import { chatModelSupportsTools } from './core/llm/toolSupport'
import { prepareAgentProviderTools } from './provider/prepareAgentProviderTools'
import { beginTurnRecord } from './runstate/turnLedger'
import { SkillRouter } from './skills/SkillRouter'
import { contextTypeFromExtension } from './skills/skillScope'
import type { RequestMessage } from './types/llm/request'
import { PromptLevel } from './types/prompt-level.types'
import { withoutCensusReports } from './utils/chat/displayOnly'
import { buildGuideInstructions } from './utils/chat/guideInstructions'
import { PromptGenerator } from './utils/chat/promptGenerator'
import { sha256Hex } from './utils/hash'
import { tokenCount } from './utils/llm/token'
import type { VerbexController } from './VerbexController'

export type AssembleAgentRequestInput = {
  messages: RequestMessage[]
  currentNotePath?: string | null
  modelId: string
  /** Skill ids (`vault:<folder>`). */
  activeSkills: string[]
  /** SKILL.md replacement text keyed by Skill id. */
  skillOverrides?: Record<string, string>
  now?: string
  runId?: string
}

export const COMMON_REQUEST_EXCLUSIONS = [
  'tools (including Skill frontmatter tool exposure)',
  'system Skill block (including allowed-tools and applies_to filtering)',
  'host tool-selection guidance',
  'internal turn identities and disclosure permit identity',
] as const

/** No runAgent, loop, selection model, or persistence capability is invoked. */
export async function assembleAgentRequest(
  host: VerbexController,
  raw: AssembleAgentRequestInput,
) {
  const input = structuredClone(raw)
  input.messages = withoutCensusReports(input.messages)
  const semanticState = host.devSemanticState()
  if (input.runId && !/^[a-zA-Z0-9_-]+$/.test(input.runId))
    throw new Error('Invalid runId')
  const now = new Date(input.now ?? Date.now()).toISOString()
  const settings = structuredClone(host.getSettings())
  settings.chatModelId = input.modelId
  const target = input.messages.at(-1)
  if (!target || target.role !== 'user' || typeof target.content !== 'string')
    throw new Error('messages must end at the target user text message')
  const currentFile = input.currentNotePath
    ? host.getApp().vault.getFileByPath(input.currentNotePath)
    : null
  if (input.currentNotePath && !currentFile)
    throw new Error('Current note does not exist')
  const contextType = contextTypeFromExtension(currentFile?.extension)
  const generator = new PromptGenerator(
    async () => {
      throw new Error('Model unavailable during assembly')
    },
    host.getApp(),
    settings,
    () => null,
    undefined,
    host.catalogService,
  )
  const built = await generator.buildSkillContext(
    input.activeSkills,
    input.skillOverrides,
  )
  // Same step as a real submission: plugin Skill bodies are read and verified.
  const { items: skills } = await generator.hydratePluginSkills(built)
  for (const id of input.activeSkills)
    if (!skills.some((skill) => skill.id === id))
      throw new Error(`Unknown active Skill: ${id}`)
  for (const id of Object.keys(input.skillOverrides ?? {}))
    if (!skills.some((skill) => skill.id === id))
      throw new Error(`Unknown Skill override id: ${id}`)
  const runInput: AgentRunInput & { readOnly: true } = {
    runId: input.runId ?? 'dev-request',
    now,
    readOnly: true,
    request: target.content,
    history: input.messages,
    currentFile,
    activeSkills: SkillRouter.filterActiveSkills(skills, [], contextType),
    skillInstructions: buildGuideInstructions(skills, [], contextType),
  }
  const ports = readOnlyAgentPorts(host, settings)
  const { model } = getChatModelClient({ modelId: input.modelId, settings })
  const toolsEnabled = settings.chatOptions.enableTools
  const modelSupportsTools = chatModelSupportsTools({ settings, model })
  if (toolsEnabled && !modelSupportsTools)
    throw new Error('Model does not support agent tools')
  assertAgentModelApi(model, toolsEnabled)
  const prepared = await prepareAgentProviderTools(
    ports,
    { ...runInput, contextBudgets: contextBudgetsFor(settings, model) },
    model.promptLevel === PromptLevel.Simple,
    toolsEnabled,
  )
  const planning = await prepareAgentRequestPlan(
    ports,
    runInput,
    settings,
    model,
    prepared,
  )
  if (planning.plan.kind !== 'agent_loop')
    throw new Error(
      '[assembly_non_agent_route] No agent request for unit batch',
    )
  const context = await assembleAgentContext({
    ...planning,
    plan: planning.plan,
    ports,
    input: runInput,
    runSettings: settings,
    model,
    toolsEnabled,
    modelSupportsTools,
    formatSources: prepared.formatSources,
    providerCompanionScope: prepared.companionScope,
    providerNotes: prepared.providerNotes,
    turnRecord: beginTurnRecord(runInput, model.id),
    readOnly: true,
  })
  const compactor = new ContextCompactor(
    settings,
    tokenCount,
    undefined,
    context.effectiveBudget,
  )
  let messages = collapseRedundantToolReads(
    beginAgentTranscript(
      context.initialMessages,
      `agent-dev-${await sha256Hex(JSON.stringify(input.messages))}`,
    ),
    prepared.toolMetadata,
  )
  const decision = await compactor.decide(
    messages as (RequestMessage & { content: string })[],
  )
  if (
    settings.verbex.context.relevanceEviction &&
    decision.estimatedTokens >= context.effectiveBudget * EVICTION_TRIGGER_RATIO
  )
    throw new Error(
      '[assembly_requires_model_call] Relevance eviction may call a model',
    )
  if (settings.verbex.context.autoCompact) {
    const result = await compactor.compactIfNeeded(
      messages as (RequestMessage & { content: string })[],
      async () => {
        throw new Error(
          '[assembly_requires_model_call] Transcript compaction requires a model',
        )
      },
    )
    messages = result.messages
  }
  messages = (
    await fitMessagesToTokenBudget(messages, planning.messageInputBudget)
  ).messages
  const directive = initialAgentDirective({
    ...context,
    ...planning,
    plan: planning.plan,
    toolsEnabled,
    input: runInput,
  })
  const { request } = await prepareAgentCompletion({
    input: runInput,
    model,
    prepared,
    toolsEnabled,
    intentRequest: planning.intentRequest,
    scopeDecision: planning.plan.scopeDecision,
    messages,
    directive,
    inputBudget: planning.inputBudget,
    outputBudget: planning.outputBudget,
    temperature: planning.modelLimits.temperature,
  })
  if (request.messages.at(-1)?.content !== context.packedContext.text)
    throw new Error(
      '[assembly_common_context_fit] Final fitting changed the packed user content',
    )
  const common = commonAgentRequest(
    request,
    context.commonPrompt,
    context.commonUserContent,
  )
  return {
    request,
    fingerprints: {
      full: await sha256Hex(JSON.stringify(request)),
      common: await sha256Hex(JSON.stringify(common)),
    },
    commonExclusions: [...COMMON_REQUEST_EXCLUSIONS],
    semanticState,
    localEmbeddingUsed: ports.localEmbeddingUsed(),
    basis: 'Current Vault; first response only',
  }
}
