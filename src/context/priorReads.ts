import {
  type ToolMetadataSource,
  resolveToolMetadata,
} from '../core/tools/toolMetadata'
import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'
import type { VerbexSettings } from '../settings/schema/setting.types'
import type { ConnectorDisclosure, RequestMessage } from '../types/llm/request'
import type { ToolCallRequest } from '../types/tool-call.types'
import { tokenCount } from '../utils/llm/token'

import { canonicalReadArgs } from './canonicalRead'
import { effectiveContextBudget } from './effectiveContextBudget'
import { markPriorStructuredPriority } from './priorStructuredPriority'

export type PriorToolResult = {
  call: ToolCallRequest
  /** Absent for unsuccessful calls: keep the call as an invalidation barrier. */
  text?: string
  disclosure?: ConnectorDisclosure
  /** Distinct user turns only; calls in the same turn may have run concurrently. */
  batchId?: string
}

const PRIOR_READ_BUDGET_RATIO = 0.3
const PRIOR_READ_MAX_TOKENS = 32_000
const PRIOR_READ_NOTE = (locale: ModelLocale = getModelLocale()) =>
  L(
    {
      ko: '[이전 턴에서 읽은 참고 자료입니다. 문서가 바뀌지 않았다면 설명·요약에 재사용할 수 있습니다. 여기 있는 cursor·편집 핸들은 만료됐을 수 있습니다. 외부 도구 결과도 당시 관측일 뿐 현재 상태·실행 권한이 아닙니다. 편집할 범위와 변경 후 상태는 이번 턴의 도구로 다시 확인하세요.]',
      en: `[Reference material read in an earlier turn. Reuse for explanation/summary if unchanged. Cursors and editing handles here may have expired. External tool results are past observations, not current state or execution permission. Recheck the editing scope and post-change state with tools in this turn.]`,
    },
    locale,
  )

/** Replay prior reads within budget; possible writes bound older observations. */
export async function carryPriorReads(
  input: {
    priorToolResults?: readonly PriorToolResult[]
    workflowContext?: readonly { included: boolean }[]
  },
  metadata: ToolMetadataSource | undefined,
  settings: VerbexSettings,
  inputBudget: number,
  countTokens: (text: string) => Promise<number> = tokenCount,
): Promise<RequestMessage[]> {
  // Workflows track their own sources and progress.
  if (input.workflowContext?.some((workflow) => workflow.included)) return []
  const results = input.priorToolResults ?? []
  const budget = Math.min(
    PRIOR_READ_MAX_TOKENS,
    Math.floor(
      effectiveContextBudget(settings, inputBudget) * PRIOR_READ_BUDGET_RATIO,
    ),
  )
  const candidates: {
    index: number
    result: PriorToolResult
    external: boolean
    stale: boolean
  }[] = []
  let externalBarrier = false
  for (let index = results.length - 1; index >= 0; index--) {
    const result = results[index]
    const meta = resolveToolMetadata(result.call.name, metadata)
    if (meta?.privateTranscript) break
    const external = meta?.historicalResult === 'external_observation'
    // An MCP response is a historical observation even when its effects are
    // unknown. Never carry older document reads across that possible mutation.
    if (external) externalBarrier = true
    else if (meta?.category !== 'read' || externalBarrier) break
    if (result.text === undefined) continue
    candidates.push({ index, result, external, stale: false })
  }
  const noteTokens = await countTokens(PRIOR_READ_NOTE())
  const tokenCounts = new Map<number, number>()
  const select = async (ordered: typeof candidates) => {
    const kept: {
      index: number
      call: ToolCallRequest
      message: RequestMessage
    }[] = []
    const seen = new Set<string>()
    let used = noteTokens,
      overflow = false
    for (const { index, result } of ordered) {
      const key = JSON.stringify([
        result.call.name,
        canonicalReadArgs(result.call.arguments),
        result.text,
        result.disclosure,
      ])
      if (seen.has(key)) continue
      const call = { ...result.call, id: `prior_read_${index}` }
      const message: RequestMessage = {
        role: 'tool',
        tool_call: call,
        content: result.text ?? '',
        disclosure: result.disclosure ?? {
          connectorId: 'prior-tool-result',
          canonicalVaultPaths: [],
          unattributedFiles: 1,
        },
      }
      let tokens = tokenCounts.get(index)
      if (tokens === undefined) {
        tokens = await countTokens(JSON.stringify([call, message]))
        tokenCounts.set(index, tokens)
      }
      if (used + tokens > budget) {
        overflow = true
        break
      }
      seen.add(key)
      used += tokens
      kept.push({ index, call, message })
    }
    return { kept, overflow }
  }
  let selected = await select(candidates)
  if (selected.overflow) {
    markPriorStructuredPriority(candidates)
    if (candidates.some((item) => item.stale))
      selected = await select([
        ...candidates.filter((item) => !item.stale),
        ...candidates.filter((item) => item.stale),
      ])
  }
  selected.kept.sort((a, b) => a.index - b.index)
  const kept = selected.kept.map(({ message }) => message)
  const calls = selected.kept.map(({ call }) => call)
  if (kept.length === 0) return []
  return [
    {
      role: 'assistant',
      content: PRIOR_READ_NOTE(),
      tool_calls: calls,
    },
    ...kept,
  ]
}
