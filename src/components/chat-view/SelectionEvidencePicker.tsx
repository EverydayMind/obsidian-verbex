import { t } from '../../i18n'
import { WorkflowEvidence } from '../../skills/standaloneSkills'
import { ChatSkillContextItem, ChatWorkflowContextItem } from '../../types/chat'
import { normalizeWorkflowRef } from '../../workflow/workflowRef'

import { suggestedSkillText, workflowEvidenceText } from './selectionEvidence'
import { SkillCheckbox } from './SkillAvailability'
import { SkillGroupList } from './SkillGroupList'

export function SelectionEvidencePicker(props: {
  skills: ChatSkillContextItem[]
  workflows: ChatWorkflowContextItem[]
  evidence: Record<string, WorkflowEvidence>
  suggestedSkills: string[]
  /** Skills the Skill budget would leave out if the user proceeds now. */
  budgetDropped?: ReadonlySet<string>
  budgetSummary?: string | null
  onSkillToggle: (id: string) => void
  onWorkflowToggle: (id: string) => void
}) {
  return (
    <div className="verbex-skill-picker verbex-selection-confirm-picker">
      {props.budgetSummary && (
        <small className="verbex-selection-evidence">
          {props.budgetSummary}
        </small>
      )}
      {props.skills.length > 0 && (
        <div className="verbex-skill-picker-group">
          <div className="verbex-skill-picker-heading">
            {t('ui.ChatContextSelector.skills')}
          </div>
          <SkillGroupList
            skills={props.skills}
            render={(skill) => (
              <label key={`pending-skill:${skill.id}`}>
                <span>
                  <SkillCheckbox skill={skill} onToggle={props.onSkillToggle} />
                  {props.budgetDropped?.has(skill.id) && (
                    <small className="verbex-selection-evidence">
                      {t('contextBudget.skillsDroppedPreview')}
                    </small>
                  )}
                  {props.suggestedSkills.includes(skill.id) && (
                    <small className="verbex-selection-evidence">
                      {suggestedSkillText(true)}
                    </small>
                  )}
                </span>
              </label>
            )}
          />
        </div>
      )}
      {props.workflows.length > 0 && (
        <div className="verbex-skill-picker-group">
          <div className="verbex-skill-picker-heading">
            {t('ui.ChatContextSelector.workflows')}
          </div>
          {props.workflows.map((workflow) => (
            <label key={`pending-workflow:${workflow.id}`}>
              <input
                type="checkbox"
                checked={workflow.included}
                onChange={() => props.onWorkflowToggle(workflow.id)}
              />
              <span>
                {workflow.name || workflow.id}
                <small className="verbex-selection-evidence">
                  {workflowEvidenceText(
                    Object.entries(props.evidence).find(
                      ([id]) =>
                        normalizeWorkflowRef(id) ===
                        normalizeWorkflowRef(workflow.id),
                    )?.[1],
                  )}
                </small>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
