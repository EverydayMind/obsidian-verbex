import type { AssembledAgentRequest } from './agentCompletionRequest'
import { AgentContextPresenter } from './context/AgentContextPresenter'
import type { ContextPackerResult } from './core/batch/contextPacker'
import type { VerbexContextTrace } from './verbex/types'

/** Preserve admitted source bytes while normalizing exposed host guidance. */
export function commonAgentUserContent(
  packed: ContextPackerResult,
  mode: string,
  request: string,
  context: VerbexContextTrace | null,
  fittedContext?: VerbexContextTrace,
) {
  const presenter = new AgentContextPresenter(async () => {
    throw new Error('Fingerprint rendering never retrieves')
  })
  return packed.blocks
    .map((block) =>
      block.packetId === 'base_context' &&
      block.mode === 'full' &&
      mode === 'full' &&
      context
        ? presenter.formatAgentContext(
            request,
            fittedContext ?? context,
            new Set(['search_vault', 'iterative_search', 'obsidian_query']),
          )
        : block.text,
    )
    .join('\n\n')
}

export function commonAgentRequest(
  request: AssembledAgentRequest,
  commonPrompt: string | undefined,
  userContent: string | undefined,
) {
  const { tools: _tools, disclosureContext, ...rest } = request
  return {
    ...rest,
    disclosureContext: {
      approvedConnectorVaultRead: disclosureContext.approvedConnectorVaultRead,
    },
    messages: request.messages.map((message, index) => {
      const { agentTurnId: _turnIdentity, ...kept } = message
      return index === 0
        ? { ...kept, content: commonPrompt }
        : index === request.messages.length - 1
          ? { ...kept, content: userContent }
          : kept
    }),
  }
}
