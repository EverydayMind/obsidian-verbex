/** A sample prefix that the Exporter can match as a literal prefix rule. */
export function prefixMarkerFor(token: string): string | null {
  if (/^\d+[.)]?$/.test(token)) return null
  return /^[\p{P}\p{S}\p{Script=Hangul}]{1,16}$/u.test(token) &&
    !/[&<{}:]/.test(token)
    ? token
    : null
}
