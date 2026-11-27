import { t } from '../i18n'
import type { SkillUnusable } from '../verbex/types'

const PROVIDER_KEYS = {
  provider_pending: 'nativeProviderR10.skillProviderPending',
  provider_reapproval: 'nativeProviderR10.skillProviderReapproval',
  provider_disabled: 'nativeProviderR10.skillProviderDisabled',
} as const

/** Display text for a listed Skill that cannot be selected (picker, status). */
export function skillUnusableLabel(unusable: SkillUnusable): string {
  switch (unusable.code) {
    case 'legacy_starter_copy':
      return t('nativeProviderR10.skillLegacyCopy')
    case 'shadowed_by_vault':
      return t('nativeProviderR10.skillShadowed')
    case 'missing_host_tools':
      return t('nativeProviderR10.skillMissingHostTools', {
        tools: unusable.detail ?? '',
      })
    case 'body_failed':
      return t('nativeProviderR10.skillBodyUnverified', {
        reason: unusable.detail ?? '',
      })
    default:
      return t(PROVIDER_KEYS[unusable.code])
  }
}
