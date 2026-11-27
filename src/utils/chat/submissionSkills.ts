import { t } from '../../i18n'
import { runtimeTimers } from '../../platform/runtime'

import {
  type PluginSkillFailure,
  pluginSkillFailureNotice,
} from './pluginSkillInjection'

/** How long a chat submission waits for plugin discovery before going on. */
export const SUBMISSION_DISCOVERY_TIMEOUT_MS = 5000

export type SubmissionSkillHost = {
  refresh(signal?: AbortSignal, options?: { fresh?: boolean }): Promise<void>
  diagnostics: {
    measure<T>(
      operation: 'discovery.submission',
      fields: { timeoutMs?: number },
      work: () => Promise<T>,
    ): Promise<T>
  }
}

export type SubmissionSkillCatalog = {
  /** Forgets plugin Skill body failures and drops the cached Skill list. */
  clearPluginSkillFaults(): void
  invalidatePluginSkills(): void
}

/**
 * Runs at the start of a chat submission, before any Skill is chosen: waits
 * for one fresh provider discovery, then drops the cached Skill list, so a
 * plugin switched on a moment ago contributes its Skills to this very turn.
 * A discovery that fails or runs out of time never blocks the submission; the
 * request goes on with the vault Skills and one fact line says so.
 * Returns the chat fact lines to show for this turn.
 */
export async function refreshSkillsForSubmission(
  host: SubmissionSkillHost,
  catalog: SubmissionSkillCatalog,
  timeoutMs = SUBMISSION_DISCOVERY_TIMEOUT_MS,
): Promise<string[]> {
  const controller = new AbortController()
  const timer = runtimeTimers.setTimeout(() => controller.abort(), timeoutMs)
  try {
    await host.diagnostics.measure('discovery.submission', { timeoutMs }, () =>
      host.refresh(controller.signal, { fresh: true }),
    )
    return []
  } catch {
    return [t('nativeProviderR10.skillDiscoveryFailed')]
  } finally {
    runtimeTimers.clearTimeout(timer)
    catalog.clearPluginSkillFaults()
  }
}

/**
 * The fact lines for plugin Skills left out of this request (one per Skill).
 * The Skill list is rebuilt so the picker shows each reason.
 */
export function pluginSkillFailureFacts(
  catalog: SubmissionSkillCatalog,
  failures: readonly PluginSkillFailure[],
): string[] {
  if (failures.length > 0) catalog.invalidatePluginSkills()
  return failures.map(pluginSkillFailureNotice)
}
