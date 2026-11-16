import {
  type BindingCandidate,
  bindingCandidates,
} from '../../report-style/bindingCandidates'
import { representativeRun } from '../../report-style/representativeRun'
import { PREFIX_SYMBOLS } from '../../report-style/text-features'
import type {
  Binding,
  Paragraph,
  StyleSnapshot,
} from '../../report-style/types'

import { addPlainVariants } from './plainVariantBindings'
import type { Block, Fact } from './types'

export function cleanStyle(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanStyle)
  if (!value || typeof value !== 'object') return value
  const v = value as Record<string, unknown>
  if (v.state === 'measured')
    return { state: 'measured', value: cleanStyle(v.value) }
  if (v.state === 'not_measured') return { state: 'not_measured' }
  return Object.fromEntries(
    Object.keys(v)
      .sort()
      .map((k) => [k, cleanStyle(v[k])]),
  )
}
const signature = (v: unknown) => JSON.stringify(cleanStyle(v) ?? null)
export function candidateKey(s: StyleSnapshot, p: Paragraph): string {
  const characters = p.runs
    .map((r) => signature(s.characterStyles[r.characterStyle]))
    .filter((v, i, a) => !i || v !== a[i - 1])
  return JSON.stringify([
    signature(s.paragraphStyles[p.paragraphStyle]),
    JSON.stringify(characters),
    p.prefix,
  ])
}
const keyOf = (c: BindingCandidate) =>
  JSON.stringify([c.paragraphSignature, c.characterSignature, c.prefix])
const excluded = (role: string | null) =>
  !!role &&
  (role.includes('HEADING') ||
    role === 'DOCUMENT_TITLE' ||
    role.startsWith('TABLE_') ||
    role === 'CAPTION')
export function scopeSnapshot(
  snapshot: StyleSnapshot,
  blocks: Block[],
): StyleSnapshot {
  const nodes = new Map(snapshot.nodes.map((n) => [n.ref, n]))
  const roots = new Set(blocks.map((b) => b.ref))
  const included = snapshot.nodes.filter((n) => {
    let p = n
    while (p.parentRef && nodes.has(p.parentRef))
      p = nodes.get(p.parentRef) ?? p
    return roots.has(p.ref)
  })
  const refs = new Set(included.map((n) => n.ref))
  return {
    ...snapshot,
    nodes: included,
    paragraphs: snapshot.paragraphs.filter((p) => refs.has(p.ref)),
  }
}
export function bodyRoles(
  snapshot: StyleSnapshot,
  blocks: Block[],
  base: number,
  facts: Fact[],
) {
  const eligible = new Set(
    blocks
      .filter((b) => b.kind === 'paragraph' && !excluded(b.semanticRole))
      .map((b) => b.ref),
  )
  const scoped = scopeSnapshot(snapshot, blocks)
  const population = {
    ...scoped,
    paragraphs: scoped.paragraphs.filter(
      (p) => eligible.has(p.ref) || !p.textCodePoints,
    ),
  }
  const candidates = bindingCandidates(population, base)
  const plain = (candidates.roles.BODY ?? []).filter(
    (c) => c.prefix === null && !c.heading,
  )
  const weights = new Map<string, number>()
  for (const p of population.paragraphs)
    weights.set(
      candidateKey(snapshot, p),
      (weights.get(candidateKey(snapshot, p)) ?? 0) + p.textCodePoints,
    )
  plain.sort(
    (a, b) =>
      (weights.get(keyOf(b)) ?? 0) - (weights.get(keyOf(a)) ?? 0) ||
      a.order - b.order,
  )
  // Keep prefix candidates even when their semantic candidate is a heading.
  const all = bindingCandidates(scoped, base)
  const symbols = new Set<string>(PREFIX_SYMBOLS)
  const prefixes = Object.entries(all.roles).filter(([role]) =>
    symbols.has(role),
  )
  const pref = prefixes.flatMap(([, cs]) => cs)
  const exact = pref.filter((c) => c.sizePt === base)
  const chosen =
    plain[0] ??
    (exact.length ? exact : pref).sort(
      (a, b) => b.paragraphs - a.paragraphs || a.order - b.order,
    )[0]
  if (chosen)
    facts.push({
      step: 6,
      rule: plain.length ? 'body_codepoint_sum' : 'body_prefix_base_size',
      refs: [chosen.ref],
      value: { weights: Object.fromEntries(weights), base },
    })
  const bindings: Binding[] = []
  const roles = new Map<string, string>()
  const assign = (marker: string, c: BindingCandidate) => {
    for (const p of scoped.paragraphs)
      if (candidateKey(snapshot, p) === keyOf(c)) roles.set(p.ref, marker)
  }
  const add = (marker: string, c: BindingCandidate) => {
    bindings.push({
      key: `role-${bindings.length + 1}`,
      marker,
      representativeRef: c.ref,
      assignedBy: 'rule',
    })
    assign(marker, c)
  }
  if (chosen) add('BODY', chosen)
  for (const [marker, cs] of prefixes) {
    add(marker, cs[0])
    // Same prefix's other shapes stay in the denominator, with explicit facts.
    for (const b of blocks.filter((b) => b.prefix === cs[0].prefix))
      roles.set(b.ref, marker)
    if (cs.length > 1)
      facts.push({
        step: 6,
        rule: 'prefix_secondary_shape',
        refs: cs.slice(1).map((c) => c.ref),
        value: marker,
      })
  }
  if (plain.length && all.roles['BODY:META']?.length)
    add('BODY:META', all.roles['BODY:META'][0])
  addPlainVariants(plain, chosen, add, assign, facts)
  return {
    bindings,
    roles,
    body_source: chosen
      ? plain.length
        ? 'plain'
        : `prefix_role:${chosen.prefix ?? ''}`
      : null,
    bodyNeedsChoice: plain.length > 0 && candidates.bodyNeedsChoice,
    bodyCandidates: plain.length ? plain : pref,
    scoped,
  }
}
export function characterShape(snapshot: StyleSnapshot, ref: string): string {
  const p = snapshot.paragraphs.find((p) => p.ref === ref)
  return signature(
    snapshot.characterStyles[
      p ? (representativeRun(p)?.characterStyle ?? -1) : -1
    ],
  )
}
