import { t } from '../../i18n'
import { WorkflowEvidence } from '../../skills/standaloneSkills'

export function workflowEvidenceText(evidence?: WorkflowEvidence): string {
  if (!evidence) return ''
  switch (evidence.kind) {
    case 'keyword':
      return t('ui.selectionEvidence.skillActivatedByKeyword', {
        p0: (evidence.skillNames ?? []).join(', '),
      })
    case 'keyword_conflict':
      return t(
        'ui.selectionEvidence.skillActivatedByKeywordFollowedModelSuggestion',
        { p0: (evidence.skillNames ?? []).join(', ') },
      )
    case 'treaty_size':
      return t(
        'ui.selectionEvidence.agreementKeywordModelSuggestionInformedBySelected',
      )
    case 'llm_only':
      return t('ui.selectionEvidence.modelSuggestionNoKeywordMatch')
  }
}

export function suggestedSkillText(suggested: boolean): string {
  return suggested
    ? t('ui.selectionEvidence.modelSuggestionNoWorkflowSelected')
    : ''
}

export function workflowAuditText(
  evidence: Record<string, WorkflowEvidence>,
): string {
  return (
    Object.entries(evidence)
      .map(
        ([id, item]) =>
          `${id}: ${item.kind}${item.kind === 'llm_only' ? ', not preselected' : ''}`,
      )
      .join(', ') || 'none'
  )
}
