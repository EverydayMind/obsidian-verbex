import { commitAllowed } from './commitPolicy'
import type { HostContext } from './editorActions'
import type { NativeHostOptions } from './hostOptions'

export type DocumentJobReadiness =
  | { state: 'unavailable' }
  | {
      state: 'not_ready'
      cause:
        | 'grant_missing'
        | 'grant_digest_stale'
        | 'tool_disabled'
        | 'commit_disabled'
        | 'policy_changed'
        | 'descriptor_changed'
    }
  | { state: 'ready'; descriptorDigest: string; policyRevision: number }

/** Assess only refreshed host state. The returned binding must be rechecked at commit. */
export function assessDocumentJobReadiness(
  host: HostContext,
  options: NativeHostOptions,
  binding?: { descriptorDigest: string; policyRevision: number },
  toolName: 'export_note' | 'derive_template' = 'export_note',
): DocumentJobReadiness {
  const id = 'md-to-hwpx'
  const found = host.getActiveDiscovered(id)
  if (!found || !host.isCurrent(id)) return { state: 'unavailable' }
  if (binding && found.digest !== binding.descriptorDigest)
    return { state: 'not_ready', cause: 'descriptor_changed' }
  const commit = found.descriptor?.tools.find((tool) => tool.name === toolName)
  const preview = found.descriptor?.tools.find(
    (tool) => tool.name === 'preview_derived_export',
  )
  if (
    !commit ||
    commit.effect !== 'commit' ||
    !preview ||
    preview.effect !== 'read' ||
    !host.isCurrent(id, toolName) ||
    !host.isCurrent(id, 'preview_derived_export')
  )
    return { state: 'not_ready', cause: 'tool_disabled' }
  const runtime = options.commitRuntime
  const capture = options.outputAnchorCapture
  if (
    !options.commitPolicy ||
    !runtime ||
    !capture ||
    runtime.outputAnchors !== capture.accept ||
    runtime.outputAnchorRequested !== capture.requested ||
    runtime.outputAnchorLeaseCurrent !== capture.leaseCurrent ||
    runtime.outputAnchorLeaseLimit !== capture.limitLease
  )
    return { state: 'not_ready', cause: 'commit_disabled' }
  const policy = options.commitPolicy()
  if (
    !policy.released ||
    !Number.isSafeInteger(policy.revision) ||
    policy.revision < 0
  )
    return { state: 'not_ready', cause: 'commit_disabled' }
  if (binding && policy.revision !== binding.policyRevision)
    return { state: 'not_ready', cause: 'policy_changed' }
  if (
    !commitAllowed(
      { commitPolicy: () => policy },
      found,
      commit,
      policy.revision,
    )
  ) {
    const stale = policy.grants.some(
      (grant) =>
        grant.providerId === id &&
        grant.toolNames.includes(commit.name) &&
        grant.descriptorDigest !== found.digest,
    )
    return {
      state: 'not_ready',
      cause: stale ? 'grant_digest_stale' : 'grant_missing',
    }
  }
  return {
    state: 'ready',
    descriptorDigest: found.digest,
    policyRevision: policy.revision,
  }
}
