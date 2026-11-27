import { useApp } from '../../contexts/app-context'
import { t } from '../../i18n'
import { pluginIsEnabled } from '../../provider/interop/discovery'
import { pluginDisplayName } from '../../provider/interop/pluginDisplayName'
import {
  skillAvailability,
  skillUnusableLabel,
} from '../../skills/skillAvailability'
import { ChatSkillContextItem } from '../../types/chat'
import type { SkillUnusable } from '../../verbex/types'

export function useSkillUnavailableReason(skill: {
  requiredPlugins?: string[]
  missing?: boolean
  unusable?: SkillUnusable
}) {
  const app = useApp()
  const availability = skillAvailability(skill, (id) =>
    pluginIsEnabled(app, id),
  )
  if (skill.missing) return t('ui.SkillAvailability.skillNoLongerAvailable')
  if (skill.unusable) return skillUnusableLabel(skill.unusable)
  return availability.available
    ? null
    : t('ui.SkillAvailability.requiredPluginsAreDisabled', {
        p0: availability.missingPlugins
          .map((id) => pluginDisplayName(app, id))
          .join(', '),
      })
}

export function SkillCheckbox({
  skill,
  onToggle,
}: {
  skill: ChatSkillContextItem
  onToggle?: (id: string) => void
}) {
  const app = useApp()
  const reason = useSkillUnavailableReason(skill)
  return (
    <>
      <input
        type="checkbox"
        checked={skill.included}
        disabled={!!reason}
        aria-disabled={!!reason}
        onChange={() => {
          if (
            !reason &&
            skillAvailability(skill, (id) => pluginIsEnabled(app, id)).available
          )
            onToggle?.(skill.id)
        }}
      />
      <span>
        {skill.name}
        {reason && ` (${reason})`}
      </span>
    </>
  )
}

export function SelectedSkillBadge({ skill }: { skill: ChatSkillContextItem }) {
  const reason = useSkillUnavailableReason(skill)
  return (
    <span className="verbex-skill-badge">
      {skill.name}
      {reason && ` (${reason})`}
    </span>
  )
}
