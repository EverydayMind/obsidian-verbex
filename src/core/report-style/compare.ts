import {
  comparisonGroups,
  representativeStyle as representative,
} from './comparisonGroups'
import { unsupportedSummary } from './reportBounds'
import type { Atom, ProfileMachine, StyleSnapshot } from './types'

type Fact = { kind: string; key: string; source?: unknown; output?: unknown }
type OutputBinding = { key: string; representativeRef: string }
const measured = (
  value: unknown,
): value is Atom<unknown> & { state: 'measured' } =>
  !!value &&
  typeof value === 'object' &&
  (value as { state?: string }).state === 'measured'

/** Equal units compare raw numeric quantities exactly. Enum/ID bitfields are
 * not quantities: compare their measured values, never unrelated flag bits. */
export function equalAtoms(
  left: Atom<unknown>,
  right: Atom<unknown>,
): boolean | null {
  if (!measured(left) || !measured(right)) return null
  if (typeof left.value === 'number' && typeof right.value === 'number') {
    if (
      left.rawUnit === right.rawUnit &&
      ['HWPUNIT', 'pct', 'count'].includes(left.rawUnit) &&
      typeof left.raw === 'number' &&
      typeof right.raw === 'number'
    )
      return left.raw === right.raw
    return (
      Math.abs(left.value - right.value) <=
      (left.rawUnit === 'pct' || right.rawUnit === 'pct'
        ? 1e-6
        : 0.01 + Number.EPSILON)
    )
  }
  if (
    left.value &&
    right.value &&
    typeof left.value === 'object' &&
    typeof right.value === 'object' &&
    'kind' in left.value &&
    'kind' in right.value
  ) {
    const a = left.value as { kind: string; value: number; unit: string },
      b = right.value as typeof a
    return (
      a.kind === b.kind &&
      a.unit === b.unit &&
      Math.abs(a.value - b.value) <= (a.unit === 'pt' ? 0.01 : 1e-6)
    )
  }
  return JSON.stringify(left.value) === JSON.stringify(right.value)
}

function atoms(value: unknown, prefix = ''): [string, Atom<unknown>][] {
  if (!value || typeof value !== 'object') return []
  if ('state' in value) return [[prefix, value as Atom<unknown>]]
  return Object.entries(value).flatMap(([key, item]) =>
    atoms(item, prefix ? `${prefix}.${key}` : key),
  )
}
function differences(source: unknown, output: unknown, prefix: string): Fact[] {
  const target = new Map(atoms(output))
  return atoms(source).flatMap(([key, left]) => {
    const right = target.get(key),
      equal = right ? equalAtoms(left, right) : null
    return equal === true
      ? []
      : [
          {
            kind: equal === null ? 'not_measured' : 'difference',
            key: `${prefix}.${key}`,
            source: left,
            output: right ?? null,
          },
        ]
  })
}
/** Compare an explicitly mapped role using the same atoms as compareProfile. */
export function roleDifferences(
  profile: ProfileMachine,
  output: StyleSnapshot,
  key: string,
  ref: string,
) {
  const binding = profile.bindings.find((item) => item.key === key)
  if (!binding) throw new Error('Unknown output binding key.')
  const source = representative(
    profile.snapshot,
    binding.representativeRef,
    binding.marker,
  )
  return {
    sourceAtoms: new Map(atoms(source)),
    facts: differences(
      source,
      representative(output, ref, binding.marker),
      `roles.${key}`,
    ),
  }
}

export function compareProfile(
  profile: ProfileMachine,
  output: StyleSnapshot,
  outputBindings: OutputBinding[] = [],
) {
  if (
    outputBindings.length > 128 ||
    new Set(outputBindings.map((item) => item.key)).size !==
      outputBindings.length
  )
    throw new Error('Invalid output bindings.')
  const bindings = new Map(
    outputBindings.map((item) => [item.key, item.representativeRef]),
  )
  const sourceKeys = new Set(profile.bindings.map((item) => item.key))
  if (outputBindings.some((item) => !sourceKeys.has(item.key)))
    throw new Error('Unknown output binding key.')
  const facts: Fact[] = []
  if (profile.snapshot.sections.length !== output.sections.length)
    facts.push({
      kind: 'difference',
      key: 'sections.count',
      source: profile.snapshot.sections.length,
      output: output.sections.length,
    })
  profile.snapshot.sections.forEach((section, index) =>
    facts.push(
      ...differences(section, output.sections[index], `sections.${index}`),
    ),
  )
  const groups = comparisonGroups(output, false, atoms)
  const metaGroups = profile.bindings.some(
    (binding) => binding.marker === 'BODY:META',
  )
    ? comparisonGroups(output, true, atoms)
    : groups
  const roles = profile.bindings.map((binding) => {
    const selected = representative(
      profile.snapshot,
      binding.representativeRef,
      binding.marker,
    )
    const sourceAtoms = atoms(selected).filter(([, value]) => measured(value))
    const signatureUses = [
      ...(binding.marker === 'BODY:META' ? metaGroups : groups).values(),
    ].reduce(
      (count, group) =>
        count +
        (sourceAtoms.length > 0 &&
        sourceAtoms.every(([key, value]) => {
          const right = group.values.get(key)
          return right && equalAtoms(value, right) === true
        })
          ? group.count
          : 0),
      0,
    )
    const ref = bindings.get(binding.key)
    if (!ref)
      return {
        key: binding.key,
        state: 'unresolved',
        signatureUses,
        signatureScope: 'measured_properties_only',
      }
    const target = representative(output, ref, binding.marker)
    facts.push(...differences(selected, target, `roles.${binding.key}`))
    return {
      key: binding.key,
      state: 'explicitly_mapped',
      representativeRef: ref,
      signatureUses,
      signatureScope: 'measured_properties_only',
    }
  })
  for (const item of output.unsupported)
    for (const ref of item.refs)
      facts.push({
        kind: 'unsupported',
        key: `unsupported.${item.feature}`,
        output: { ref },
      })
  return {
    outputSha256: output.source.sha256,
    sourceMeasurementSha256: profile.measurementSha256,
    roles,
    ...unsupportedSummary(output.unsupported),
    layout: { state: 'not_measured' as const },
    facts,
  }
}

export function comparisonPage(
  report: ReturnType<typeof compareProfile>,
  offset: number,
  limit: number,
) {
  const { facts, ...summary } = report
  const page: {
    differences: Fact[]
    nextOffset: number | null
    totalDifferences: number
  } = { differences: [], nextOffset: null, totalDifferences: facts.length }
  for (const fact of facts.slice(offset, offset + limit)) {
    const next = {
      ...summary,
      ...page,
      differences: [...page.differences, fact],
    }
    if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 120 * 1024)
      break
    page.differences.push(fact)
  }
  if (offset + page.differences.length < facts.length)
    page.nextOffset = offset + page.differences.length
  return { ...summary, ...page }
}
