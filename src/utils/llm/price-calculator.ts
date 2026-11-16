import { ChatModel } from '../../types/chat-model.types'
import { ResponseUsage } from '../../types/llm/response'

// Returns the cost in dollars. Returns null if the model is not supported.
// Pricing is not configured; cost calculation is unavailable.
export const calculateLLMCost = ({
  model: _model,
  usage: _usage,
}: {
  model: ChatModel
  usage: ResponseUsage
}): number | null => {
  return null
}
