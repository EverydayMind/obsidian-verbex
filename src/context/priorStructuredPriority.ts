import type { PriorToolResult } from './priorReads'
import { pageCovers, structuredPageCoverage } from './structuredPageCoverage'
import {
  StructuredVersionOrder,
  structuredReadVersion,
} from './structuredReadVersion'

/** Only reorder when the budget is already insufficient; never discard here. */
export function markPriorStructuredPriority(
  candidates: { result: PriorToolResult; external: boolean; stale: boolean }[],
): void {
  const versions = new StructuredVersionOrder()
  const coveredBy = new Map<
    string,
    ReturnType<typeof structuredPageCoverage>[]
  >()
  for (const candidate of candidates.slice(0, 256)) {
    const version = candidate.external
      ? undefined
      : structuredReadVersion(candidate.result)
    const page = candidate.external
      ? undefined
      : structuredPageCoverage(candidate.result)
    const newer = page ? (coveredBy.get(page.key) ?? []) : []
    candidate.stale =
      (!!version && versions.isOlder(version, candidate.result.batchId)) ||
      (!!page && newer.some((cover) => !!cover && pageCovers(cover, page)))
    if (page && newer.length < 8) {
      newer.push(page)
      coveredBy.set(page.key, newer)
    }
  }
}
