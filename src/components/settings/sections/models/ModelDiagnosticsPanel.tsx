import { useEffect, useRef, useState } from 'react'

import {
  DiagnosticFormFields,
  DiagnosticReasoningProbe,
  DiagnosticStepId,
  DiagnosticSuggestion,
  ModelDiagnosticsReport,
  runModelDiagnostics,
} from '../../../../core/llm/modelDiagnostics'
import { t } from '../../../../i18n'
import { VerbexSettings } from '../../../../settings/schema/setting.types'
import { ChatModel } from '../../../../types/chat-model.types'
import { LLMProvider } from '../../../../types/provider.types'
import { ObsidianButton } from '../../../common/ObsidianButton'

import { formatEndpointsValue } from './modelDiagnosticsEndpoints'

export type ModelDiagnosticsPanelProps = {
  draft: ChatModel
  provider?: LLMProvider
  settings: VerbexSettings
  onApplySuggested: (fields: DiagnosticFormFields) => void
}

function formatReasoningProbe(
  probe: DiagnosticReasoningProbe | undefined,
): string {
  if (!probe || probe.status === 'aborted') {
    return t('settings.chatModels.diagnostics.values.aborted')
  }
  if (probe.status === 'measured') {
    return t('settings.chatModels.diagnostics.values.tokens', {
      count: probe.reasoningTokens.toLocaleString(),
    })
  }
  if (probe.status === 'unavailable') {
    return t('settings.chatModels.diagnostics.values.unmeasured')
  }
  return t('settings.chatModels.diagnostics.values.failed', {
    message: probe.message,
  })
}

function formatToolCallValue(report: ModelDiagnosticsReport): string {
  if (report.toolCall.status === 'aborted') {
    return t('settings.chatModels.diagnostics.values.aborted')
  }
  const res = report.toolCall.result
  switch (res.kind) {
    case 'structured':
      return t('settings.chatModels.diagnostics.values.toolStructured')
    case 'text_call':
      return t('settings.chatModels.diagnostics.values.toolTextCall')
    case 'no_call':
      return t('settings.chatModels.diagnostics.values.toolNoCall')
    case 'rejected':
      return t('settings.chatModels.diagnostics.values.toolRejected', {
        message: res.message,
      })
    case 'error':
      return t('settings.chatModels.diagnostics.values.failed', {
        message: res.message,
      })
  }
}

function formatClassificationValue(report: ModelDiagnosticsReport): string {
  const c = report.classificationLatency
  if (c.status === 'aborted') {
    return t('settings.chatModels.diagnostics.values.aborted')
  }
  if (c.status === 'error') {
    return t('settings.chatModels.diagnostics.values.failed', {
      message: c.message,
    })
  }
  return t('settings.chatModels.diagnostics.values.seconds', {
    seconds: (c.durationMs / 1000).toFixed(1),
  })
}

function formatObservedProviders(report: ModelDiagnosticsReport): string {
  if (report.observedProviders.length === 0) {
    return t('settings.chatModels.diagnostics.values.unmeasured')
  }
  const unique = [...new Set(report.observedProviders.map((e) => e.provider))]
  return unique.join(', ')
}

function formatSuggestion(suggestion: DiagnosticSuggestion): string {
  return t(
    `settings.chatModels.diagnostics.suggestions.${suggestion.id}`,
    suggestion.params,
  )
}

