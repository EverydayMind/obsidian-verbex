/**
 * Slice packing (batch runner design §3.6).
 *
 * Boundary detection (what an atom is) and size decision (how many atoms one
 * model call reviews) are separate concerns. Atoms stay the ledger's unit of
 * truth; a pack is a non-authoritative execution plan whose only persistent
 * trace is a manifest record kept for reproduction and failure analysis.
 */

export type BatchPackBoundary =
  | 'chapter'
  | 'parent_heading'
  | 'source_file'
  | 'none'

export type BatchPackPolicy = {
  version: 1
  mode: 'adjacent'
  boundary: BatchPackBoundary
  fillRatio: number
  maxAtomsPerSlice: number
}

export type PackCandidateMember = {
  id: string
  /** Atoms may only be packed with neighbours sharing this key (§3.6-7). */
  boundaryKey: string
  /** Token estimate of this member's rendered block (wrapper + evidence body). */
  tokens: number
}

export type PlannedPack = {
  memberIds: string[]
  /** Estimated rendered tokens including the base overhead. */
  tokens: number
}

/**
 * Non-authoritative execution history (§3.6-1). Never used for state
 * decisions — the atomic ledger remains the single source of truth.
 */
export type BatchPackRecord = {
  packId: string
  memberIds: string[]
  memberHashes: Record<string, string>
  compositeHash: string
  policy: BatchPackPolicy
  modelId?: string
  promptTokens?: number
  attempts: number
  outcome: 'committed' | 'partial' | 'atomized' | 'aborted'
  failure?: {
    kind:
      | 'truncation'
      | 'parse'
      | 'unattributable'
      | 'member_errors'
      | 'hash_mismatch'
      | 'transport'
    detail?: string
  }
  completedAt: string
}

export const DEFAULT_MAX_ATOMS_PER_SLICE = 6

/**
 * Greedy adjacent packing. The arithmetic caps here are pre-checks; the caller
 * must still gate the final rendered prompt with a token estimate before the
 * completion call (§3.6-2) because packet size varies per member set.
 */
export function planBatchPacks(input: {
  members: PackCandidateMember[]
  /** Target for base overhead + member blocks (computePackInputTarget). */
  inputTarget: number
  /** Static prefix + context-packet reserve + correction/framing margin. */
  baseOverheadTokens: number
  maxAtomsPerSlice?: number
  /** Output-side packing condition (§3.6-3). */
  estimateOutputTokens: (memberCount: number) => number
  outputBudget: number
}): PlannedPack[] {
  const maxAtoms = Math.max(
    1,
    input.maxAtomsPerSlice ?? DEFAULT_MAX_ATOMS_PER_SLICE,
  )
  const packs: PlannedPack[] = []
  let current: PackCandidateMember[] = []
  let currentTokens = input.baseOverheadTokens

  const close = () => {
    if (current.length === 0) return
    packs.push({
      memberIds: current.map((member) => member.id),
      tokens: currentTokens,
    })
    current = []
    currentTokens = input.baseOverheadTokens
  }

  for (const member of input.members) {
    const fitsBoundary =
      current.length === 0 || current[0].boundaryKey === member.boundaryKey
    const fitsCount = current.length < maxAtoms
    const fitsInput = currentTokens + member.tokens <= input.inputTarget
    const fitsOutput =
      input.estimateOutputTokens(current.length + 1) <= input.outputBudget
    if (
      current.length > 0 &&
      !(fitsBoundary && fitsCount && fitsInput && fitsOutput)
    ) {
      close()
    }
    current.push(member)
    currentTokens += member.tokens
  }
  close()
  return packs
}

/**
 * Boundary key for treaty checklist atoms (`R:<orderKey>`): the chapter part of
 * the order key. Chapter heads (`NN-00`) join their own chapter, the preamble
 * (`00-00`) stays alone in group `00`, annexes group per annex (`A...`).
 */
export function packBoundaryKey(entryId: string): string {
  const orderKey = entryId.includes(':')
    ? entryId.slice(entryId.indexOf(':') + 1)
    : entryId
  return orderKey.split('-', 1)[0]
}

/** @deprecated Use packBoundaryKey. */
export const treatyPackBoundaryKey = packBoundaryKey
