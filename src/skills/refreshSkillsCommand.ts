import { Notice } from 'obsidian'

import { t } from '../i18n'
import {
  type SubmissionSkillCatalog,
  type SubmissionSkillHost,
  refreshSkillsForSubmission,
} from '../utils/chat/submissionSkills'

/**
 * Command palette command "Refresh Skill list": one fresh provider discovery,
 * then the Skill list is rebuilt (remembered body failures are forgotten).
 */
export function refreshSkillsCommand(plugin: {
  nativeProviderHost: SubmissionSkillHost
  verbexController: { catalogService: SubmissionSkillCatalog }
}) {
  return {
    id: 'refresh-skills',
    name: t('ui.pluginSkills.refreshCommand'),
    callback: async () => {
      const facts = await refreshSkillsForSubmission(
        plugin.nativeProviderHost,
        plugin.verbexController.catalogService,
      )
      new Notice(
        facts.length > 0
          ? t('ui.pluginSkills.refreshFailed')
          : t('ui.pluginSkills.refreshed'),
      )
    },
  }
}
