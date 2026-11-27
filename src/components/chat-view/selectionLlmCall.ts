import { getChatModelClient } from '../../core/llm/manager'
import { resolveChatModelId } from '../../core/llm/modelSelection'
import {
  buildSelectionLLMOptions,
  buildSelectionLLMRequest,
} from '../../core/llm/selectionRequest'
import type VerbexPlugin from '../../main'
import { withAuthorizedProviderRequest } from '../../security/promptInjectionBoundary'
import type { VerbexSettings } from '../../settings/schema/setting.types'
import type { ChatUserMessage } from '../../types/chat'
import { PromptGenerator } from '../../utils/chat/promptGenerator'
import type { SelectionSizeFact } from '../../utils/obsidian'

import { recordSelectionUsage } from './selectionUsage'

export type SelectionLlmDeps = {
  promptGenerator: PromptGenerator
  settings: VerbexSettings
  setSettings: (newSettings: VerbexSettings) => void | Promise<void>
  plugin: Pick<VerbexPlugin, 'runPluginWork'>
  lastMessage: ChatUserMessage
}

/**
 * Runs the skill/workflow selection LLM call. Returns null when there is no
 * selection request to send (nothing selectable).
 */
export async function runSelectionLlm(
  deps: SelectionLlmDeps,
  userQuery: string,
  sizeFact: SelectionSizeFact | null,
): Promise<{ skills: string[]; workflows: string[] } | null> {
  const { promptGenerator, settings, setSettings, plugin, lastMessage } = deps
  const selectionRequest = await promptGenerator.buildSelection(
    userQuery,
    sizeFact,
  )
  if (!selectionRequest) return null
  const resolved = resolveChatModelId({ settings, alias: 'fast' })
  const { providerClient, model } = getChatModelClient({
    modelId: resolved.modelId,
    settings,
    setSettings,
  })
  // Joins the unload signal; this call precedes the agent run.
  const response = await plugin.runPluginWork(undefined, (signal) =>
    withAuthorizedProviderRequest(
      selectionRequest.messages,
      {
        runId: lastMessage.id,
        turnId: `${lastMessage.id}:selection`,
      },
      (messages) =>
        providerClient.generateResponse(
          model,
          buildSelectionLLMRequest(
            model,
            messages,
            selectionRequest.responseFormat,
          ),
          buildSelectionLLMOptions(model, signal),
        ),
    ),
  )
  const content = response.choices[0]?.message?.content ?? ''
  await recordSelectionUsage(lastMessage, selectionRequest.messages, response)
  const selection = PromptGenerator.parseSelectionResponse(content, {
    skills: selectionRequest.allowedSkillNames,
    workflows: selectionRequest.allowedWorkflowIds,
  })
  // The selector answers with display names; everything downstream uses ids.
  const skills = selection.skills.flatMap((name) => {
    const id = selectionRequest.skillIdByName.get(name)
    return id ? [id] : []
  })
  console.debug(
    '[Verbex][selection] matched skills:',
    skills,
    'workflows:',
    selection.workflows,
  )
  return { skills, workflows: selection.workflows }
}
