/**
 * Protocol-shaped signs that a model wrote a tool call as answer text instead
 * of emitting one (DECISIONS §4, A1). Only the shape is inspected: leaked
 * call tokens, or a line that IS `tool_name{…}` / `tool_name(…)`. What the
 * prose says is never read, and nothing here parses or runs the call.
 */
// A sentence may mention these; only a line that starts with one is a leak.
const LINE_START_TOKENS = ['<|tool_call', '<tool_call>', '[TOOL_CALLS]']
// Never occurs in ordinary prose, so it counts anywhere outside code.
const QUOTE_TOKEN = '<|"|>'
const CLOSER: Record<string, string> = { '{': '}', '(': ')' }
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/
// CommonMark indented code: four columns of indentation, or a tab.
const INDENTED_CODE_RE = /^(?: {4}| {0,3}\t)/

/**
 * Removes inline code spans (a backtick run closed by a run of the same
 * length). A run left without a partner hides the rest of the line: the
 * writer opened code there and did not close it.
 */
function withoutInlineCode(line: string): string {
  const runs = [...line.matchAll(/`+/g)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }))
  let kept = ''
  let cursor = 0
  let unmatched = -1
  for (let i = 0; i < runs.length; i++) {
    const open = runs[i]
    const width = open.end - open.start
    const close = runs.findIndex(
      (run, index) => index > i && run.end - run.start === width,
    )
    if (close === -1) {
      unmatched = kept.length + (open.start - cursor)
      continue
    }
    kept += line.slice(cursor, open.start)
    cursor = runs[close].end
    i = close
  }
  kept += line.slice(cursor)
  return unmatched === -1 ? kept : kept.slice(0, unmatched)
}

/** Lines outside fenced and indented code, with inline code removed. */
function proseLines(rawText: string): string[] {
  const lines: string[] = []
  let fence: string | null = null
  for (const line of rawText.split(/\r?\n/)) {
    const match = FENCE_RE.exec(line)
    const marker = match?.[1]
    if (fence) {
      // A closing fence carries no info string; "```python" does not close.
      if (
        marker?.startsWith(fence.slice(0, 1)) === true &&
        marker.length >= fence.length &&
        !match?.[2].trim()
      )
        fence = null
      continue
    }
    if (marker) {
      fence = marker
      continue
    }
    if (INDENTED_CODE_RE.test(line)) continue
    lines.push(withoutInlineCode(line))
  }
  return lines
}

function isCallLine(line: string, toolNames: readonly string[]): boolean {
  const trimmed = line.trim()
  const rest = trimmed.startsWith('call:') ? trimmed.slice(5) : trimmed
  return toolNames.some((name) => {
    if (!name || !rest.startsWith(name)) return false
    const closer = CLOSER[rest[name.length]]
    // At least one character between the opener and the closer.
    return !!closer && rest.endsWith(closer) && rest.length > name.length + 2
  })
}

function hasLeakedToken(line: string): boolean {
  const trimmed = line.trim()
  return (
    line.includes(QUOTE_TOKEN) ||
    LINE_START_TOKENS.some((token) => trimmed.startsWith(token))
  )
}

export function hasTextToolCallMarker(
  rawText: string,
  toolNames: readonly string[],
): boolean {
  const lines = proseLines(rawText)
  return (
    lines.some(hasLeakedToken) ||
    lines.some((line) => isCallLine(line, toolNames))
  )
}
