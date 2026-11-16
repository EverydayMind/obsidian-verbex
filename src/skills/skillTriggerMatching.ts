export type TriggerMatchableSkill = {
  name: string
  trigger_keywords?: string[]
}

/**
 * Deterministic skill routing by `trigger_keywords`.
 *
 * Unlike the LLM-based skill selector (PromptGenerator.buildSelection),
 * this needs no model round trip, so small / local models get reliable skill
 * activation: the keywords an author declared in a skill's frontmatter activate
 * that skill whenever they appear in the user's request, regardless of whether
 * a (possibly small and unreliable) selector model happens to pick it.
 *
 * Returns the names of skills whose declared trigger keywords appear in the
 * query, in skill order, de-duplicated.
 *
 * Matching rules:
 *  - case-insensitive.
 *  - ASCII word keywords match on word boundaries, so "report" does not fire on
 *    "reporter" or "teleportation".
 *  - CJK / other non-ASCII keywords match as plain substrings, because Korean
 *    attaches particles directly to nouns ("보고서를", "보고서의") and has no
 *    whitespace word boundaries.
 *  - A keyword may combine terms: `&` separates terms that must ALL appear and
 *    `|` separates alternatives within a term, e.g. `hwpx|hwp & 서식|문체 & 참고`.
 *    This keeps a style-reuse request ("hwpx의 서식을 참고해") routable without
 *    a bare "서식" firing on every formatting edit.
 *  - A term beginning with `!` excludes any of its `|` alternatives. At least
 *    one positive term is required.
 */
export function matchSkillsByTriggers(
  query: string,
  skills: readonly TriggerMatchableSkill[],
): string[] {
  const normalizedQuery = query.toLowerCase()
  if (!normalizedQuery.trim()) return []

  const matched = new Set<string>()
  for (const skill of skills) {
    const keywords = skill.trigger_keywords ?? []
    const hit = keywords.some((keyword) =>
      keywordMatches(normalizedQuery, keyword),
    )
    if (hit) matched.add(skill.name)
  }
  return [...matched]
}

function keywordMatches(normalizedQuery: string, rawKeyword: string): boolean {
  if (!/[&|]/.test(rawKeyword) && !rawKeyword.trim().startsWith('!'))
    return termMatches(normalizedQuery, rawKeyword)
  const terms = rawKeyword.split('&').map((term) => {
    const trimmed = term.trim()
    const excluded = trimmed.startsWith('!')
    const options = (excluded ? trimmed.slice(1) : trimmed)
      .split('|')
      .filter((option) => option.trim())
    return { excluded, options }
  })
  if (
    terms.some(({ options }) => options.length === 0) ||
    !terms.some(({ excluded }) => !excluded)
  )
    return false
  return terms.every(({ excluded, options }) => {
    const matches = options.some((option) =>
      termMatches(normalizedQuery, option),
    )
    return excluded ? !matches : matches
  })
}

function termMatches(normalizedQuery: string, rawKeyword: string): boolean {
  const keyword = rawKeyword.trim().toLowerCase()
  if (!keyword) return false
  if (isAsciiWordKeyword(keyword)) {
    const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`)
    return pattern.test(normalizedQuery)
  }
  return normalizedQuery.includes(keyword)
}

/**
 * True when the keyword is pure ASCII and starts/ends with a word character, so
 * `\b` boundaries are meaningful. Keywords with non-ASCII (e.g. Korean) or
 * leading/trailing punctuation fall back to substring matching.
 */
function isAsciiWordKeyword(keyword: string): boolean {
  // eslint-disable-next-line no-control-regex -- Detect ASCII keywords including control code points
  return /^[\x00-\x7f]+$/.test(keyword) && /^\w[\s\S]*\w$|^\w$/.test(keyword)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
