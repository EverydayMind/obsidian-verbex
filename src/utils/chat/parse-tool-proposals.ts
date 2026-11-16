export type ToolProposal = {
  name: string
  arguments: Record<string, unknown>
}

/** Extract display-only proposals. Recognition never starts a tool call. */
export function parseToolProposals(
  content: string,
  registeredNames: ReadonlySet<string>,
): ToolProposal[] {
  const blocks = Array.from(
    content.matchAll(/```json\s*\r?\n([\s\S]*?)\r?\n```/gi),
    (match) => match[1],
  )
  if (blocks.length === 0) blocks.push(content.trim())
  const proposals: ToolProposal[] = []
  for (const block of blocks) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block)
    } catch {
      continue
    }
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const record = item as Record<string, unknown>
      const name = record.tool ?? record.name
      const args = record.arguments ?? record.args ?? record.parameters
      if (
        typeof name === 'string' &&
        registeredNames.has(name) &&
        args !== null &&
        typeof args === 'object' &&
        !Array.isArray(args)
      )
        proposals.push({ name, arguments: args as Record<string, unknown> })
    }
  }
  return proposals
}
