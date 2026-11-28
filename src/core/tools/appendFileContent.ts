export function isPureCrlf(text: string): boolean {
  return text.includes('\r\n') && !text.replace(/\r\n/g, '').includes('\n')
}

export function toCrlf(text: string): string {
  return text.replace(/\r?\n/g, '\r\n')
}

export function appendFileContent(
  before: string,
  content: string,
  path: string,
): string {
  const normalizedContent = isPureCrlf(before) ? toCrlf(content) : content
  if (!before.replace(/\r?\n/g, '')) return normalizedContent
  if (!normalizedContent.replace(/\r?\n/g, '')) return before
  const newline = before.includes('\r\n') ? '\r\n' : '\n'
  const separator = path.toLowerCase().endsWith('.md')
    ? newline + newline
    : newline
  return (
    before.replace(/(?:\r?\n)+$/, '') +
    separator +
    normalizedContent.replace(/^(?:\r?\n)+/, '')
  )
}
