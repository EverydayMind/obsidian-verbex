import { ReactNode } from 'react'

import type { ModelDiagnosticsReport } from '../../../../core/llm/modelDiagnostics'
import { t } from '../../../../i18n'

type EndpointList = Extract<
  ModelDiagnosticsReport['openRouterEndpoints'],
  { status: 'ok' }
>['endpoints']

export function formatEndpointsValue(
  report: ModelDiagnosticsReport,
): ReactNode {
  const ep = report.openRouterEndpoints
  if (ep.status === 'aborted') {
    return t('settings.chatModels.diagnostics.values.aborted')
  }
  if (ep.status === 'unavailable' || ep.status === 'not_applicable') {
    return t('settings.chatModels.diagnostics.values.unavailable')
  }
  if (ep.status === 'error') {
    return t('settings.chatModels.diagnostics.values.failed', {
      message: ep.message,
    })
  }
  if (ep.endpoints.length === 0) {
    return t('settings.chatModels.diagnostics.values.noEndpoints')
  }
  // Popular models have dozens of endpoints: show counts, list on demand.
  const lines = new Map<string, number>()
  for (const line of formatEndpointLines(ep.endpoints)) {
    lines.set(line, (lines.get(line) ?? 0) + 1)
  }
  const quantCounts = new Map<string, number>()
  for (const item of ep.endpoints) {
    const quant =
      item.quantization ??
      t('settings.chatModels.diagnostics.values.quantUnknown')
    quantCounts.set(quant, (quantCounts.get(quant) ?? 0) + 1)
  }
  const summary = t('settings.chatModels.diagnostics.values.endpointsSummary', {
    count: String(ep.endpoints.length),
    supported: String(
      ep.endpoints.filter((item) => item.supportsToolChoice).length,
    ),
    quant: [...quantCounts]
      .sort((a, b) => b[1] - a[1])
      .map(([quant, n]) => `${quant} ${n}`)
      .join(', '),
  })
  return (
    <>
      {summary}
      <details className="verbex-model-diagnostics__endpoints">
        <summary>
          {t('settings.chatModels.diagnostics.values.endpointsList')}
        </summary>
        <ul>
          {[...lines].map(([line, n]) => (
            <li key={line}>{n > 1 ? `${line} ×${n}` : line}</li>
          ))}
        </ul>
      </details>
    </>
  )
}

function formatEndpointLines(endpoints: EndpointList): string[] {
  return endpoints.map((item) => {
    const quant =
      item.quantization ??
      t('settings.chatModels.diagnostics.values.quantUnknown')
    const tc =
      item.supportsToolChoice === undefined
        ? t('settings.chatModels.diagnostics.values.toolChoiceUnknown')
        : item.supportsToolChoice
          ? t('settings.chatModels.diagnostics.values.toolChoiceSupported')
          : t('settings.chatModels.diagnostics.values.toolChoiceUnsupported')
    return `${item.providerName} (${quant}, ${tc})`
  })
}
