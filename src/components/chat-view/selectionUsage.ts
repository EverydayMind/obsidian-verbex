import { estimateUsage } from '../../core/llm/chatStep'
import type {
  ChatSkillContextItem,
  ChatUserMessage,
  ChatWorkflowContextItem,
} from '../../types/chat'
import type { RequestMessage } from '../../types/llm/request'
import type { LLMResponseNonStreaming } from '../../types/llm/response'

export async function recordSelectionUsage(
  message: ChatUserMessage,
  messages: RequestMessage[],
  response: LLMResponseNonStreaming,
): Promise<void> {
  const content = response.choices[0]?.message?.content ?? ''
  const usage = response.usage ?? (await estimateUsage(messages, content))
  message.verbexCallUsage = [
    ...(message.verbexCallUsage ?? []),
    { usage, estimated: !response.usage },
  ]
}

export function markRecommendedContexts(
  skillContext: ChatSkillContextItem[],
  workflowContext: ChatWorkflowContextItem[],
  recommendedSkillNames: readonly string[],
  recommendedWorkflowIds: readonly string[],
): {
  skillContext: ChatSkillContextItem[]
  workflowContext: ChatWorkflowContextItem[]
} {
  const recommendedSkills = new Set(recommendedSkillNames)
  const recommendedWorkflows = new Set(recommendedWorkflowIds)
  return {
    skillContext: skillContext.map((skill) => ({
      ...skill,
      included: recommendedSkills.has(skill.name),
    })),
    workflowContext: workflowContext.map((workflow) => ({
      ...workflow,
      included: recommendedWorkflows.has(workflow.id),
    })),
  }
}
