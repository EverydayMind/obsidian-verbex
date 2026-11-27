import type { ReactNode } from 'react'

import { t } from '../../i18n'
import type { ChatSkillContextItem } from '../../types/chat'

import { groupSkillsForPicker } from './skillPickerGroups'

/** Skills split into a vault group and one group per providing plugin. */
export function SkillGroupList({
  skills,
  render,
}: {
  skills: readonly ChatSkillContextItem[]
  render: (skill: ChatSkillContextItem) => ReactNode
}) {
  const groups = groupSkillsForPicker(skills, t('ui.pluginSkills.vaultGroup'))
  return (
    <>
      {groups.map((group) =>
        group.label === null ? (
          group.skills.map(render)
        ) : (
          <div key={group.key} className="verbex-skill-picker-subgroup">
            <div className="verbex-skill-picker-subheading">{group.label}</div>
            {group.skills.map(render)}
          </div>
        ),
      )}
    </>
  )
}
