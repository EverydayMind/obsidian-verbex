import { ChevronDown, ChevronRight, Workflow } from 'lucide-react'
import { useState } from 'react'

import { t } from '../../i18n'
import { ChatWorkflowContextItem } from '../../types/chat'

export default function WorkflowContextResults({
  workflowContext,
  onToggleWorkflow,
  onResubmit,
}: {
  workflowContext: ChatWorkflowContextItem[]
  onToggleWorkflow?: (id: string) => void
  onResubmit?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const includedCount = workflowContext.filter(
    (workflow) => workflow.included,
  ).length
  const isEmpty = workflowContext.length === 0

  return (
    <div className="verbex-similarity-search-results">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="verbex-similarity-search-results__trigger"
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div>
          {t('ui.WorkflowContextResults.count', {
            p0: includedCount,
            p1: workflowContext.length,
          })}
        </div>
      </div>
      {isOpen && (
        <div className="verbex-skill-context-list">
          {isEmpty ? (
            <div className="verbex-context-empty">
              {t('ui.WorkflowContextResults.empty')}
            </div>
          ) : (
            <>
              {workflowContext.map((workflow) => (
                <label key={workflow.id} className="verbex-skill-context-item">
                  <input
                    type="checkbox"
                    checked={workflow.included}
                    onChange={() => onToggleWorkflow?.(workflow.id)}
                  />
                  <Workflow size={12} className="verbex-skill-context-icon" />
                  <span className="verbex-skill-context-name">
                    {workflow.name}
                  </span>
                  <span className="verbex-skill-context-overview">
                    {workflow.overview || workflow.id}
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
