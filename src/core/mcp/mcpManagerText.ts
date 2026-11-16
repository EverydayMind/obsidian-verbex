import { L } from '../../i18n/modelText'
import type { McpTool } from '../../types/mcp.types'

export function refreshFailed() {
  return L({
    ko: 'MCP 도구 목록 갱신 실패. 다시 연결하세요.',
    en: 'Failed to refresh the MCP tool list. Connect again.',
  })
}

export function toolDescription(serverName: string, tool: McpTool) {
  const description = tool.description ?? tool.title ?? tool.name
  return L({
    ko: `[MCP: ${serverName}; 외부 호출, 변경 효과 미확정] ${description}`,
    en: `[MCP: ${serverName}; external call, mutation effects unconfirmed] ${description}`,
  })
}

export function externalDisabled() {
  return L({
    ko: '설정에서 외부 API 도구 호출이 꺼져 있습니다.',
    en: 'External API tool calls are disabled in settings.',
  })
}

export function approvalRevoked() {
  return L({
    ko: 'MCP 자동 허용이 철회됐습니다. 다시 승인하세요.',
    en: 'MCP automatic approval was revoked. Request approval again.',
  })
}