export function ModelDiagnosticsPanel({
  draft,
  provider,
  settings,
  onApplySuggested,
}: ModelDiagnosticsPanelProps) {
  const [running, setRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState<DiagnosticStepId | null>(null)
  const [report, setReport] = useState<ModelDiagnosticsReport | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  const handleRun = async () => {
    if (!provider || running) return
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setCurrentStep('tool_call')
    setReport(null)
    try {
      const result = await runModelDiagnostics({
        draft,
        provider,
        settings,
        signal: controller.signal,
        onStepChange: (step) => {
          if (mountedRef.current) setCurrentStep(step)
        },
      })
      if (mountedRef.current) {
        setReport(result)
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (mountedRef.current) {
        setRunning(false)
        setCurrentStep(null)
      }
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const isOpenRouter = provider?.type === 'openrouter'
  const hasSuggestedFields =
    report !== null && Object.keys(report.suggestedFields).length > 0

  return (
    <div className="verbex-model-diagnostics">
      <div className="verbex-model-diagnostics__controls">
        {running ? (
          <ObsidianButton
            text={t('settings.chatModels.diagnostics.stopButton')}
            warning
            onClick={handleStop}
          />
        ) : (
          <ObsidianButton
            text={t('settings.chatModels.diagnostics.runButton')}
            disabled={!provider || !draft.model.trim()}
            onClick={() => {
              void handleRun()
            }}
          />
        )}
        <span className="verbex-model-diagnostics__notice">
          {running && currentStep
            ? t('settings.chatModels.diagnostics.runningStep', {
                step: t(`settings.chatModels.diagnostics.steps.${currentStep}`),
              })
            : t('settings.chatModels.diagnostics.costNotice')}
        </span>
      </div>

      {report && (
        <div className="verbex-model-diagnostics__result">
          {report.aborted && (
            <div className="verbex-model-diagnostics__aborted">
              {t('settings.chatModels.diagnostics.abortedNotice')}
            </div>
          )}

          <table className="verbex-model-diagnostics__table">
            <thead>
              <tr>
                <th>{t('settings.chatModels.diagnostics.table.itemHeader')}</th>
                <th>
                  {t('settings.chatModels.diagnostics.table.valueHeader')}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {t('settings.chatModels.diagnostics.table.toolCallLabel')}
                </td>
                <td>{formatToolCallValue(report)}</td>
              </tr>
              {report.reasoningComparison.applicable && (
                <tr>
                  <td>
                    {t(
                      'settings.chatModels.diagnostics.table.reasoningEffortLabel',
                    )}
                  </td>
                  <td>
                    {t(
                      'settings.chatModels.diagnostics.values.reasoningSummary',
                      {
                        defaultVal: formatReasoningProbe(
                          report.reasoningComparison.default,
                        ),
                        noneVal: formatReasoningProbe(
                          report.reasoningComparison.none,
                        ),
                        lowVal: formatReasoningProbe(
                          report.reasoningComparison.low,
                        ),
                      },
                    )}
                  </td>
                </tr>
              )}
              {isOpenRouter && (
                <tr>
                  <td>
                    {t(
                      'settings.chatModels.diagnostics.table.openRouterMaxTokensLabel',
                    )}
                  </td>
                  <td>
                    {report.openRouterMaxTokens.status === 'not_applicable'
                      ? t('settings.chatModels.diagnostics.values.unavailable')
                      : formatReasoningProbe(report.openRouterMaxTokens)}
                  </td>
                </tr>
              )}
              <tr>
                <td>
                  {t(
                    'settings.chatModels.diagnostics.table.classificationLatencyLabel',
                  )}
                </td>
                <td>{formatClassificationValue(report)}</td>
              </tr>
              {(isOpenRouter || report.observedProviders.length > 0) && (
                <tr>
                  <td>
                    {t(
                      'settings.chatModels.diagnostics.table.observedProvidersLabel',
                    )}
                  </td>
                  <td>{formatObservedProviders(report)}</td>
                </tr>
              )}
              {isOpenRouter && (
                <tr>
                  <td>
                    {t(
                      'settings.chatModels.diagnostics.table.openRouterEndpointsLabel',
                    )}
                  </td>
                  <td>{formatEndpointsValue(report)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {report.suggestions.length > 0 ? (
            <div className="verbex-model-diagnostics__suggestions">
              <div className="verbex-model-diagnostics__suggestions-header">
                <strong>
                  {t('settings.chatModels.diagnostics.suggestionsTitle')}
                </strong>
                {hasSuggestedFields && (
                  <ObsidianButton
                    text={t(
                      'settings.chatModels.diagnostics.fillSuggestedButton',
                    )}
                    onClick={() => onApplySuggested(report.suggestedFields)}
                  />
                )}
              </div>
              <ul className="verbex-model-diagnostics__suggestions-list">
                {report.suggestions.map((suggestion) => (
                  <li key={suggestion.id}>{formatSuggestion(suggestion)}</li>
                ))}
              </ul>
            </div>
          ) : (
            !report.aborted && (
              <div className="verbex-model-diagnostics__empty">
                {t('settings.chatModels.diagnostics.noSuggestions')}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
