import { ReactNode } from 'react'

import {
  computeOutputBudget,
  resolveContextWindow,
} from '../../../../core/llm/contextWindow'
import {
  ModelProfile,
  ModelProfileFieldKey,
  RecommendedField,
  hasRecommendedSettings,
} from '../../../../core/llm/modelProfiles'
import { Locale, getCurrentLocale, t } from '../../../../i18n'
import { VerbexSettings } from '../../../../settings/schema/setting.types'
import {
  ChatModel,
  EXTRA_INSTRUCTIONS_MAX_LENGTH,
} from '../../../../types/chat-model.types'
import { ObsidianButton } from '../../../common/ObsidianButton'

import { isOpenAiCompatibleChatModel } from './chatModelSettingsForm'
import { ChatModelWarning } from './chatModelWarnings'

const FIELD_ORDER: readonly ModelProfileFieldKey[] = [
  'toolTurnReasoningEffort',
  'openRouterReasoningMaxTokens',
  'selectionReasoningEffort',
  'selectionTimeoutSec',
  'openRouterProviderOrder',
  'openRouterAllowFallbacks',
  'contextWindow',
  'extraInstructions',
]

function isUnset<T>(
  field: RecommendedField<T>,
): field is { readonly unset: true } {
  return 'unset' in field && field.unset
}

function arraysEqual(
  a: readonly string[] | undefined,
  b: readonly string[],
): boolean {
  if (!a || a.length !== b.length) return false
  return a.every((item, idx) => item === b[idx])
}

type FieldRow = {
  key: ModelProfileFieldKey
  label: string
  currentText: string
  recommendedText: string
  applied: boolean
  reason?: string
}

function formatUnset(): string {
  return t('settings.chatModels.recommendedProfile.unsetLabel')
}

