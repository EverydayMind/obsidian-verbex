import { collectObservedDraft } from '../../core/report-style/observedBlockRead'
import type { ReportStylePorts } from '../../core/report-style/ports'
import { HWPX_EXPORTER_PROVIDER_ID } from '../contract'

import type { HostContext } from './editorActions'
import { hostInternalRead } from './hostInternalRead'

export function observedBlockPort(
  host: HostContext,
): NonNullable<ReportStylePorts['inspectExportBlocks']> {
  return async (path, template, draftSha256, templateSha256, signal) => {
    await host.refresh(signal)
    const tool = host
      .getActiveDiscovered(HWPX_EXPORTER_PROVIDER_ID)
      ?.descriptor?.tools.find((item) => item.name === 'inspect_export_blocks')
    const properties = tool?.inputSchema.properties
    const version =
      properties && typeof properties === 'object' && !Array.isArray(properties)
        ? properties.block_contract_version
        : undefined
    const choices =
      version && typeof version === 'object' && !Array.isArray(version)
        ? version.enum
        : undefined
    const supportsScripts =
      Array.isArray(choices) && choices.includes('observed-block-page/0.4')
    return collectObservedDraft({
      path,
      template,
      draftSha256,
      templateSha256,
      signal,
      read: (args, currentSignal) =>
        hostInternalRead(
          host,
          HWPX_EXPORTER_PROVIDER_ID,
          'inspect_export_blocks',
          supportsScripts
            ? { ...args, block_contract_version: 'observed-block-page/0.4' }
            : args,
          currentSignal,
        ),
    })
  }
}
