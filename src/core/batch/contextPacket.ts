import { estimateTokens } from '../../utils/llm/estimateTokens'

export type ContextPacketBlock = {
  /** Stable dependency identity (usually a source path or atom stable ID). */
  id: string
  text: string
  /** Lower values are retained first. */
  priority?: number
}

export type ContextPacket = {
  text: string
  packetDeps: string[]
  estimatedTokens: number
  droppedBlocks: number
}

/** Merge, de-duplicate, and token-bound optional context packet blocks. */
export function buildContextPacket(input: {
  memberBlocks: ContextPacketBlock[][]
  neighborBlocks?: ContextPacketBlock[]
  tokenBudget: number
}): ContextPacket {
  const seen = new Set<string>()
  const blocks = [...input.memberBlocks.flat(), ...(input.neighborBlocks ?? [])]
    .filter((block) => {
      const key = `${block.id}\u0000${block.text}`
      if (seen.has(key)) return false
      seen.add(key)
      return Boolean(block.text.trim())
    })
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

  const kept: ContextPacketBlock[] = []
  let tokens = 0
  for (const block of blocks) {
    const blockTokens = estimateTokens(block.text)
    if (tokens + blockTokens > Math.max(0, input.tokenBudget)) continue
    kept.push(block)
    tokens += blockTokens
  }
  return {
    text: kept.map((block) => block.text).join('\n\n'),
    packetDeps: [...new Set(kept.map((block) => block.id))],
    estimatedTokens: tokens,
    droppedBlocks: blocks.length - kept.length,
  }
}
