import { L } from '../../i18n/modelText'
import { safeSerialize } from '../../provider/connectors/safeSerialize'
import type { McpToolCallResult } from '../../types/mcp.types'

export const MAX_MCP_RESULT_CHARS = 40_000

/** Never follow resource links or execute server-returned content. */
export function mcpResultText(result: McpToolCallResult): string {
  const parts: string[] = []
  const omitted = new Set<string>()
  let remaining = MAX_MCP_RESULT_CHARS
  let truncated = false
  for (const block of result.content ?? []) {
    if (block.type !== 'text') {
      omitted.add(block.type)
      continue
    }
    const text = block.text.slice(0, remaining)
    parts.push(text)
    remaining -= text.length
    truncated ||= text.length !== block.text.length
  }
  if (result.structuredContent !== undefined) {
    const serialized = safeSerialize(result.structuredContent, {
      format: 'json',
      maxItems: 200,
      maxChars: Math.max(1, remaining),
    })
    parts.push(`[structuredContent]\n${serialized.text}`)
    truncated ||= serialized.truncated || remaining === 0
  }
  if (parts.length === 0)
    parts.push(
      L({
        ko: '[전달 가능한 텍스트 결과 없음]',
        en: '[No deliverable text result]',
      }),
    )
  if (omitted.size)
    parts.push(
      L({
        ko: `[미지원 콘텐츠 생략: ${[...omitted].join(', ')}]`,
        en: `[Unsupported content omitted: ${[...omitted].join(', ')}]`,
      }),
    )
  if (truncated)
    parts.push(
      L({
        ko: '[결과 크기 제한으로 일부 생략]',
        en: '[Partially omitted due to the result size limit]',
      }),
    )
  return parts.join('\n\n')
}
