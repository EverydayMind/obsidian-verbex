import type { SkillAssetReason } from './readAsset'

/**
 * The last body failure per Skill (canonical id), per provider instance. A
 * failure marks that one Skill only and is forgotten on a later success or
 * when the user asks for a fresh Skill list.
 */
export class SkillFaultStore {
  private faults = new WeakMap<object, Map<string, SkillAssetReason>>()

  get(provider: object, id: string): SkillAssetReason | undefined {
    return this.faults.get(provider)?.get(id)
  }

  set(provider: object, id: string, reason: SkillAssetReason): void {
    let store = this.faults.get(provider)
    if (!store) {
      store = new Map<string, SkillAssetReason>()
      this.faults.set(provider, store)
    }
    store.set(id, reason)
  }

  delete(provider: object, id: string): void {
    this.faults.get(provider)?.delete(id)
  }

  clear(): void {
    this.faults = new WeakMap()
  }
}
