import { QUOTED_SPAN_RE } from './quotedSpans'

export function namedHwpReference(
  files: {
    path: string
    name?: string
    basename?: string
    extension?: string
  }[],
  request: string,
): string | undefined {
  const text = request
    .replace(
      new RegExp(
        QUOTED_SPAN_RE.source.replace(/\{2,200\}/g, '{1,}'),
        QUOTED_SPAN_RE.flags,
      ),
      (span) => ' '.repeat(span.length),
    )
    .normalize('NFC')
  const matches: { path: string; start: number; end: number }[] = []
  for (const file of files) {
    if (!/\.hwpx?$/i.test(file.path)) continue
    const name = (
      file.basename ??
      (file.name ?? file.path.split('/').pop() ?? '').replace(/\.hwpx?$/i, '')
    ).normalize('NFC')
    if ([...name].length < 4) continue
    let start = text.indexOf(name)
    while (start !== -1) {
      const end = start + name.length
      if (
        !/[\p{L}\p{N}]/u.test(Array.from(text.slice(0, start)).at(-1) ?? '') &&
        !/[a-z0-9]/i.test(text[end] ?? '')
      )
        matches.push({ path: file.path, start, end })
      start = text.indexOf(name, start + 1)
    }
  }
  const remaining = matches.filter(
    (match) =>
      !matches.some(
        (other) =>
          other.start < match.end &&
          other.end > match.start &&
          other.end - other.start > match.end - match.start,
      ),
  )
  const paths = new Set(remaining.map((match) => match.path))
  return paths.size === 1 ? [...paths][0] : undefined
}
