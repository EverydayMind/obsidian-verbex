import type { AgentToolExecutor, AgentToolOutcome } from '../core/llm/agentLoop'
import { L } from '../i18n/modelText'
import type { ToolCallRequest } from '../types/tool-call.types'

import { DOCUMENT_JOB_TOOL_NAMES } from './interop/documentJobTurnPolicy'
import { refusedTool } from './toolExposureRefusal'

export async function executeSelectedCalls(
  calls: readonly ToolCallRequest[],
  execute: AgentToolExecutor,
  allowed: ReadonlySet<string>,
  signal?: AbortSignal,
  refuse: (name: string) => AgentToolOutcome | Promise<AgentToolOutcome> = (
    name,
  ) => refusedTool(name, 'undetermined'),
): Promise<AgentToolOutcome[]> {
  const results: AgentToolOutcome[] = []
  let paused = false
  for (const call of calls) {
    if (paused || signal?.aborted) {
      results.push({
        status: 'paused',
        terminal: true,
        mutation: 'none',
        displayText: L({
          ko: '중단 후 이 도구는 실행하지 않았습니다.',
          en: 'This tool was not executed after the run stopped.',
        }),
      })
      continue
    }
    const outcome = allowed.has(call.name)
      ? await execute(call)
      : await refuse(call.name)
    results.push(outcome)
    paused =
      outcome.status === 'paused' ||
      (call.name === 'save_format_decomposition' &&
        outcome.terminal &&
        (outcome.mutation === 'partial' ||
          outcome.mutation === 'unknown' ||
          signal?.aborted === true))
  }
  return results
}

/** These tools are owned by the formal executor, not localTools. */
export function requiresSequentialExecutor(
  calls: readonly ToolCallRequest[],
  pathConflict: boolean,
  providerHasTool: (name: string) => boolean,
): boolean {
  return (
    pathConflict ||
    calls.some(
      (call) =>
        call.name === 'restore_last_change' ||
        DOCUMENT_JOB_TOOL_NAMES.some((name) => name === call.name) ||
        providerHasTool(call.name),
    )
  )
}
