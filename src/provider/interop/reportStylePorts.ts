import type { App } from 'obsidian'

import { getStyleApi } from '../../core/report-style/kordocStyleApi'
import type { ReportStylePorts } from '../../core/report-style/ports'
import { validateStyleJson } from '../../core/report-style/schema'
import { parseVariantMarker } from '../../core/report-style/variantMarkers'
import { HWPX_EXPORTER_PROVIDER_ID } from '../contract'

import type { HostContext } from './editorActions'
import { hostInternalRead } from './hostInternalRead'
import { observedBlockPort } from './observedBlockPort'

/** Exporter-specific port binding lives outside the generic native host. */
export function reportStylePorts(
  app: App,
  host: HostContext,
): ReportStylePorts {
  return {
    styleApi: () => getStyleApi(app),
    inspectExportBlocks: observedBlockPort(host),
    readDerivationReport: async (path, sha256, signal) =>
      validateStyleJson(
        'report',
        await hostInternalRead(
          host,
          HWPX_EXPORTER_PROVIDER_ID,
          'get_derivation_report',
          { path, expected_sha256: sha256 },
          signal,
        ),
      ),
    validateMarkers: async (markers, signal) => {
      const options = await hostInternalRead(
        host,
        HWPX_EXPORTER_PROVIDER_ID,
        'get_export_options',
        {},
        signal,
      )
      const catalog = options.markerCatalog
      if (
        !Array.isArray(catalog) ||
        catalog.some((item) => typeof item !== 'string') ||
        markers.some((marker) => {
          const named = parseVariantMarker(marker)
          return (
            !catalog.includes(marker) &&
            !(
              named &&
              (['CAPTION', 'TABLE_CAPTION', 'FOOTNOTE'].includes(named.base)
                ? options.captionFootnoteVariantSupport === 1
                : options.variantMarkerSupport === 1) &&
              catalog.includes(named.base)
            ) &&
            !(
              options.prefixMarkerSupport === 1 &&
              ![...marker].some(
                (character) =>
                  character.charCodeAt(0) < 32 ||
                  character.charCodeAt(0) === 127,
              ) &&
              /^[^A-Za-z{}<>\r\n][^{}<>\r\n]{0,15}$/.test(marker)
            ) &&
            // {{SPACE:rule:previous}} context spacer rules (Exporter contextSpacers.ts).
            !(
              options.contextSpacerSupport === 1 &&
              /^SPACE:[^{}<>\r\n:]{1,16}:[^{}<>\r\n:]{1,16}$/.test(marker)
            )
          )
        })
      )
        throw new Error(
          'Exporter marker catalog unavailable or unsupported marker.',
        )
    },
  }
}
