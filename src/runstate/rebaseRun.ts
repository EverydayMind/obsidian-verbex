import type { VerbexRunState } from '../verbex/types'

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * Applies the change a caller made (`base` -> `updated`) on top of `latest`,
 * so a long-running caller's final save cannot erase what other writers
 * (checkpoint links, tool outcomes, pause) stored in the meantime.
 *
 * - scalar/plan fields: the caller's value wins only if the caller changed it
 * - artifacts: per key; caller-changed/added keys win, caller deletions apply
 * - logs: caller-appended entries are appended to the latest logs
 * - checkpoints: union (a checkpoint link is never dropped)
 */
export function rebaseRun(
  base: VerbexRunState,
  updated: VerbexRunState,
  latest: VerbexRunState,
): VerbexRunState {
  const result: VerbexRunState = { ...latest }
  for (const key of [
    'status',
    'title',
    'skill',
    'workflow',
    'plan',
    'currentStepId',
  ] as const) {
    if (!same(base[key], updated[key])) {
      ;(result as Record<string, unknown>)[key] = updated[key]
    }
  }

  // Keys this update removed are dropped; keys added concurrently stay.
  const artifacts = Object.fromEntries(
    Object.entries(latest.artifacts).filter(
      ([key]) => key in updated.artifacts || !(key in base.artifacts),
    ),
  )
  for (const [key, value] of Object.entries(updated.artifacts)) {
    if (base.artifacts[key] !== value) artifacts[key] = value
  }
  result.artifacts = artifacts

  result.logs = [...latest.logs, ...updated.logs.slice(base.logs.length)]
  result.checkpoints = [
    ...new Set([...latest.checkpoints, ...updated.checkpoints]),
  ]
  return result
}
