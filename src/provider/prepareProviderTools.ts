import { splitAgentHistory } from '../context/agentSourcePolicy'
import type { DocumentJobPending } from '../context/documentJobPendingFacts'
import { extractUserRequest, requestMessageText } from '../context/taskPinning'
import {
  AGENT_CALLABLE_TOOL_NAMES,
  TOOL_REGISTRY,
  agentToolRoutingText,
  canonicalToolName,
  getAgentToolDefinitions,
} from '../core/tools/toolDefinitions'
import { ToolMetadataSource } from '../core/tools/toolMetadata'
import {
  applyConversationToolSelection,
  storedRequiredToolNames,
} from '../tools/conversationToolPolicy'
import { migrateStoredToolSelection } from '../tools/storedToolNames'
import { RequestMessage, RequestTool } from '../types/llm/request'

import { selectConnectorTools } from './connectors/exposurePolicy'
import { HwpEditScope } from './contract'
import { beginDocumentJobTurn } from './interop/beginDocumentJobTurn'
import {
  browserContextNote,
  trustedBrowserContext,
} from './interop/browserContext'
import { budgetExposureFacts } from './interop/budgetExposureFacts'
import { assistantChoiceFromHistory } from './interop/choiceIntent'
import { documentJobExposure } from './interop/documentJobExposure'
import { currentDocumentJobTools } from './interop/documentJobToolProjection'
import { DOCUMENT_JOB_TOOL_NAMES } from './interop/documentJobTurnPolicy'
import {
  nativeExposureTrace,
  snapshotNativeExposure,
} from './interop/exposureGates'
import {
  nativeProviderNotes,
  selectNativeTools,
} from './interop/exposurePolicy'
import {
  reservationNote,
  skillReservations,
} from './interop/exposureReservations'
import { NATIVE_TOOL_PREFIX } from './interop/protocol'
import { type Reexposure, addReexposure } from './interop/reexposeNative'
import { type ScopeCaptureStatus, captureTurnScope } from './interop/turnScope'
import { selectMcpTools } from './mcp/exposurePolicy'
import {
  formatReuseHostNote,
  sessionDisabledHostNote,
} from './providerCapabilityNotes'
import {
  assertRequiredToolBudget,
  assertRequiredToolsAvailable,
} from './providerToolErrors'
import {
  hwpxEditNote,
  pluginOffNote,
  shadowedKordocPatch,
} from './providerTurnNotes'
import {
  allowedNativeTools,
  providerTurnCaller,
  providerTurnSnapshot,
} from './providerTurnSnapshot'
import {
  type ReadOnlyPreparation,
  emptyProviderJobTurn,
  preparationRegistry,
  preparationTurnId,
} from './readOnlyPreparation'
import { ProviderRuntime } from './ToolProviderHub'
import { turnResourcePaths } from './turnResourcePaths'