function buildFieldRow(
  key: ModelProfileFieldKey,
  draft: ChatModel,
  profile: ModelProfile,
  locale: Locale,
): FieldRow | null {
  const rec = profile.recommended
  const reason = profile.reasons[key]?.[locale]
  const compat = isOpenAiCompatibleChatModel(draft)
  const openRouter = draft.providerType === 'openrouter'

  switch (key) {
    case 'toolTurnReasoningEffort': {
      const spec = rec.toolTurnReasoningEffort
      if (!spec) return null
      const cur = compat ? draft.toolTurnReasoningEffort : undefined
      return {
        key,
        label: t('settings.chatModels.toolTurnReasoningEffortField.name'),
        currentText: cur ?? formatUnset(),
        recommendedText: isUnset(spec) ? formatUnset() : spec.value,
        applied: isUnset(spec) ? cur === undefined : cur === spec.value,
        reason,
      }
    }
    case 'selectionReasoningEffort': {
      const spec = rec.selectionReasoningEffort
      if (!spec) return null
      const cur = compat ? draft.selectionReasoningEffort : undefined
      return {
        key,
        label: t('settings.chatModels.selectionReasoningEffortField.name'),
        currentText: cur ?? formatUnset(),
        recommendedText: isUnset(spec) ? formatUnset() : spec.value,
        applied: isUnset(spec) ? cur === undefined : cur === spec.value,
        reason,
      }
    }
    case 'selectionTimeoutSec': {
      const spec = rec.selectionTimeoutSec
      if (!spec) return null
      const cur = draft.selectionTimeoutSec
      const secUnit = t('settings.chatModels.recommendedProfile.secondsUnit')
      return {
        key,
        label: t('settings.chatModels.selectionTimeoutSecField.name'),
        currentText: cur !== undefined ? `${cur}${secUnit}` : formatUnset(),
        recommendedText: isUnset(spec)
          ? formatUnset()
          : `${spec.value}${secUnit}`,
        applied: isUnset(spec) ? cur === undefined : cur === spec.value,
        reason,
      }
    }
    case 'openRouterProviderOrder': {
      const spec = rec.openRouterProviderOrder
      if (!spec) return null
      const cur = openRouter ? draft.openRouterProvider?.order : undefined
      return {
        key,
        label: t('settings.chatModels.openRouterProviderOrderField.name'),
        currentText: cur && cur.length > 0 ? cur.join(', ') : formatUnset(),
        recommendedText: isUnset(spec) ? formatUnset() : spec.value.join(', '),
        applied: isUnset(spec)
          ? !cur || cur.length === 0
          : arraysEqual(cur, spec.value),
        reason,
      }
    }
    case 'openRouterAllowFallbacks': {
      const spec = rec.openRouterAllowFallbacks
      if (!spec) return null
      const cur = openRouter
        ? draft.openRouterProvider?.allowFallbacks
        : undefined
      const fmtBool = (v: boolean | undefined) =>
        v === undefined
          ? formatUnset()
          : t(
              `settings.chatModels.openRouterAllowFallbacksOptions.${String(v)}`,
            )
      return {
        key,
        label: t('settings.chatModels.openRouterAllowFallbacksField.name'),
        currentText: fmtBool(cur),
        recommendedText: isUnset(spec) ? formatUnset() : fmtBool(spec.value),
        applied: isUnset(spec) ? cur === undefined : cur === spec.value,
        reason,
      }
    }
    case 'openRouterReasoningMaxTokens': {
      const spec = rec.openRouterReasoningMaxTokens
      if (!spec) return null
      const cur = openRouter ? draft.openRouterReasoning?.maxTokens : undefined
      return {
        key,
        label: t('settings.chatModels.openRouterReasoningMaxTokensField.name'),
        currentText: cur !== undefined ? cur.toLocaleString() : formatUnset(),
        recommendedText: isUnset(spec)
          ? formatUnset()
          : spec.value.toLocaleString(),
        applied: isUnset(spec) ? cur === undefined : cur === spec.value,
        reason,
      }
    }
    case 'contextWindow': {
      const spec = rec.contextWindow
      if (!spec) return null
      const cur = draft.contextWindow
      return {
        key,
        label: t('settings.chatModels.contextWindowField.name'),
        currentText: cur !== undefined ? cur.toLocaleString() : formatUnset(),
        recommendedText: isUnset(spec)
          ? formatUnset()
          : spec.value.toLocaleString(),
        applied: isUnset(spec)
          ? cur === undefined
          : cur !== undefined && cur >= spec.value,
        reason,
      }
    }
    case 'extraInstructions': {
      const spec = rec.extraInstructions
      if (!spec) return null
      const cur = draft.extraInstructions
      const applied = isUnset(spec)
        ? !cur
        : cur?.includes(spec.value[locale].trim()) === true
      return {
        key,
        label: t('settings.chatModels.extraInstructionsField.name'),
        currentText: cur
          ? t('settings.chatModels.recommendedProfile.instructionsCustom')
          : formatUnset(),
        recommendedText: isUnset(spec)
          ? formatUnset()
          : t('settings.chatModels.recommendedProfile.instructionsRecommended'),
        applied,
        reason,
      }
    }
  }
}

export type ModelRecommendedSettingsCardProps = {
  draft: ChatModel
  profile: ModelProfile | undefined
  settings: VerbexSettings
  warnings: readonly ChatModelWarning[]
  extraInstructionsOverflow: boolean
  onFillRecommended: () => void
  /** Reserved slot for WP-P2 diagnosis button on models without a profile. */
  diagnosisSlot?: ReactNode
}

