import { resolveBaseFont } from '../document-jobs/baseFont'

import { prefixMarkerFor } from './prefixMarker'
import { representativeRun } from './representativeRun'
import { significantBodyCandidates } from './significantBodyCandidates'
import type { StyleSnapshot } from './types'

export { representativeRun } from './representativeRun'
export type BindingCandidate = {
  sizePt?: number | null
  ref: string
  alternativeRefs: string[]
  prefix: string | null
  paragraphs: number
  spacingPt: number | null
  spacingHeightsPt: (number | null)[]
  container: 'body'
  paragraphSignature: string
  characterSignature: string
  order: number
  heading: boolean
}

export type BindingCandidates = {
  roles: Record<string, BindingCandidate[]>
  effectiveBaseFontPt?: number | null
  effectiveSource?: 'requested' | 'fallback' | 'symbol_body'
  bodyNeedsChoice: boolean
  bodyChoices: BindingCandidate[]
}

// Ignore extraction provenance: it can differ for visually equal styles.
function styleSignature(value: unknown): string {
  const clean = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(clean)
    if (!item || typeof item !== 'object') return item
    const record = item as Record<string, unknown>
    if (record.state === 'measured')
      return { state: 'measured', value: clean(record.value) }
    if (record.state === 'not_measured') return { state: 'not_measured' }
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, clean(record[key])]),
    )
  }
  return JSON.stringify(clean(value) ?? null)
}

type Group = {
  prefix: string | null
  paragraphSignature: string
  characterSignature: string
  heading: boolean
  order: number
  count: number
  sizes: Map<number, number>
  spacers: Map<
    string,
    { count: number; refs: string[]; heights: (number | null)[] }
  >
}

/** Measured candidates only. Text previews must come from inspectStyle separately. */
export function bindingCandidates(
  snapshot: StyleSnapshot,
  requestedBaseFontPt?: number,
): BindingCandidates {
  const paragraphs = new Map(
    (snapshot.paragraphs ?? []).map((item) => [item.ref, item]),
  )
  const containers = new Set(
    (snapshot.nodes ?? [])
      .filter((node) => node.kind === 'table' && node.parentRef)
      .map((node) => node.parentRef),
  )
  const unsupported = new Set(
    (snapshot.unsupported ?? []).flatMap((item) => item.refs),
  )
  const nodes = (snapshot.nodes ?? [])
    .filter((node) => node.kind === 'paragraph' && node.parentRef === null)
    .sort((a, b) => (a.topLevelOrder ?? 0) - (b.topLevelOrder ?? 0))
  const groups = new Map<string, Group>()
  let pending: (number | null)[] = []
  for (const [index, node] of nodes.entries()) {
    if (containers.has(node.ref) || unsupported.has(node.ref)) {
      pending = []
      continue
    }
    const paragraph = paragraphs.get(node.ref)
    if (!paragraph) {
      pending = []
      continue
    }
    if (!paragraph.textCodePoints) {
      const size = (snapshot.characterStyles ?? [])[
        representativeRun(paragraph)?.characterStyle ?? -1
      ]?.sizePt
      pending.push(
        size?.state === 'measured' && Number.isFinite(size.value)
          ? size.value
          : null,
      )
      continue
    }
    const paragraphSignature = styleSignature(
      (snapshot.paragraphStyles ?? [])[paragraph.paragraphStyle],
    )
    const characters = paragraph.runs
      .map((run) =>
        styleSignature((snapshot.characterStyles ?? [])[run.characterStyle]),
      )
      .filter((signature, i, all) => i === 0 || signature !== all[i - 1])
    const characterSignature = JSON.stringify(characters)
    const prefix = paragraph.prefix ?? null
    const outline = (snapshot.paragraphStyles ?? [])[paragraph.paragraphStyle]
      ?.outlineLevel
    const heading =
      !!(prefix && /^\d+[.)]?$/.test(prefix)) ||
      (outline?.state === 'measured' && outline.value > 0)
    const key = JSON.stringify([
      prefix,
      paragraphSignature,
      characterSignature,
      heading,
    ])
    let group = groups.get(key)
    if (!group) {
      group = {
        prefix,
        paragraphSignature,
        characterSignature,
        heading,
        order: node.topLevelOrder ?? index,
        count: 0,
        sizes: new Map(),
        spacers: new Map(),
      }
      groups.set(key, group)
    }
    group.count++
    for (const run of paragraph.runs) {
      const size = snapshot.characterStyles[run.characterStyle]?.sizePt
      if (
        run.length > 0 &&
        size?.state === 'measured' &&
        Number.isFinite(size.value)
      )
        group.sizes.set(
          size.value,
          (group.sizes.get(size.value) ?? 0) + run.length,
        )
    }
    const spacerKey = JSON.stringify(pending)
    const spacer = group.spacers.get(spacerKey)
    if (spacer) {
      spacer.count++
      if (spacer.refs.length < 4) spacer.refs.push(node.ref)
    } else
      group.spacers.set(spacerKey, {
        count: 1,
        refs: [node.ref],
        heights: pending,
      })
    pending = []
  }
  const candidates = [...groups.values()]
    .map((group): BindingCandidate => {
      const typical = [...group.spacers.values()].reduce((best, item) =>
        item.count > best.count ||
        (item.count === best.count &&
          !best.heights.length &&
          item.heights.length > 0)
          ? item
          : best,
      )
      return {
        sizePt: [...group.sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        ref: typical.refs[0],
        alternativeRefs: [
          typical,
          ...[...group.spacers.values()]
            .filter((spacer) => spacer !== typical)
            .sort((a, b) => b.count - a.count),
        ]
          .flatMap((spacer) => spacer.refs)
          .slice(1, 4),
        prefix: group.prefix,
        paragraphs: group.count,
        spacingPt: typical.heights.some((height) => height === null)
          ? null
          : typical.heights.reduce<number>(
              (sum, height) => sum + (height ?? 0),
              0,
            ),
        spacingHeightsPt: [...typical.heights],
        container: 'body',
        paragraphSignature: group.paragraphSignature,
        characterSignature: group.characterSignature,
        order: group.order,
        heading: group.heading,
      }
    })
    .sort((a, b) => b.paragraphs - a.paragraphs || a.order - b.order)
  const plain = candidates.filter(
    (item) => item.prefix === null && !item.heading,
  )
  const prefixed = candidates.filter(
    (item) =>
      !item.heading &&
      item.prefix !== null &&
      prefixMarkerFor(item.prefix) !== null,
  )
  const base =
    requestedBaseFontPt === undefined
      ? undefined
      : resolveBaseFont(plain, requestedBaseFontPt)
  const bodyPlain = base?.body ?? plain
  const body = plain.length ? bodyPlain : prefixed
  const significant = significantBodyCandidates(bodyPlain)
  const bodyNeedsChoice =
    body.length > 0 && (!plain.length || significant.length >= 2)
  const roles: Record<string, BindingCandidate[]> = { BODY: body }
  if (base?.meta.length) roles['BODY:META'] = base.meta
  for (const candidate of candidates) {
    const prefix = candidate.prefix
    const marker = candidate.heading ? 'H1' : prefix && prefixMarkerFor(prefix)
    if (marker) (roles[marker] ??= []).push(candidate)
  }
  return {
    roles,
    ...(base
      ? {
          effectiveBaseFontPt: base.effectiveBaseFontPt,
          effectiveSource: base.effectiveSource,
        }
      : {}),
    bodyNeedsChoice,
    bodyChoices: bodyNeedsChoice
      ? (plain.length ? significant : body).slice(0, 5)
      : [],
  }
}
