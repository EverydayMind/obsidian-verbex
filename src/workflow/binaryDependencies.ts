import { normalizePath } from 'obsidian'

import type { ChangeApproval, ProposedChange } from '../verbex/types'

import type { ChangeApplier } from './changeApplier'
import { rejectedApproval } from './changeSet'

export function validateBatchApproval(
  change: ProposedChange,
  approval: ChangeApproval | null,
  duplicates: ReadonlySet<string>,
): ChangeApproval | null {
  if (!approval) return null
  if (approval.changeId !== change.id || duplicates.has(change.id))
    return rejectedApproval(change, 'Approval does not match this change.')
  if (requiresWholeRejection(change, approval))
    return rejectedApproval(
      change,
      'Whole-change approval required; partial approval rejected.',
    )
  return approval
}

export function validateBinaryDependencies(change: ProposedChange): void {
  const dependencies = change.binarySourceDependencies ?? []
  if (dependencies.length > 32) throw new Error('Too many binary dependencies.')
  const paths = new Map<string, string>()
  for (const dependency of dependencies) {
    if (!dependency.path || !/^[0-9a-f]{64}$/.test(dependency.sha256Before))
      throw new Error('Invalid binary dependency.')
    const path = normalizePath(dependency.path)
    if (paths.has(path) && paths.get(path) !== dependency.sha256Before)
      throw new Error('Conflicting binary dependency hashes for the same path.')
    paths.set(path, dependency.sha256Before)
  }
}

export async function binaryDependencyConflict(
  change: ProposedChange,
  applier: ChangeApplier,
  mutationPaths?: ReadonlySet<string>,
): Promise<string | null> {
  try {
    validateBinaryDependencies(change)
    const budget = { remainingBytes: 128 * 1024 * 1024 }
    const seen = new Set<string>()
    for (const dependency of change.binarySourceDependencies ?? []) {
      const path = normalizePath(dependency.path)
      if (mutationPaths?.has(path))
        return `Batch binary dependency overlaps a mutated path: "${path}".`
      if (seen.has(path)) continue
      seen.add(path)
      if (
        !applier.readByteHash ||
        (await applier.readByteHash(path, budget)) !== dependency.sha256Before
      )
        return `Conflict: binary source "${path}" changed, was removed, or could not be verified.`
    }
    return null
  } catch (error) {
    return `Conflict: ${error instanceof Error ? error.message : 'Binary source read failed.'}`
  }
}

export function requiresWholeRejection(
  change: ProposedChange,
  approval: { status: string; rejectedHunks: number[] },
): boolean {
  return (
    change.approvalMode === 'whole_change' &&
    (approval.status === 'partial_approved' ||
      approval.rejectedHunks.length > 0)
  )
}