export function ModelRecommendedSettingsCard({
  draft,
  profile,
  settings,
  warnings,
  extraInstructionsOverflow,
  onFillRecommended,
  diagnosisSlot,
}: ModelRecommendedSettingsCardProps) {
  const locale = getCurrentLocale()
  const rows: FieldRow[] = profile
    ? FIELD_ORDER.map((key) =>
        buildFieldRow(key, draft, profile, locale),
      ).filter((row): row is FieldRow => row !== null)
    : []
  const hasRecommendations = profile ? hasRecommendedSettings(profile) : false
  const cardCaveats = profile
    ? profile.caveats.filter((caveat) => caveat.displayInCard)
    : []

  const recMaxTokensSpec = profile?.recommended.openRouterReasoningMaxTokens
  const recMaxTokens =
    recMaxTokensSpec && !isUnset(recMaxTokensSpec)
      ? recMaxTokensSpec.value
      : undefined
  const effectiveContextWindow =
    draft.contextWindow ??
    resolveContextWindow({ ...draft, contextWindow: undefined })
  const outputBudget = computeOutputBudget(
    effectiveContextWindow,
    settings.verbex.context.reservedOutputTokens,
  )
  const exceedsOutputBudget =
    recMaxTokens !== undefined && recMaxTokens >= outputBudget

  return (
    <div className="verbex-model-profile-section">
      <div className="verbex-model-profile-card">
        <div className="verbex-model-profile-card__header">
          <strong>
            {t('settings.chatModels.recommendedProfile.cardTitle')}
          </strong>
          {profile && hasRecommendations && (
            <ObsidianButton
              text={t('settings.chatModels.recommendedProfile.fillButton')}
              onClick={onFillRecommended}
            />
          )}
        </div>

        {!profile && (
          <div className="verbex-model-profile-card__empty">
            <div>{t('settings.chatModels.recommendedProfile.noProfile')}</div>
            <div className="verbex-model-profile-card__meta">
              {t('settings.chatModels.recommendedProfile.noProfileGuide')}
            </div>
            {diagnosisSlot && (
              <div className="verbex-model-profile-card__diagnosis">
                {diagnosisSlot}
              </div>
            )}
          </div>
        )}

        {profile && !hasRecommendations && (
          <div className="verbex-model-profile-card__defaults">
            {t('settings.chatModels.recommendedProfile.useDefaults')}
          </div>
        )}

        {profile && rows.length > 0 && (
          <ul className="verbex-model-profile-card__list">
            {rows.map((row) => (
              <li key={row.key} className="verbex-model-profile-card__row">
                <div className="verbex-model-profile-card__row-main">
                  <span className="verbex-model-profile-card__field">
                    {row.label}
                  </span>
                  {row.applied ? (
                    <span className="verbex-model-profile-card__applied">
                      {t('settings.chatModels.recommendedProfile.applied')} (
                      {row.currentText})
                    </span>
                  ) : (
                    <span className="verbex-model-profile-card__diff">
                      {row.currentText} → {row.recommendedText}
                    </span>
                  )}
                </div>
                {row.reason && (
                  <div className="verbex-model-profile-card__reason">
                    {row.reason}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {cardCaveats.length > 0 && (
          <div className="verbex-model-profile-card__caveats">
            {cardCaveats.map((caveat) => (
              <div key={caveat.id}>{caveat.text[locale]}</div>
            ))}
          </div>
        )}

        {exceedsOutputBudget && recMaxTokens !== undefined && (
          <div className="verbex-model-profile-card__notice">
            {t('settings.chatModels.recommendedProfile.outputBudgetNotice', {
              recommended: recMaxTokens.toLocaleString(),
              outputBudget: outputBudget.toLocaleString(),
            })}
          </div>
        )}

        {extraInstructionsOverflow && (
          <div className="verbex-model-profile-card__notice">
            {t(
              'settings.chatModels.recommendedProfile.extraInstructionsOverflow',
              { max: EXTRA_INSTRUCTIONS_MAX_LENGTH.toLocaleString() },
            )}
          </div>
        )}

        {profile && (
          <div className="verbex-model-profile-card__footer">
            <div>
              {t('settings.chatModels.recommendedProfile.evidenceLine', {
                summary: profile.evidence.summary[locale],
                checkedAt: profile.checkedAt,
              })}
            </div>
            <div>
              {t('settings.chatModels.recommendedProfile.mayChangeNotice')}
            </div>
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="verbex-model-profile-warnings" role="alert">
          <ul className="verbex-model-profile-warnings__list">
            {warnings.map((warning) => (
              <li key={warning.id}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
