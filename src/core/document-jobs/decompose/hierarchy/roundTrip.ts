import type { DecompositionFacts, HierarchyJudgement } from '../dialectV2'
import type { RoundTrip } from '../fitness'
import type { Model } from '../types'

import type { HierarchyFeature } from './features'
import { seriesText } from './markers'
import { classifyOmittedSpacing } from './omittedSpacing'
import { matchTransformedText } from './roundTripEvidence'

/** Classify exact, evidenced transformations without changing raw R1/R3/R4. */
export async function classifyHierarchyRoundTrip(
  raw: RoundTrip,
  input: {
    facts: DecompositionFacts
    features: HierarchyFeature[]
    judgements: HierarchyJudgement[]
    model: Model
    prefixes?: Map<string, string>
  },
  warnings: { code: string; count: number; examples: string[] }[] = [],
): Promise<RoundTrip> {
  if (!raw.R1 || !raw.R3 || !raw.R4 || raw.state !== 'measured') return raw
  const declarations: NonNullable<RoundTrip['declaredDifferences']> = []
  const explainedSource = new Set<string>(),
    explainedOutput = new Set<string>()
  const paired = new Set(raw.R4.pairs?.map((p) => p.sourceRef) ?? [])
  const used = new Map<string, string>()
  for (const f of input.features) {
    const count = (f.text.match(/\r\n|\r|\n/g) ?? []).length
    if (
      !count ||
      !raw.R1.missingLines?.some((l) => l.ref === (f.sourceRef ?? f.ref))
    )
      continue
    const ref = f.sourceRef ?? f.ref
    const output =
      raw.R4.pairs?.find((p) => p.sourceRef === ref)?.outputRef ??
      (await matchTransformedText(raw, f.text, ref, used))
    if (!output) continue
    declarations.push({ code: 'lineBreaksFlattened', count, refs: [ref] })
    explainedSource.add(ref)
    if (output) explainedOutput.add(output)
  }
  for (const fact of input.facts.sourceNumberingDiscontinuity ?? []) {
    declarations.push({
      code: 'sourceNumberingDiscontinuity',
      count: fact.refs.length,
      refs: fact.refs,
    })
    for (const [index, ref] of fact.refs.entries()) {
      const f = input.features.find((f) => f.ref === ref)
      const j = input.judgements.find((j) => j.ref === ref)
      if (!f || !j || paired.has(f.sourceRef ?? ref)) continue
      const expected =
        j.marker.series && j.marker.symbol
          ? f.text.replace(
              j.marker.symbol,
              seriesText(j.marker.series, index + 1) ?? String(index + 1),
            )
          : j.rule === 'R2'
            ? f.text.replace(/\d+(?=\.)/, String(index + 1))
            : null
      if (expected === null) continue
      const output = await matchTransformedText(
        raw,
        expected,
        f.sourceRef ?? ref,
        used,
      )
      if (!output) continue
      explainedSource.add(f.sourceRef ?? ref)
      explainedOutput.add(output)
    }
  }
  for (const fact of input.facts.spacingVariance ?? [])
    declarations.push({
      code: 'spacingVariance',
      count: fact.count,
      refs: fact.refs,
    })
  for (const fact of input.facts.spacingContextsDropped ?? [])
    declarations.push({
      code: 'spacingContextsDropped',
      count: fact.count,
      refs: input.model.blocks
        .filter((b, i, all) => {
          if (b.role === 'spacer' || b.role === 'omitted') return false
          const previous = all
            .slice(0, i)
            .reverse()
            .find((p) => p.role !== 'spacer' && p.role !== 'omitted')
          return (
            `SPACE:${(b.role === 'data_table' ? 'TABLE' : b.role).replace(':', '/')}:${(previous?.role === 'data_table' ? 'TABLE' : (previous?.role ?? 'START')).replace(':', '/')}` ===
            fact.contextKey
          )
        })
        .map((b) => b.ref),
    })
  for (const fact of input.facts.rulesReducedByLimit ?? [])
    declarations.push({
      code: 'rulesReducedByLimit',
      count: fact.count,
      refs: input.judgements
        .filter((j) => j.applicationKey === fact.toKey)
        .map((j) => j.ref),
    })
  if (input.model.omitted.length)
    declarations.push({
      code: 'omittedObjects',
      count: input.model.omitted.length,
      refs: input.model.omitted,
    })
  for (const warning of warnings.filter(
    (w) => w.code === 'counter_token_split',
  ))
    declarations.push({
      code: warning.code,
      count: warning.count,
      refs: input.model.bindings
        .filter((b) =>
          warning.examples.some((e) =>
            (input.prefixes?.get(b.marker) ?? '').includes(e),
          ),
        )
        .map((b) => b.representativeRef),
    })
  const explainedBlocks = raw.R4.differences.filter(
    (d) =>
      d.kind !== 'normalization' &&
      ((typeof d.sourceRef === 'string' && explainedSource.has(d.sourceRef)) ||
        (typeof d.outputRef === 'string' && explainedOutput.has(d.outputRef))),
  ).length
  const explainedLines =
    raw.R1.missingLines?.filter((l) => explainedSource.has(l.ref)).length ?? 0
  const droppedSpacingRefs = new Set(
    declarations
      .filter(
        (d) =>
          d.code === 'spacingContextsDropped' || d.code === 'spacingVariance',
      )
      .flatMap((d) => d.refs),
  )
  const omittedSpacing = classifyOmittedSpacing(raw, input.facts, input.model)
  declarations.push(...omittedSpacing.declarations)
  for (const ref of omittedSpacing.covered) droppedSpacingRefs.add(ref)
  const spacingErrors =
    (raw.spacingDifferenceCount ?? raw.spacingDifferences?.length ?? 0) -
    (raw.spacingDifferences?.filter((d) => droppedSpacingRefs.has(d.sourceRef))
      .length ?? 0)
  const omittedControls =
    raw.R3.mismatches?.filter(
      (d) =>
        typeof d.sourceRef === 'string' &&
        (input.model.omitted.includes(d.sourceRef) ||
          (d.reason === 'applied_page' &&
            explainedSource.has(d.sourceRef) &&
            typeof d.outputRef === 'string' &&
            explainedOutput.has(d.outputRef))),
    ).length ?? 0
  return {
    ...raw,
    declaredDifferences: declarations,
    rendererErrors: {
      missingLines: Math.max(
        0,
        raw.R1.sourceLines -
          raw.R1.omittedLines -
          raw.R1.matched -
          explainedLines,
      ),
      unexplainedBlocks:
        Math.max(0, raw.R4.unexplained - explainedBlocks) +
        spacingErrors +
        omittedSpacing.unexplained,
      controlMismatches: Math.max(0, raw.R3.mismatchCount - omittedControls),
    },
  }
}
