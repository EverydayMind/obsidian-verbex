import { toolFailed, toolSucceeded } from '../core/llm/toolOutcome'
import { parseToolArgs } from '../core/tools/parseToolArgs'
import { modelMarker } from '../i18n/modelMarkers'
import type { ToolCallRequest } from '../types/tool-call.types'

import type { ConnectorAudit } from './connectors/PluginConnectorHost'
import type { HwpEditScope } from './contract'
import { appendDocumentJobSampleExemplar } from './interop/documentJobSampleExemplar'
import type { ProviderRegistrySnapshot } from './ProviderRegistry'
import type { ProviderRuntime } from './ToolProviderHub'

export async function executeProviderAgentTool(
  registry: ProviderRuntime,
  call: ToolCallRequest,
  runId: string,
  snapshot?: ProviderRegistrySnapshot,
  scope?: HwpEditScope,
  signal?: AbortSignal,
  onConnectorAudit?: (fact: ConnectorAudit) => void,
) {
  const args = parseToolArgs(call.arguments)
  const context = {
    ...snapshot?.caller,
    runId,
    turnId: call.id,
    snapshot: snapshot ?? registry.createSnapshot(),
    scope,
    signal,
    onConnectorAudit,
  }
  const outcome = await registry.executeAgentTool?.(call.name, args, context)
  if (outcome)
    return appendDocumentJobSampleExemplar(
      registry.native,
      call.name,
      args,
      context.snapshot,
      outcome,
      signal,
    )
  const result = await registry.executeTool(call.name, args, context)
  if (result.kind === 'outcome') return result.outcome
  if (result.kind === 'error')
    return toolFailed(`${modelMarker('toolError')} ${result.message})`, {
      terminal: !result.retryAllowed,
      retry: { allowed: result.retryAllowed ?? false },
      ...(registry.getToolMetadata?.(call.name)?.category === 'read'
        ? { mutationScope: 'none' as const }
        : {}),
    })
  if (result.kind !== 'read')
    return toolFailed(
      `${modelMarker('toolError')} provider tool returned an invalid result)`,
    )
  const metadata = registry.getToolMetadata?.(call.name)
  const paths =
    result.evidencePaths ??
    (call.name.startsWith('kordoc__inspect_') && typeof args.path === 'string'
      ? [args.path]
      : [])
  return toolSucceeded(result.text, {
    ...(metadata?.category === 'read'
      ? { mutationScope: 'none' as const }
      : {}),
    disclosure: result.disclosure,
    connectorAudit: result.connectorAudit,
    evidence: {
      role:
        metadata?.evidenceRole === 'discovery'
          ? 'discovery'
          : metadata?.evidenceRole === 'reading'
            ? 'reading'
            : 'none',
      paths,
    },
  })
}
