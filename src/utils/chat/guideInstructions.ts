import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import { SkillRouter } from '../../skills/SkillRouter'
import { allowedToolsDirective } from '../../skills/skillScope'
import { ChatSkillContextItem, ChatWorkflowContextItem } from '../../types/chat'

import { MAX_SELECTED_WORKFLOW_GUIDES } from './promptGenerator'

export function buildGuideInstructions(
  skills?: ChatSkillContextItem[],
  workflows?: ChatWorkflowContextItem[],
  activeContextType?: string | null,
  locale: ModelLocale = getModelLocale(),
): string | null {
  const includedWorkflows =
    workflows
      ?.filter((workflow) => workflow.included)
      .slice(0, MAX_SELECTED_WORKFLOW_GUIDES) ?? []
  const included = SkillRouter.filterActiveSkills(
    skills,
    includedWorkflows,
    activeContextType,
  )

  const sections: string[] = []
  if (included.length > 0) {
    sections.push(
      [
        '# Selected Verbex Skills',
        'Follow each skill below as the operating instructions for this conversation.',
        ...included.map((skill) => {
          const instructions = skill.instructions?.trim()
          const body = instructions ? instructions : skill.overview
          const toolScope = allowedToolsDirective(skill.allowedTools, locale)
          const heading = `## ${skill.name}${skill.path ? `\n${L({ ko: '파일', en: 'File' }, locale)}: ${skill.path}` : ''}`
          return toolScope
            ? `${heading}\n${body}\n\n${toolScope}`
            : `${heading}\n${body}`
        }),
      ].join('\n\n'),
    )
  }
  if (includedWorkflows.length > 0) {
    sections.push(
      [
        '# Selected Verbex Workflow Guides',
        'Follow these workflow guides together with the current step supplied by Verbex. Verbex manages step progression and completion; the full guide does not authorize skipping steps or starting a second workflow run.',
        ...includedWorkflows.map(
          (workflow) =>
            `## ${workflow.name} (id: ${workflow.id})\n${workflow.guide ?? workflow.overview}`,
        ),
      ].join('\n\n'),
    )
  }
  return sections.length > 0 ? sections.join('\n\n---\n\n') : null
}
