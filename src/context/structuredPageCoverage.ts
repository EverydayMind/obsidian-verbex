import { hasNonRoundTripNumber, sortReadValue } from './canonicalRead'
import type { PriorToolResult } from './priorReads'
import { structuredReadVersion } from './structuredReadVersion'

type Page = {
  key: string
  offset: number
  items: string[]
  metadata: string
  nextOffset: number | null
}

/** Only compare pages with identical version, request identity and non-page metadata. */
export function structuredPageCoverage(
  result: PriorToolResult,
): Page | undefined {
  const identity = structuredReadVersion(result)
  if (!identity || !result.text) return undefined
  try {
    const args: unknown = JSON.parse(result.call.arguments ?? '{}')
    const parsed: unknown = JSON.parse(result.text)
    if (
      !args ||
      typeof args !== 'object' ||
      Array.isArray(args) ||
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      hasNonRoundTripNumber(parsed)
    )
      return undefined
    const input = args as Record<string, unknown>,
      page = parsed as Record<string, unknown>
    const offset = input.offset ?? 0
    if (
      !Number.isSafeInteger(offset) ||
      (offset as number) < 0 ||
      (page.offset !== undefined && page.offset !== offset) ||
      !Array.isArray(page.items) ||
      !page.items.length ||
      page.items.length > 100 ||
      (page.nextOffset !== null &&
        page.nextOffset !== (offset as number) + page.items.length)
    )
      return undefined
    const { items, nextOffset, offset: _offset, ...metadata } = page
    return {
      key: JSON.stringify([identity.key, identity.version]),
      offset: offset as number,
      items: items.map((item) => JSON.stringify(sortReadValue(item))),
      metadata: JSON.stringify(sortReadValue(metadata)),
      nextOffset,
    }
  } catch {
    return undefined
  }
}

export function pageCovers(cover: Page, previous: Page): boolean {
  const start = previous.offset - cover.offset
  return (
    cover.key === previous.key &&
    cover.metadata === previous.metadata &&
    start >= 0 &&
    start + previous.items.length <= cover.items.length &&
    // A terminal page asserts that there are no items after its end. Preserve
    // it if another observation contradicts that assertion, even when the
    // overlapping items and version match.
    (previous.nextOffset !== null ||
      (cover.nextOffset === null &&
        start + previous.items.length === cover.items.length)) &&
    // Equal end positions must agree whether a continuation exists.
    (start + previous.items.length !== cover.items.length ||
      (cover.nextOffset === null) === (previous.nextOffset === null)) &&
    previous.items.every((item, index) => item === cover.items[start + index])
  )
}
