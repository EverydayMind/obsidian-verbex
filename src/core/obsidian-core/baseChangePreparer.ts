import { type App, normalizePath } from 'obsidian'

import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import type {
  AfterApplyResult,
  LocalChangePreparer,
} from '../tools/localChangePreparation'
import { isBasePath } from '../tools/localToolCommonText'

import type { BasesEngine } from './basesEngine'
import { appliedBaseObservation } from './renderBaseText'

export function baseChangePreparer(
  basesEngine?: BasesEngine,
  app?: App,
): LocalChangePreparer | undefined {
  if (!basesEngine) return undefined
  return async ({ change, signal }) => {
    if (
      change.op === 'delete' ||
      typeof change.after !== 'string' ||
      !isBasePath(change.path)
    ) {
      return undefined
    }
    const targetPath = normalizePath(change.path)
    if (isAiPrivatePath(targetPath)) return undefined
    const fallbackContent = change.after
    return {
      change,
      afterApply: async (status) => {
        if (status !== 'applied' && status !== 'partially_applied') {
          return undefined
        }
        let definition = fallbackContent
        try {
          if (app && (await app.vault.adapter.exists(targetPath))) {
            definition = await app.vault.adapter.read(targetPath)
          }
        } catch {
          // Use the proposed content if readback fails.
        }
        const evaluated = await basesEngine.evaluate({
          definition,
          sourcePath: targetPath,
          signal,
        })
        if (evaluated.kind !== 'ok' || evaluated.views.length === 0) {
          return undefined
        }
        return appliedBaseObservation(
          evaluated.views.map((view) => ({
            name: view.name,
            count: view.rows.length,
          })),
        )
      },
    }
  }
}

function combineAfterApply(
  first?: AfterApplyResult,
  second?: AfterApplyResult,
): AfterApplyResult | undefined {
  if (!first) return second
  if (!second) return first
  const text = [
    typeof first === 'string' ? first : first.text,
    typeof second === 'string' ? second : second.text,
  ]
    .filter(Boolean)
    .join('\n')
  const observation =
    typeof first === 'object' && first.observation
      ? first.observation
      : typeof second === 'object'
        ? second.observation
        : undefined
  return observation ? { text, observation } : text
}

export function composeLocalChangePreparers(
  ...preparers: (LocalChangePreparer | undefined)[]
): LocalChangePreparer | undefined {
  const active = preparers.filter((p): p is LocalChangePreparer => Boolean(p))
  if (active.length === 0) return undefined
  if (active.length === 1) return active[0]
  return async (input) => {
    let current = input.change
    let matched = false
    const callbacks: NonNullable<
      NonNullable<Awaited<ReturnType<LocalChangePreparer>>>['afterApply']
    >[] = []
    for (const prepare of active) {
      const result = await prepare({ ...input, change: current })
      if (!result) continue
      matched = true
      current = result.change
      if (result.afterApply) callbacks.push(result.afterApply)
    }
    if (!matched) return undefined
    return {
      change: current,
      afterApply: callbacks.length
        ? async (status) => {
            let combined: AfterApplyResult | undefined
            for (const callback of callbacks) {
              combined = combineAfterApply(combined, await callback(status))
            }
            return combined
          }
        : undefined,
    }
  }
}
