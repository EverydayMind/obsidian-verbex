import { VerbexSettings } from '../../settings/schema/setting.types'
import { PromptLevel } from '../../types/prompt-level.types'

/**
 * Model alias / step-model routing (PRD §17).
 *
 * A workflow step may request a specific `model` id or a named alias
 * (`default` / `fast` / `high_reasoning`). Resolution order:
 *   1. explicit step model id, if it is a configured chat model
 *   2. the alias' mapped model id, if configured
 *   3. settings.chatModelId (the base default)
 *
 * Unsupported step models do not throw: per the milestone, they produce a
 * warning and fall back to the base default so a run is never blocked by a
 * stale `model:` reference in a workflow.
 */

export type ModelAlias = 'default' | 'fast' | 'high_reasoning'

export type ResolvedModel = {
  modelId: string
  source: 'step' | 'alias' | 'default'
  /** Set when a requested step model / alias could not be honored. */
  warning?: string
}

export function resolveAgentModelLimits(
  promptLevel: PromptLevel | undefined,
  requestedMaxIterations: number | undefined,
  request = '',
): { maxIterations: number | undefined; temperature: number | undefined } {
  if (promptLevel !== PromptLevel.Simple) {
    return { maxIterations: requestedMaxIterations, temperature: undefined }
  }
  // Evidence-backed writing needs enough completions for discovery, several
  // source reads, the write call, and a final acknowledgement. A hard four-turn
  // cap made the small-model safety profile self-defeating for exactly those
  // tasks: search + three required reads consumed the whole budget before the
  // model could synthesize or write anything.
  const evidenceWritingTask =
    /보고서|종합|심층\s*(?:분석|조사)|자료\s*(?:조사|취합|수집)|질의.{0,24}답변|답변.{0,24}질의|\b(?:report|research|synthesize|evidence-based|in-depth analysis)\b/i.test(
      request,
    )
  // Exhaustive collection/tabulation ("모두 찾아 ... 표로 정리", "빠짐없이 취합")
  // is just as turn-hungry — it must search broadly, read many candidates, then
  // synthesize a table — yet it carries none of the words above. Without this it
  // starves at four turns before it can finish gathering, let alone tabulate.
  const exhaustiveCollectionTask =
    /\p{Script=Hangul}/u.test(request) &&
    /모두|전부|빠짐없이|누락\s*없이|all\b|every\b/i.test(request) &&
    /찾아|찾아서|수집|취합|정리|목록|표로|표\s*로|내역|list|table|compile|gather/i.test(
      request,
    )
  const englishEvidenceTask =
    /\b(?:synthesis|synthesise|synthesize|comprehensive|deep (?:analysis|research)|collect (?:the )?(?:evidence|sources)|question.{0,24}answer|answer.{0,24}question)\b/i.test(
      request,
    )
  const englishCollectionTask =
    /\b(?:all|every|each|complete|exhaustive|without omissions?)\b/i.test(
      request,
    ) &&
    /\b(?:find|collect|gather|compile|organize|organise|list|tabulate|enumerate|table|inventory)\b/i.test(
      request,
    )
  const turnHungryTask =
    evidenceWritingTask ||
    exhaustiveCollectionTask ||
    englishEvidenceTask ||
    englishCollectionTask
  const ceiling = turnHungryTask ? 8 : 4
  return {
    maxIterations: Math.min(requestedMaxIterations ?? ceiling, ceiling),
    temperature: 0,
  }
}

function hasModel(settings: VerbexSettings, modelId: string): boolean {
  return settings.chatModels.some((model) => model.id === modelId)
}

function aliasModelId(
  settings: VerbexSettings,
  alias: ModelAlias,
): string | undefined {
  const value = settings.modelAliases?.[alias]
  return value?.trim() ? value : undefined
}

function defaultModelId(settings: VerbexSettings): string {
  // Prefer the explicitly configured default alias, then chatModelId, then the
  // first configured model so resolution always yields something usable.
  const aliasDefault = aliasModelId(settings, 'default')
  if (aliasDefault && hasModel(settings, aliasDefault)) return aliasDefault
  if (settings.chatModelId && hasModel(settings, settings.chatModelId)) {
    return settings.chatModelId
  }
  return settings.chatModels[0]?.id ?? settings.chatModelId
}

export function resolveChatModelId({
  settings,
  alias,
  stepModel,
}: {
  settings: VerbexSettings
  alias?: ModelAlias
  stepModel?: string | null
}): ResolvedModel {
  const fallback = defaultModelId(settings)

  if (stepModel?.trim()) {
    if (hasModel(settings, stepModel)) {
      return { modelId: stepModel, source: 'step' }
    }
    return {
      modelId: fallback,
      source: 'default',
      warning: `Step model "${stepModel}" is not configured; falling back to "${fallback}".`,
    }
  }

  if (alias) {
    const mapped = aliasModelId(settings, alias)
    if (mapped) {
      if (hasModel(settings, mapped)) {
        return { modelId: mapped, source: 'alias' }
      }
      return {
        modelId: fallback,
        source: 'default',
        warning: `Alias "${alias}" points to unconfigured model "${mapped}"; falling back to "${fallback}".`,
      }
    }
    // Alias simply not configured: silently use the base default.
  }

  return { modelId: fallback, source: 'default' }
}
