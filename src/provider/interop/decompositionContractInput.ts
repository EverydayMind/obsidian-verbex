import { rolePrefixes } from '../../core/document-jobs/decompose/v2Guidance'

import type { analyzeJobDecomposition } from './analyzeJobDecomposition'

export type Analysis = Extract<
  NonNullable<Awaited<ReturnType<typeof analyzeJobDecomposition>>>,
  { model: unknown }
>

/** Both preparation paths use the current pair when it has already been saved. */
export function decompositionContractInput({
  pair,
  model,
  bundle,
  markdown,
}: Analysis) {
  const markers = pair?.markers ?? model.bindings.map((b) => b.marker)
  const prefixes =
    pair?.prefixes ??
    Object.fromEntries(bundle.bindings.map((b) => [b.marker, b.prefix]))
  return {
    rolePrefixes: rolePrefixes(markers, prefixes),
    markers,
    prefixes,
    markdown: pair?.markdown ?? markdown,
  }
}
