import keys from '../../../contracts/document-jobs/v1/fidelity-keys.json'
import { roleDifferences } from '../report-style/compare'
import type { ProfileMachine, StyleSnapshot } from '../report-style/types'

const preserved = [
  ...keys.paragraph.map((key) => `paragraph.${key}`),
  ...keys.character.map((key) => `character.${key}`),
]
const preservedSet = new Set(preserved)

/** No signature inference: callers must provide an explicitly resolved output ref. */
export function adjudicateRole(
  profile: ProfileMachine,
  output: StyleSnapshot,
  key: string,
  ref: string,
) {
  const { sourceAtoms, facts } = roleDifferences(profile, output, key, ref)
  const prefix = `roles.${key}.`
  const sourceUnmeasured = preserved.filter(
    (item) => sourceAtoms.get(item)?.state !== 'measured',
  )
  const applicable = new Set(
    preserved.filter((item) => !sourceUnmeasured.includes(item)),
  )
  const different: string[] = [],
    unmeasured: string[] = []
  let ignoredDifferences = 0
  for (const fact of facts) {
    const item = fact.key.startsWith(prefix)
      ? fact.key.slice(prefix.length)
      : fact.key
    if (!preservedSet.has(item)) {
      if (fact.kind === 'difference') ignoredDifferences++
      continue
    }
    if (!applicable.has(item)) continue
    if (fact.kind === 'difference') different.push(item)
    else if (fact.kind === 'not_measured') unmeasured.push(item)
  }
  return {
    result: different.length
      ? ('different' as const)
      : unmeasured.length || !applicable.size
        ? ('incomplete' as const)
        : ('same' as const),
    ...(different.length ? { differences: different } : {}),
    ...(unmeasured.length ? { unmeasured } : {}),
    ...(!applicable.size ? { reason: 'no_comparable_keys' as const } : {}),
    ...(sourceUnmeasured.length ? { sourceUnmeasured } : {}),
    ignoredDifferences,
  }
}