export async function prepareProviderTools(
  registry: ProviderRuntime | undefined,
  input: {
    runId: string
    conversationId?: string
    submittedTurnId?: string
    previousSubmittedTurnId?: string
    previousTurnRecord?: import('../runstate/turnLedger').TurnRecord
    turnRecord?: import('../runstate/turnLedger').TurnRecord
    onStatusChange?: import('../core/llm/agentLoop').AgentLoopDeps['onStatusChange']
    request: string
    isContinuationSignal?: boolean
    history?: RequestMessage[]
    signal?: AbortSignal
    activeSkills?: {
      name?: string
      triggerKeywords?: string[]
      manuallySelected?: boolean
      tools?: string[]
      preferredTools?: string[]
    }[]
    workflowContext?: { included?: boolean; steps?: { tool?: string }[] }[]
    pinnedConnectorTools?: string[]
    excludedToolNames?: string[]
    currentFile?: { path: string } | null
    mentionables?: readonly unknown[]
    priorDocumentPaths?: readonly string[]
    companionScope?: HwpEditScope
    browserContext?: import('./interop/browserContext').BrowserTurnContext
    reexpose?: Reexposure
  } & ReadOnlyPreparation,
  simple: boolean,
  toolsEnabled = true,
) {
  input = migrateStoredToolSelection(input)
  registry = preparationRegistry(registry, input)
  const initial = await registry?.getSnapshot()
  const providerTurnId = preparationTurnId(input)
  const caller = providerTurnCaller(input, providerTurnId)
  const jobTurn = toolsEnabled
    ? await beginDocumentJobTurn(registry?.native, { ...input, ...caller })
    : emptyProviderJobTurn()
  const browserContext = trustedBrowserContext(input.browserContext)
  if (registry && input.signal) {
    const invalidate = () => registry.invalidateRun(input.runId)
    if (input.signal.aborted) invalidate()
    else input.signal.addEventListener('abort', invalidate, { once: true })
  }
  // Fixed once at submission: later tab or selection changes do not move it.
  let scopeUncertain = false
  let scopeStatus: ScopeCaptureStatus | undefined
  const turnScope = input.reexpose
    ? input.reexpose.snapshot?.turnScope
    : registry?.native
      ? await captureTurnScope(registry.native.editors(), {
          caller: {
            pluginId: registry.native.options.selfId ?? 'verbex',
            conversationId: caller.conversationId,
            runId: input.runId,
            turnId: caller.submittedTurnId,
          },
          currentFilePath: input.currentFile?.path,
          companionScope: !!input.companionScope,
          signal: input.signal,
          vaultPath: registry.native.options.vaultPath,
          onUncertain: () => {
            scopeUncertain = true
          },
          onStatus: (status) => {
            scopeStatus = status
          },
        })
      : undefined
  const all = registry?.getAgentToolDefinitions() ?? []
  const required = storedRequiredToolNames(
    input.activeSkills ?? [],
    input.workflowContext ?? [],
  )

  const jobExposure = documentJobExposure({
    policy: jobTurn.policy,
    request: input.request,
    required,
    entries: registry?.native?.getEntries() ?? [],
    definitions: [...getAgentToolDefinitions(), ...all],
  })
  // Built-ins that run through an Obsidian plugin (Note Composer, Dataview)
  // stay optional Skill requirements: with the plugin off the request still
  // goes out and the model is told why they are missing (DECISIONS §22).
  const pluginOffBuiltins = [...new Set(required)].filter(
    (name) =>
      TOOL_REGISTRY[name]?.definition !== undefined &&
      registry?.nativeToolReady?.(name) === false,
  )
  const selected = await selectConnectorTools(
    (registry?.connectors?.getEntries() ?? []).filter(
      (entry) =>
        !input.excludedToolNames?.includes(entry.definition.function.name) ||
        required.includes(entry.definition.function.name),
    ),
    {
      text: agentToolRoutingText(input.request, input.history ?? []),
      simple,
      skillTools: required,
      pinnedTools: input.pinnedConnectorTools ?? [],
    },
  )
  const mcpEntries = registry?.mcp?.getEntries() ?? []
  const mcpNames = new Set(mcpEntries.map((entry) => entry.name))
  const mcpSelection = await selectMcpTools(
    mcpEntries.filter(
      (entry) =>
        !input.excludedToolNames?.includes(entry.name) ||
        required.includes(entry.name),
    ),
    {
      text: agentToolRoutingText(input.request, input.history ?? []),
      simple,
      skillTools: required,
      pinnedTools: input.pinnedConnectorTools ?? [],
    },
  )
  const discoveryUserText = (input.history ?? [])
    .filter((message) => message.role === 'user' && !message.toolImageSource)
    .map(requestMessageText)
    .join('\n')
  const priorUserText = splitAgentHistory(input.history ?? [], input.request)
    .priorHistory.filter(
      (message) => message.role === 'user' && !message.toolImageSource,
    )
    .map((message) => extractUserRequest(requestMessageText(message)))
    .join('\n')
  const turnPaths = turnResourcePaths(input)
  const reservations = skillReservations(input.activeSkills)
  const reservedNames = reservations.flatMap((item) => item.tools)
  const nativeInputs = snapshotNativeExposure(registry?.native, [
    ...required,
    ...(input.pinnedConnectorTools ?? []),
    ...reservedNames,
  ])
  const nativeSelection = await selectNativeTools(
    nativeInputs.entries.filter(
      (entry) => !jobExposure.excluded.has(entry.name),
    ),
    {
      text: `${agentToolRoutingText(input.request, input.history ?? [])}\n${discoveryUserText}`,
      simple,
      skillTools: required,
      pinnedTools: input.pinnedConnectorTools ?? [],
      excludedTools: input.excludedToolNames ?? [],
      contextProviders: browserContext?.scopes.map((s) => s.providerId),
      requestText: input.request,
      priorUserText,
      turnScope: scopeUncertain ? undefined : turnScope,
      turnResourcePaths: turnPaths,
      assistantChoiceText: assistantChoiceFromHistory(
        input.request,
        input.history ?? [],
      ),
      preferredResourcePaths: turnPaths.length
        ? turnPaths
        : (input.priorDocumentPaths ?? []),
      // Historical paths discover tools only; scope and active-path notes below
      // still use this turn's actual files.
      resourcePaths: [...turnPaths, ...(input.priorDocumentPaths ?? [])],
      reservations,
    },
  )
  const addition = await addReexposure(
    nativeInputs.entries,
    input.reexpose,
    input.excludedToolNames ?? [],
    jobExposure.excluded,
    nativeSelection,
  )
  const nativeNames = nativeSelection.definitions.map(
    (tool) => tool.function.name,
  )
  const budgetFacts = budgetExposureFacts(
    nativeInputs.entries,
    nativeSelection.availableReasons,
    nativeSelection.automaticProviderIds,
    reservedNames,
    (id) =>
      registry?.native
        ?.getStatuses?.()
        .find((status) => status.providerId === id)?.descriptor?.provider
        .name ?? id,
  )
  const providerNotes = nativeProviderNotes(
    (registry?.native?.getEntries() ?? []).filter((entry) =>
      nativeNames.includes(entry.name),
    ),
    registry?.native?.instructionsFor(nativeNames) ?? [],
    jobTurn.policy.suppress
      ? turnPaths.filter((path) => !jobTurn.samplePaths.includes(path))
      : turnPaths,
    jobTurn.policy.suppress &&
      turnScope &&
      jobTurn.samplePaths.includes(turnScope.scope.path)
      ? undefined
      : turnScope,
    nativeInputs.gates,
  )
  const shadowed = shadowedKordocPatch(
    registry?.native?.getEntries() ?? [],
    nativeNames,
    required,
  )
  const definitions = [
    ...all.filter(
      (tool) =>
        !shadowed.includes(tool.function.name) &&
        !tool.function.name.startsWith('conn__') &&
        !tool.function.name.startsWith(NATIVE_TOOL_PREFIX) &&
        !mcpNames.has(tool.function.name) &&
        (!input.excludedToolNames?.includes(tool.function.name) ||
          required.includes(tool.function.name)),
    ),
    ...selected.definitions,
    ...mcpSelection.definitions,
    ...nativeSelection.definitions,
  ]
  const names = definitions
    .filter((tool) => !jobExposure.excluded.has(tool.function.name))
    .map((definition) => definition.function.name)
  const availableNative = getAgentToolDefinitions().filter(
    (tool) => registry?.nativeToolReady?.(tool.function.name) !== false,
  )
  const selection = {
    pinned: input.pinnedConnectorTools,
    excluded: input.excludedToolNames,
  }
  const allowedNative = allowedNativeTools(
    availableNative,
    selection,
    required,
    jobExposure.excluded,
  )
  const snapshot = providerTurnSnapshot(initial, {
    names,
    caller,
    intended: jobTurn.policy.intended,
    pending:
      'pending' in jobTurn && Array.isArray(jobTurn.pending)
        ? (jobTurn.pending as DocumentJobPending[])
        : [],
    turnScope,
    browserContext,
    observations: input.reexpose?.observations,
  })
  const metadata = new Map(
    names.map((name) => [name, registry?.getToolMetadata?.(name)]),
  )
  const toolMetadata: ToolMetadataSource = (name) => metadata.get(name)
  return {
    reexposed: addition.names,
    reexposureBudgetExceeded: addition.budgetExceeded,
    omittedProviders: budgetFacts.omittedProviders,
    formatSources: jobTurn.formatSources,
    documentJobPolicy: jobTurn.policy,
    providerSnapshot: snapshot,
    companionScope:
      jobTurn.policy.suppress &&
      input.companionScope &&
      jobTurn.samplePaths.includes(input.companionScope.path)
        ? undefined
        : input.companionScope,
    providerTurnId,
    callableToolNames: new Set(
      [...AGENT_CALLABLE_TOOL_NAMES]
        .filter((name) => allowedNative.has(canonicalToolName(name)))
        .concat(names),
    ),
    toolMetadata,
    exposure: {
      definitions: [
        ...selected.definitions,
        ...mcpSelection.definitions,
        ...nativeSelection.definitions,
      ],
      omitted:
        selected.omitted + mcpSelection.omitted + nativeSelection.omitted,
      tokens: selected.tokens + mcpSelection.tokens + nativeSelection.tokens,
      nativeTrace: nativeExposureTrace(nativeInputs, nativeSelection, {
        host: registry?.native,
        input,
        scope: turnScope,
        scopeStatus,
        required: [...required, ...reservedNames],
      }),
    },
    providerNotes: [
      jobTurn.policy.suppress ? formatReuseHostNote() : '',
      providerNotes,
      reservationNote(
        nativeSelection.reservations,
        nativeNames,
        nativeSelection.availableReasons,
      ),
      budgetFacts.note,
      browserContextNote(browserContext),
      registry?.native && !registry.native.options.sessionEffects
        ? sessionDisabledHostNote()
        : '',
      hwpxEditNote(names, turnPaths),
      pluginOffNote(pluginOffBuiltins),
    ]
      .filter(Boolean)
      .join('\n\n'),
    approvedConnectorVaultRead:
      selected.definitions.length + nativeSelection.definitions.length > 0,
    projectTools: (tools: RequestTool[]) =>
      currentDocumentJobTools(
        tools,
        registry?.native,
        caller.conversationId,
        input.signal,
        input.turnRecord,
      ),
    withProviderTools: (native: RequestTool[]): Promise<RequestTool[]> => {
      assertRequiredToolBudget(nativeSelection.missingExplicit)
      const tools = [
        ...applyConversationToolSelection(
          [
            ...native,
            ...(jobTurn.policy.expose
              ? getAgentToolDefinitions().filter((tool) =>
                  DOCUMENT_JOB_TOOL_NAMES.some(
                    (name) => name === tool.function.name,
                  ),
                )
              : []),
          ],
          availableNative,
          selection,
          required,
        ),
        ...definitions.filter(
          (candidate) =>
            !native.some(
              (tool) => tool.function.name === candidate.function.name,
            ),
        ),
      ]
      // Check requirements on the unsuppressed list. Native requirements were
      // protected from suppression before the group's budget allocation.
      const available = new Set(tools.map((tool) => tool.function.name))
      const missing = [...new Set(required)].filter(
        (name) =>
          (!TOOL_REGISTRY[name] || TOOL_REGISTRY[name].agentCallable) &&
          !available.has(name) &&
          !pluginOffBuiltins.includes(name),
      )
      assertRequiredToolsAvailable(missing)
      return currentDocumentJobTools(
        tools.filter((tool) => !jobExposure.excluded.has(tool.function.name)),
        registry?.native,
        caller.conversationId,
        input.signal,
        input.turnRecord,
      )
    },
  }
}

export { executeProviderAgentTool } from './executeProviderAgentTool'
