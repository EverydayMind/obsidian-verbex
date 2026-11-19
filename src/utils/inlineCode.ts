/** Wrap text in a Markdown code span so `_`/`*` in paths and tool names render literally. */
export function inlineCode(text: string): string {
  const fence = '`'.repeat(
    Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length)) +
      1,
  )
  return text.includes('`')
    ? `${fence} ${text} ${fence}`
    : `${fence}${text}${fence}`
}
