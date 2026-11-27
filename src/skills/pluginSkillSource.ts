import type { PluginSkillRecord } from '../provider/interop/hostCapabilities/providerSkillSource'

export type PluginSkillBody =
  | { ok: true; body: string }
  | { ok: false; reason: string }

/** What the catalog needs from the plugin side. */
export type PluginSkillSource = {
  /** Skills of active providers in the model language (no bodies). */
  list(): PluginSkillRecord[]
  /** Verified body of one plugin Skill by canonical id; never throws. */
  readBody(canonicalId: string, signal?: AbortSignal): Promise<PluginSkillBody>
  /** Skills of providers that are not usable yet, each with its reason. */
  listInactive?(): PluginSkillRecord[]
  /** Why the last body read of this Skill failed, if it did. */
  faultOf?(canonicalId: string): string | undefined
  /** Forgets remembered body failures so the next request tries again. */
  clearFaults?(): void
}
