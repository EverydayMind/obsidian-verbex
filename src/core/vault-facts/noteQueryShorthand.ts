export function normalizeShorthand(input: unknown[]) {
  const shorthand: { field: string; op: string }[] = []
  const where = input.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const c = item as Record<string, unknown>
    const keys = Object.keys(c)
    const op = keys.find((key) =>
      ['eq', 'ne', 'contains', 'gte', 'lte'].includes(key),
    )
    if (keys.length !== 2 || !keys.includes('field') || !op) return { ...c }
    if (typeof c.field === 'string') shorthand.push({ field: c.field, op })
    return { field: c.field, op, value: c[op] }
  })
  return { where, shorthand }
}
