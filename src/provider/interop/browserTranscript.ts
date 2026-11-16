import type { AgentToolOutcome } from '../../core/llm/toolOutcome'

import type { ToolDescriptor } from './protocol'

export function isBrowserTool(tool?: ToolDescriptor): boolean {
  return tool?.resourceKind === 'browser' || tool?.effect === 'browser'
}

/** Capture provenance before async refresh/cancellation can remove the entry. */
export async function privateBrowserResult(
  tool: ToolDescriptor | undefined,
  work: Promise<AgentToolOutcome>,
): Promise<AgentToolOutcome> {
  const privateTranscript = isBrowserTool(tool)
  const result = await work
  return privateTranscript ? { ...result, privateTranscript: true } : result
}
