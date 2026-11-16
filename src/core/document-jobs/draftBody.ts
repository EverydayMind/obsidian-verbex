import { draftBodyMessage } from './draftBodyMessage'

export const MIN_DRAFT_BODY_CODE_POINTS = 200

/** Mechanical file-content invariant; does not assess the quality of prose. */
export function inspectDraftBody(text: string): {
  reason: 'no_body' | 'placeholder_only' | 'below_minimum' | null
  bodyCodePoints: number
} {
  const body = text
    .replace(
      /^\uFEFF?---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/,
      '',
    )
    .replace(/<!--[\s\S]*?-->/g, '')
  const lines = body.split(/\r?\n/).map((line) => line.trim())
  const content = lines
    .map((line) =>
      line
        .replace(/^#{1,6}(?=[ \t]|$)/, '')
        .replace(/[ \t]+#+$/, '')
        .trimStart()
        .replace(/^(?:[-*+]|\d+[.)]|[□ㅇ※])[ \t]+/, '')
        .trim(),
    )
    .filter(Boolean)
  const actual = content.filter((line) => {
    let value = line
    for (;;) {
      const match = /^(\*\*|__|\*|_)([\s\S]*)\1$/.exec(value)
      if (!match) break
      value = match[2]
    }
    return !/^(?:\[[^\r\n]*\]|\([^\r\n]*\)|（[^\r\n]*）|『[^\r\n]*』|【[^\r\n]*】)$/.test(
      value,
    )
  })
  const bodyCodePoints = actual.reduce((sum, line) => sum + [...line].length, 0)
  if (!content.length) return { reason: 'no_body', bodyCodePoints }
  if (!actual.length) return { reason: 'placeholder_only', bodyCodePoints }
  if (bodyCodePoints < MIN_DRAFT_BODY_CODE_POINTS)
    return { reason: 'below_minimum', bodyCodePoints }
  return { reason: null, bodyCodePoints }
}

export function emptyDraftFact(path: string, bytes: ArrayBuffer) {
  const body = inspectDraftBody(new TextDecoder().decode(bytes))
  return body.reason
    ? {
        state: 'draft_empty',
        draft_path: path,
        reason: body.reason,
        bodyCodePoints: body.bodyCodePoints,
        message: draftBodyMessage(body.reason, body.bodyCodePoints),
      }
    : null
}
