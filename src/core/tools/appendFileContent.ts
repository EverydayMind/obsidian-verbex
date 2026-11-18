export function appendFileContent(
  before: string,
  content: string,
  path: string,
): string {
  if (!before.replace(/\r?\n/g, '')) return content
  if (!content.replace(/\r?\n/g, '')) return before
  const newline = before.includes('\r\n') ? '\r\n' : '\n'
  const separator = path.toLowerCase().endsWith('.md')
    ? newline + newline
    : newline
  return (
    before.replace(/(?:\r?\n)+$/, '') +
    separator +
    content.replace(/^(?:\r?\n)+/, '')
  )
}
