import { RefreshCcw, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'

import { t } from '../../i18n'
import {
  ChatSkillContextItem,
  ChatWorkflowContextItem,
  SkillWorkflowSelectionMode,
} from '../../types/chat'

import { SkillCheckbox } from './SkillAvailability'

type ChatContextSelectorProps = {
  /** All available skills with `included` reflecting the active selection. */
  skills: ChatSkillContextItem[]
  /** All available workflow guides with `included` reflecting the active selection. */
  workflows: ChatWorkflowContextItem[]
  mode: SkillWorkflowSelectionMode
  onToggleSkill: (name: string) => void
  onToggleWorkflow: (id: string) => void
  onSwitchToAuto: () => void
  onOpen?: () => void
}

/**
 * In-chat skill / workflow picker. Lets the user change which skills and
 * workflow guides are injected mid-conversation; the new selection applies to
 * the next turn, with no need to edit and resubmit an earlier message.
 */
export function ChatContextSelector({
  skills,
  workflows,
  mode,
  onToggleSkill,
  onToggleWorkflow,
  onSwitchToAuto,
  onOpen,
}: ChatContextSelectorProps) {
  const [open, setOpen] = useState(false)

  if (skills.length === 0 && workflows.length === 0) {
    return null
  }

  return (
    <>
      <span
        className={`verbex-skill-mode-badge verbex-skill-mode-badge--${mode}`}
      >
        {mode === 'locked'
          ? t('ui.ChatContextSelector.pinned')
          : t('ui.ChatContextSelector.autoSuggestion')}
      </span>
      {mode === 'locked' && (
        <button
          type="button"
          className="verbex-skill-bar-edit"
          aria-label={t('ui.ChatContextSelector.switchToAutoSuggestions')}
          title={t('ui.ChatContextSelector.switchToAutoSuggestions2')}
          onClick={onSwitchToAuto}
        >
          <RefreshCcw size={12} />
          <span>{t('ui.ChatContextSelector.auto')}</span>
        </button>
      )}
      <button
        type="button"
        className="verbex-skill-bar-edit"
        aria-label={t('ui.ChatContextSelector.changeSkillWorkflow')}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen((prev) => !prev)
        }}
      >
        <SlidersHorizontal size={12} />
        <span>{t('ui.ChatContextSelector.change')}</span>
      </button>
      {open && (
        <div className="verbex-skill-picker">
          {skills.length > 0 && (
            <div className="verbex-skill-picker-group">
              <div className="verbex-skill-picker-heading">
                {t('ui.ChatContextSelector.skills')}
              </div>
              {skills.map((skill) => (
                <label key={`pick-skill:${skill.name}`} title={skill.overview}>
                  <SkillCheckbox skill={skill} onToggle={onToggleSkill} />
                </label>
              ))}
            </div>
          )}
          {workflows.length > 0 && (
            <div className="verbex-skill-picker-group">
              <div className="verbex-skill-picker-heading">
                {t('ui.ChatContextSelector.workflows')}
              </div>
              {workflows.map((workflow) => (
                <label
                  key={`pick-workflow:${workflow.id}`}
                  title={workflow.overview}
                >
                  <input
                    type="checkbox"
                    checked={workflow.included}
                    onChange={() => onToggleWorkflow(workflow.id)}
                  />
                  <span>{workflow.name || workflow.id}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
