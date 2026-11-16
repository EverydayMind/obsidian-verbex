import { modelMarker } from '../../i18n/modelMarkers'
import { AgentToolOutcome, toolFailed, toolSucceeded } from '../llm/toolOutcome'

import { ToolResult } from './localToolCommon'
import { TOOL_REGISTRY } from './toolDefinitions'

/** Preserve host outcomes instead of reclassifying a completed save as a read. */
export function nonChangeResultOutcome(
  result: Exclude<ToolResult, { kind: 'change' }>,
  tool?: string,
  options?: { terminal?: boolean },
): AgentToolOutcome {
  if (result.kind === 'outcome') return result.outcome
  if (result.kind === 'error')
    return toolFailed(
      `${modelMarker('toolError')} ${result.message})`,
      tool && TOOL_REGISTRY[tool]?.category === 'read'
        ? { ...options, mutationScope: 'none' }
        : options,
    )
  return readResultOutcome(result, tool)
}

export function readResultOutcome(
  result: Extract<ToolResult, { kind: 'read' }>,
  tool?: string,
): AgentToolOutcome {
  const options: Partial<Omit<AgentToolOutcome, 'status' | 'displayText'>> = {
    readFacts: result.facts,
    mutationScope: 'none' as const,
    connectorAudit: result.connectorAudit,
    disclosure: result.disclosure,
    ...(result.evidencePaths
      ? {
          evidence: {
            role: tool ? (TOOL_REGISTRY[tool]?.evidenceRole ?? 'none') : 'none',
            paths: result.evidencePaths,
          },
        }
      : {}),
  }
  return result.facts?.completeness === 'unsupported'
    ? toolFailed(result.text, {
        ...options,
        terminal: false,
        retry: { allowed: false },
      })
    : toolSucceeded(result.text, options)
}
