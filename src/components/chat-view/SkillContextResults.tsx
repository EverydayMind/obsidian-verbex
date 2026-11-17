import { ChevronDown, ChevronRight, Wand2 } from 'lucide-react'
import { useState } from 'react'

import { t } from '../../i18n'
import { ChatSkillContextItem } from '../../types/chat'

import { SkillCheckbox } from './SkillAvailability'

export default function SkillContextResults({
  skillContext,
  onToggleSkill,
  onResubmit,
}: {
  skillContext: ChatSkillContextItem[]
  onToggleSkill?: (name: string) => void
  onResubmit?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const includedCount = skillContext.filter((skill) => skill.included).length
  const isEmpty = skillContext.length === 0

  return (
    <div className="verbex-similarity-search-results">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="verbex-similarity-search-results__trigger"
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div>
          {t('ui.SkillContextResults.count', {
            p0: includedCount,
            p1: skillContext.length,
          })}
        </div>
      </div>
      {isOpen && (
        <div className="verbex-skill-context-list">
          {isEmpty ? (
            <div className="verbex-context-empty">
              {t('ui.SkillContextResults.empty')}
            </div>
          ) : (
            <>
              {skillContext.map((skill) => (
                <label key={skill.name} className="verbex-skill-context-item">
                  <Wand2 size={12} className="verbex-skill-context-icon" />
                  <SkillCheckbox skill={skill} onToggle={onToggleSkill} />
                  <span className="verbex-skill-context-overview">
                    {skill.overview || skill.path}
                  </span>
                </label>
              ))}
              {onResubmit && (
                <button
                  type="button"
                  className="verbex-context-resubmit-button"
                  onClick={onResubmit}
                >
                  {t('ui.SkillContextResults.resend')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
