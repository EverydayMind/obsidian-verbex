export type EmphasisCharacter = { text: string; bold: boolean; italic: boolean }
/** Decide escapes on the entire literal text, before inserting emphasis. */
export function escapeCharacters(text: string, heading = false): string[] {
  const chars = [...text]
  const front = /^[ \t\u00a0\u3000]*/.exec(text)?.[0].length ?? 0
  const start = [...text.slice(0, front)].length
  const ordered = /^\d+([.)])(?=\s|$)/.exec(text.slice(front))
  const punctuation = ordered ? start + ordered[0].length - 1 : -1
  const closing = heading ? /\s(#+)$/.exec(text) : null
  const tail = closing ? chars.length - closing[1].length : chars.length
  let offset = 0
  return chars.map((ch, i) => {
    offset += ch.length
    const rest = text.slice(offset)
    const escape =
      '\\*_`[]'.includes(ch) ||
      (ch === '<' && /^[A-Za-z/!?]/.test(rest)) ||
      (ch === '&' &&
        /^(?:[A-Za-z][A-Za-z0-9]*|#\d+|#[xX][0-9A-Fa-f]+);/.test(rest)) ||
      (ch === '!' && rest.startsWith('[')) ||
      (!heading &&
        ((i === start && /[#>+\-=]/.test(ch)) || i === punctuation)) ||
      (heading && i >= tail && ch === '#')
    return (escape ? '\\' : '') + ch
  })
}
/** Keep contiguous bold spans open even when italic changes inside them. */
export function emphasize(
  source: EmphasisCharacter[],
  heading = false,
): string {
  const chars = source.map((c) => ({ ...c }))
  for (const flag of ['bold', 'italic'] as const) {
    if (chars.filter((c) => c.text.trim()).every((c) => c[flag]))
      for (const c of chars) c[flag] = false
    for (let i = 0; i < chars.length; ) {
      if (!chars[i][flag]) {
        i++
        continue
      }
      let end = i
      while (end < chars.length && chars[end][flag]) end++
      let start = i,
        tail = end - 1
      while (start < end && !chars[start].text.trim())
        chars[start++][flag] = false
      while (tail >= start && !chars[tail].text.trim())
        chars[tail--][flag] = false
      i = end
    }
  }
  const escaped = escapeCharacters(chars.map((c) => c.text).join(''), heading)
  const groups: EmphasisCharacter[] = []
  for (const [i, raw] of chars.entries()) {
    const c = { ...raw, text: escaped[i] }
    const last = groups[groups.length - 1]
    if (last && last.bold === c.bold && last.italic === c.italic)
      last.text += c.text
    else groups.push({ ...c })
  }
  let stack: string[] = [],
    result = ''
  for (const g of [...groups, { text: '', bold: false, italic: false }]) {
    const target = [...(g.bold ? ['**'] : []), ...(g.italic ? ['*'] : [])]
    let common = 0
    while (common < stack.length && stack[common] === target[common]) common++
    result +=
      stack.slice(common).reverse().join('') +
      target.slice(common).join('') +
      g.text
    stack = target
  }
  return result
}
