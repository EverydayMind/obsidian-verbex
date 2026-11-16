export function computeSeverityCounts(text: string): Record<string, number> {
  const counts: Record<string, number> = { Critical: 0, Major: 0, Minor: 0 }
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const severity = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim())[1]
    if (severity in counts) counts[severity] += 1
  }
  return counts
}
