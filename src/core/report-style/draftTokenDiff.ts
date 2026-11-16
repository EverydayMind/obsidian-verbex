/** Selected token comparison. This cannot establish preservation of meaning. */
const pattern = new RegExp(
  String.raw`(?<quote>"[^"\r\n]*"|'[^'\r\n]*'|“[^”\r\n]*”|‘[^’\r\n]*’|「[^」\r\n]*」|『[^』\r\n]*』)|(?<date>(?<![A-Za-z0-9_])\d{4}\s*(?:[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}|년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)(?!\d))|(?<money>(?:[$₩€£]\s*-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:원|달러|유로)))(?![A-Za-z0-9_])|(?<percent>-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*%)(?![A-Za-z0-9_])|(?<number>(?<![A-Za-z0-9_])-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![A-Za-z0-9_]))|(?<abbreviation>(?<![A-Za-z0-9_])[A-Z]{2,}(?![A-Za-z0-9_]))`,
  'gu',
)
const insideQuotePattern = new RegExp(
  pattern.source.slice(pattern.source.indexOf('(?<date>')),
  'gu',
)
const maximumOccurrences = 200000
const maximumDistinct = 100000
const maximumTokenLength = 8192
const maximumLines = 250000
const compareVersion = 'selected-token-diff/0.1'
type Kind = 'quote' | 'date' | 'money' | 'percent' | 'number' | 'abbreviation'
type Token = { kind: Kind; value: string; count: number; firstLine: number }

function normalize(kind: Kind, token: string) {
  if (kind === 'quote') return token
  if (kind === 'date') {
    const parts = token.match(/\d+/g)
    if (parts?.length === 3)
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  }
  return token.replace(/,/g, '').replace(/\s+/g, '')
}

function extract(text: string): Map<string, Token> | null {
  const result = new Map<string, Token>()
  let occurrences = 0
  // NFKC makes full-width digits and separators comparable. This operates on
  // bound source bytes and never attempts to align tokens with rendered blocks.
  const lines = text.normalize('NFKC').matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)
  const add = (match: RegExpMatchArray, line: number): boolean => {
    if (
      ++occurrences > maximumOccurrences ||
      match[0].length > maximumTokenLength
    )
      return false
    const kind = Object.keys(match.groups ?? {}).find(
      (key) => match.groups?.[key] !== undefined,
    ) as Kind | undefined
    if (!kind) throw new Error('Unclassified selected token.')
    const value = normalize(kind, match[0]),
      key = `${kind}:${value}`
    const existing = result.get(key)
    if (existing) existing.count++
    else {
      if (result.size >= maximumDistinct) return false
      result.set(key, { kind, value, count: 1, firstLine: line })
    }
    return true
  }
  let lineNumber = 0
  for (const lineMatch of lines) {
    if (++lineNumber > maximumLines) return null
    const line = lineMatch[0].replace(/(?:\r\n|\r|\n)$/, '')
    pattern.lastIndex = 0
    for (const match of line.matchAll(pattern)) {
      if (!add(match, lineNumber)) return null
      if (match.groups?.quote !== undefined) {
        insideQuotePattern.lastIndex = 0
        for (const nested of match[0].matchAll(insideQuotePattern))
          if (!add(nested, lineNumber)) return null
      }
    }
  }
  return result
}

export function selectedTokenDiff(baseline: string, draft: string) {
  const oldTokens = extract(baseline),
    newTokens = extract(draft)
  if (!oldTokens || !newTokens)
    return {
      state: 'unavailable' as const,
      reason: 'token_budget' as const,
      version: compareVersion,
    }
  const facts = []
  for (const key of new Set([...oldTokens.keys(), ...newTokens.keys()])) {
    const oldToken = oldTokens.get(key),
      newToken = newTokens.get(key)
    if ((oldToken?.count ?? 0) === (newToken?.count ?? 0)) continue
    const token = oldToken ?? newToken
    if (!token) throw new Error('Missing selected token.')
    const points = Array.from(token.value)
    facts.push({
      kind: 'token_diff' as const,
      tokenType: token.kind,
      token: points.slice(0, 64).join(''),
      tokenTruncated: points.length > 64,
      baselineCount: oldToken?.count ?? 0,
      draftCount: newToken?.count ?? 0,
      baselineFirstLine: oldToken?.firstLine ?? null,
      draftFirstLine: newToken?.firstLine ?? null,
    })
  }
  return {
    state: 'available' as const,
    version: compareVersion,
    basis: 'whole_note_text' as const,
    limitation: 'selected_tokens_do_not_prove_semantic_preservation' as const,
    facts,
  }
}
