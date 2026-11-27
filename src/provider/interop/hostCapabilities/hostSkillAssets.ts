import type { Discovered } from '../hostScanTypes'

import { type NameOf, inactiveProviderSkills } from './inactiveProviderSkills'
import {
  type PluginSkillRecord,
  type ProviderSkillState,
  providerSkills,
} from './providerSkillSource'
import {
  type ReadAssetOutcome,
  type SkillAssetReason,
  readSkillBody,
} from './readAsset'
import { SkillFaultStore } from './skillFaultStore'

export type SkillAssetPorts = ProviderSkillState & {
  /** The provider is the current, approved and active instance. */
  current: (found: Discovered) => boolean
  readTimeoutMs?: number
}

/**
 * Plugin-provided Skills of the discovered providers: the listing of active
 * providers and the lazy, verified body read. A failed body marks that one
 * Skill only; nothing here touches the provider's runtime fault state, its
 * busy lock, or its tools.
 */
export class HostSkillAssets {
  /** Verified bodies, per provider instance: (generation, id, locale, hash). */
  private readonly bodies = new WeakMap<object, Map<string, string>>()
  private readonly faults = new SkillFaultStore()

  /** `ports` is read on every call: the host replaces its maps on each scan. */
  constructor(private readonly ports: () => SkillAssetPorts) {}

  list(locale: 'ko' | 'en', nameOf: NameOf): PluginSkillRecord[] {
    return providerSkills(this.ports(), locale, nameOf)
  }

  /** Skills of providers that are not active, each with the reason why. */
  listInactive(locale: 'ko' | 'en', nameOf: NameOf): PluginSkillRecord[] {
    return inactiveProviderSkills(this.ports(), locale, nameOf)
  }

  /** Why the last read of this Skill failed, if it did. */
  faultOf(canonicalId: string): SkillAssetReason | undefined {
    const found = this.foundOf(canonicalId)
    return found
      ? this.faults.get(found.handle.provider, canonicalId)
      : undefined
  }

  clearFaults(): void {
    this.faults.clear()
  }

  async read(
    canonicalId: string,
    locale: 'ko' | 'en',
    signal?: AbortSignal,
  ): Promise<ReadAssetOutcome> {
    const ports = this.ports()
    const found = this.foundOf(canonicalId)
    const skillId = canonicalId.slice(canonicalId.indexOf(':') + 1)
    const entry = found?.assets?.skills.find(
      (item) => item.id === skillId && item.locale === locale,
    )
    const members = found?.hostMembers
    if (!found || !entry || !members?.readAsset || !ports.current(found))
      return this.fail(found, canonicalId, 'not_current')
    const provider = found.handle.provider
    const key = `${found.generation}\u0000${entry.id}\u0000${locale}\u0000${entry.bodySha256}`
    const cached = this.bodies.get(provider)?.get(key)
    if (cached !== undefined) return { ok: true, body: cached }
    const outcome = await readSkillBody({
      receiver: members.receiver,
      request: { kind: 'skill', id: entry.id, locale },
      declared: { bodySha256: entry.bodySha256, bodyTokens: entry.bodyTokens },
      stillCurrent: () => ports.current(found),
      timeoutMs: ports.readTimeoutMs,
      signal,
    })
    if (!outcome.ok) return this.fail(found, canonicalId, outcome.reason)
    let store = this.bodies.get(provider)
    if (!store) {
      store = new Map<string, string>()
      this.bodies.set(provider, store)
    }
    store.set(key, outcome.body)
    this.faults.delete(provider, canonicalId)
    return outcome
  }

  private foundOf(canonicalId: string): Discovered | undefined {
    const cut = canonicalId.indexOf(':')
    return cut > 0
      ? this.ports().discovered.get(canonicalId.slice(0, cut))
      : undefined
  }

  private fail(
    found: Discovered | undefined,
    canonicalId: string,
    reason: SkillAssetReason,
  ): ReadAssetOutcome {
    if (found) this.faults.set(found.handle.provider, canonicalId, reason)
    return { ok: false, reason }
  }
}
