import { fileMentions } from '../../core/vault-facts/fileMentions'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'

import { META_RESOURCE } from './protocol'
import type { NativeCall } from './readExecution'
import type { NativeToolResult } from './resultReader'

export function markReadReceipt(
  call: NativeCall,
  result: NativeToolResult,
  vaultEvents: number,
): void {
  call.trace?.mark('receipt', {
    errorCode:
      result.errorCode ??
      (result.readProgressInvalid ? 'READ_PROGRESS_INVALID' : undefined),
    count: result.text.length,
    truncated: result.truncated,
    retryable: result.retryable,
    vaultEvents,
  })
}

export async function readResultText(
  call: NativeCall,
  result: NativeToolResult,
  repeated: boolean,
  vaultEvents: number,
) {
  const providerId = call.handle.pluginId
  let text = L({
    ko: `${modelMarker('pluginResult', 'ko')} ${providerId}/${call.tool.name}, v${call.handle.pluginVersion}]\n${result.text}${repeated ? '\n직전 읽기와 같은 결과입니다.' : ''}${vaultEvents ? `\n호출 중 Vault 변경 ${vaultEvents}건 관측, 원인 미확정. 읽기 근거는 확정하지 않았습니다.` : ''}`,
    en: `${modelMarker('pluginResult', 'en')} ${providerId}/${call.tool.name}, v${call.handle.pluginVersion}]\n${result.text}${repeated ? '\nSame result as the previous read.' : ''}${vaultEvents ? `\nObserved ${vaultEvents} Vault changes during the call; cause unconfirmed. Read evidence was not confirmed.` : ''}`,
  })
  const resource = result.meta[META_RESOURCE]
  const path =
    resource &&
    typeof resource === 'object' &&
    !Array.isArray(resource) &&
    typeof resource.path === 'string'
      ? call.vaultPath(resource.path)
      : undefined
  const mention =
    !result.isError && !result.truncated && call.tool.effect === 'read' && path
      ? await fileMentions(call.app, path, call.ctx.signal, call.current)
      : null
  if (mention) text += `\n${mention.text}`
  return {
    text,
    disclosure: {
      connectorId: providerId,
      canonicalVaultPaths: [
        ...new Set([...result.paths, ...(mention?.shownPaths ?? [])]),
      ],
      unattributedFiles:
        call.tool.effect === 'read' && result.paths.length === 0 ? 1 : 0,
    },
  }
}
