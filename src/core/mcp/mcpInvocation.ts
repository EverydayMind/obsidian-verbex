import { L } from '../../i18n/modelText'
import { runtimeTimers } from '../../platform/runtime'
import type { McpClient, McpToolCallResult } from '../../types/mcp.types'

const aborted = () =>
  Object.assign(
    new Error('MCP call aborted; external effects may already have occurred.'),
    { name: 'AbortError' },
  )
export async function invokeMcpTool(
  client: McpClient,
  tool: { name: string; arguments: Record<string, unknown> },
  controller: AbortController,
): Promise<McpToolCallResult> {
  let timedOut = false
  let onAbort: (() => void) | undefined
  const timer = runtimeTimers.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 60_000)
  try {
    if (controller.signal.aborted) throw aborted()
    const actual = client.callTool(tool, {
      signal: controller.signal,
      timeout: 60_000,
    })
    const result = await Promise.race([
      actual,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(aborted())
        if (controller.signal.aborted) onAbort()
        else
          controller.signal.addEventListener('abort', onAbort, { once: true })
      }),
    ])
    if (controller.signal.aborted) throw aborted()
    return result
  } catch (error) {
    if (timedOut)
      throw Object.assign(
        new Error(
          L({
            ko: 'MCP 호출 시간 초과. 외부 작업은 계속 진행 중일 수 있으므로 자동 재시도하지 않습니다.',
            en: 'MCP call timed out. External work may still be running; no automatic retry will be attempted.',
          }),
        ),
        { name: 'McpTimeoutError' },
      )
    throw error
  } finally {
    runtimeTimers.clearTimeout(timer)
    if (onAbort) controller.signal.removeEventListener('abort', onAbort)
  }
}
