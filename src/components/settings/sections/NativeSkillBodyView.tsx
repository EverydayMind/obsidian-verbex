import { useState } from 'react'

import { t } from '../../../i18n'
import type { ReadAssetOutcome } from '../../../provider/interop/hostCapabilities/readAsset'

export type ReadSkillBody = (skill: {
  id: string
  locale: 'ko' | 'en'
}) => Promise<ReadAssetOutcome>

type View =
  | { state: 'closed' }
  | { state: 'loading' }
  | { state: 'done'; outcome: ReadAssetOutcome }

/**
 * Shows one Skill body on the approval screen. The body lives in this
 * component's state only and is rendered as plain text: it is never stored,
 * sent to a model, or interpreted as Markdown or HTML.
 */
export function NativeSkillBodyView({
  skill,
  readBody,
}: {
  skill: { id: string; locale: 'ko' | 'en' }
  readBody: ReadSkillBody
}) {
  const [view, setView] = useState<View>({ state: 'closed' })
  const toggle = async () => {
    if (view.state !== 'closed') return setView({ state: 'closed' })
    setView({ state: 'loading' })
    let outcome: ReadAssetOutcome
    try {
      outcome = await readBody(skill)
    } catch {
      outcome = { ok: false, reason: 'read_error' }
    }
    setView({ state: 'done', outcome })
  }
  return (
    <div className="verbex-native-skill-body-view">
      <button type="button" onClick={() => void toggle()}>
        {view.state === 'closed'
          ? t('ui.nativeSkills.viewBody')
          : t('ui.nativeSkills.hideBody')}
      </button>
      {view.state === 'loading' && <p>{t('ui.nativeSkills.bodyLoading')}</p>}
      {view.state === 'done' && (
        <>
          <p>
            {view.outcome.ok
              ? t('ui.nativeSkills.bodyVerified')
              : t('ui.nativeSkills.bodyUnverified', {
                  reason: `${t(`ui.nativeSkills.reason.${view.outcome.reason}`)} (${view.outcome.reason})`,
                })}
          </p>
          <p>{t('ui.nativeSkills.bodyDisplayOnly')}</p>
          {view.outcome.ok && (
            <pre className="verbex-native-skill-body">{view.outcome.body}</pre>
          )}
        </>
      )}
    </div>
  )
}
