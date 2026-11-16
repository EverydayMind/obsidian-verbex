/** Preserve the old context budget while removing generated map settings. */
export function migrateMocToWiki(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const verbex = asRecord(data.verbex)
  const context = asRecord(verbex.context)
  const legacyBudget = context.mocTokenBudget
  const nextContext = { ...context }
  delete nextContext.mocTokenBudget
  if (typeof nextContext.wikiTokenBudget !== 'number') {
    nextContext.wikiTokenBudget =
      typeof legacyBudget === 'number' ? legacyBudget : 4000
  }

  const nextVerbex: Record<string, unknown> = {
    ...verbex,
    context: nextContext,
  }
  delete nextVerbex.moc
  return { ...data, version: 19, verbex: nextVerbex }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
