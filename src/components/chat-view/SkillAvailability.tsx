import { useApp } from '../../contexts/app-context'
import { t } from '../../i18n'
import { pluginIsEnabled } from '../../provider/interop/discovery'
import { skillAvailability } from '../../skills/skillAvailability'
import { ChatSkillContextItem } from '../../types/chat'

export function useSkillUnavailableReason(skill: {
  requiredPlugins?: string[]
}) {
  const app = useApp()
  const availability = skillAvailability(skill, (id) =>
    pluginIsEnabled(app, id),
  )
  return availability.available
    ? null
    : t('ui.SkillAvailability.requiredPluginsAreDisabled', {
        p0: availability.missingPlugins.join(', '),
      })
}

export function SkillCheckbox({
  skill,
  onToggle,
}: {
  skill: ChatSkillContextItem
  onToggle?: (name: string) => void
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
            skillAvailability(skill, (id) => pluginIsEnabled(app, id)).available
          )
            onToggle?.(skill.name)
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
