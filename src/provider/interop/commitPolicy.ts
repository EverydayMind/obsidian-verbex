import { browserToolAvailable } from './browserProtocol'
import type { NativeHostOptions } from './hostOptions'
import type { ToolDescriptor } from './protocol'
import type { CommitGrant } from './providerSettingsSchema'

/** User-authorized release, 2026-10-25; exact per-provider/tool grants still apply. */
export const SCOPED_COMMIT_RELEASED = true
export type CommitPolicy = {
  revision: number
  released: boolean
  grants: readonly CommitGrant[]
}
type Found = { digest: string; handle: { pluginId: string } }
export function commitAllowed(
  options: Pick<NativeHostOptions, 'commitPolicy' | 'commitEffects'>,
  found: Found,
  tool: ToolDescriptor,
  revision?: number,
): boolean {
  if (tool.effect !== 'commit') return false
  if (!options.commitPolicy) return options.commitEffects === true
  const policy = options.commitPolicy()
  return (
    Number.isSafeInteger(policy.revision) &&
    policy.revision >= 0 &&
    (revision === undefined || revision === policy.revision) &&
    policy.released &&
    policy.grants.some(
      (grant) =>
        grant.providerId === found.handle.pluginId &&
        grant.descriptorDigest === found.digest &&
        grant.toolNames.includes(tool.name),
    )
  )
}
export function nativeEffectAvailable(
  tool: ToolDescriptor,
  options: {
    browserEffects?: boolean
    sessionEffects?: boolean
    commitEffects?: boolean
    commitPolicy?: CommitPolicy
  },
  found: Found,
): boolean {
  if (!browserToolAvailable(tool, options.browserEffects)) return false
  if (tool.effect === 'session') return options.sessionEffects === true
  return (
    tool.effect !== 'commit' ||
    commitAllowed(
      {
        commitEffects: options.commitEffects,
        ...(options.commitPolicy
          ? { commitPolicy: () => options.commitPolicy! }
          : {}),
      },
      found,
      tool,
    )
  )
}
export function commitPolicyIdentity(
  tool: ToolDescriptor,
  policy?: CommitPolicy,
): string[] {
  return tool.effect === 'commit' && policy
    ? [`commit-policy-${policy.revision}`]
    : []
}

/** Observe every saved settings transition, including off→on between calls. */
export class CommitPolicyTracker {
  private revision = 0
  private previous = ''
  observe(grants: readonly CommitGrant[]): void {
    const value = JSON.stringify(grants)
    if (value !== this.previous) {
      this.previous = value
      this.revision++
    }
  }
  read(grants: readonly CommitGrant[]): CommitPolicy {
    this.observe(grants)
    return { revision: this.revision, released: SCOPED_COMMIT_RELEASED, grants }
  }
}
