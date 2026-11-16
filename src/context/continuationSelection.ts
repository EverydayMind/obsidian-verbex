/** A bare option pick answering the prior assistant question. */
export function isSelectionAnswer(request: string): boolean {
  if (
    /^\s*(?:option|choice|number)\s+(?:[0-9]{1,2}|[a-z])\s*[.!?]?\s*$/i.test(
      request,
    )
  )
    return true
  return /^\s*(?:[0-9]{1,2}\s*번?|[A-Za-z가-하])\s*$/.test(request)
}
