import { ChatModel } from '../../types/chat-model.types'

/**
 * Per-model context window resolution (요구사항 1).
 *
 * Most OpenAI-compatible providers expose no standard API to
 * query a model's context window, so we keep a best-effort table of known models
 * and let the user override it per model via `ChatModel.contextWindow`. Unknown
 * models fall back to a conservative default so we never over-promise capacity.
 *
 * Numbers are the published context windows where known; treat them as defaults,
 * not guarantees. Users can override any value in the Chat Model settings.
 */

// Keyed by the wire model name (ChatModel.model) and/or the local id
// (ChatModel.id). Lookup tries the wire name first, then the id.
export const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {}

/**
 * Conservative fallback for models not in the table and without an override.
 * Unknown models use the same conservative default.
 */
export const DEFAULT_CONTEXT_WINDOW = 32_000

/**
 * Floor for the usable input budget. Even with a tiny configured context window
 * we never claim less than this so callers can still make a single request.
 */
export const MIN_INPUT_BUDGET = 1_000

/** Keep small-window models usable when the global output reserve is too high. */
export const MAX_OUTPUT_WINDOW_RATIO = 0.25
export const MAP_REDUCE_OUTPUT_RATIO = 0.2
/**
 * Fallback ceiling for a map/reduce partial output when no per-setting cap is
 * supplied. 2048 was too small for real summarization/merge steps — legal or
 * clause-dense chunks routinely ran past it and finished with `finish_reason:
 * length`, feeding a truncated partial into the next round. Callers should pass
 * the configured `mapReduceMaxOutputTokens`; this constant is only the default.
 */
export const MAX_MAP_REDUCE_OUTPUT_TOKENS = 4_096

/**
 * Resolve a model's total context window (input + output tokens):
 *   explicit override → known-model table (by wire name, then id) → default.
 */
export function resolveContextWindow(model: ChatModel): number {
  if (model.contextWindow && model.contextWindow > 0) {
    return model.contextWindow
  }
  return (
    KNOWN_CONTEXT_WINDOWS[model.model] ??
    KNOWN_CONTEXT_WINDOWS[model.id] ??
    DEFAULT_CONTEXT_WINDOW
  )
}

/**
 * Usable input token budget = context window minus the tokens reserved for the
 * model's own output (and a little framing overhead). Never returns below
 * {@link MIN_INPUT_BUDGET}.
 */
export function computeInputBudget(
  contextWindow: number,
  reservedOutputTokens: number,
): number {
  return Math.max(MIN_INPUT_BUDGET, contextWindow - reservedOutputTokens)
}

/**
 * Resolve the max output for a request. The configured reserve is suitable for
 * large hosted models, but reserving the default 8K on an 8K local model would
 * leave virtually no prompt space. Cap it to one quarter of the model window.
 */
export function computeOutputBudget(
  contextWindow: number,
  configuredReservedOutputTokens: number,
): number {
  return Math.max(
    256,
    Math.min(
      configuredReservedOutputTokens,
      Math.floor(contextWindow * MAX_OUTPUT_WINDOW_RATIO),
    ),
  )
}

/**
 * Slice packing (batch runner §3.6). The arithmetic target below is only the
 * initial goal; the packer's final gate is the token estimate of the fully
 * rendered request. `fillRatio` leaves headroom for the context packet and a
 * correction retry; `qualityCap` bounds the slice by the model's effective
 * attention span, which is far below the context window on small local models.
 */
export const PACK_FILL_RATIO_DEFAULT = 0.6
export const PACK_QUALITY_CAP_TOKENS_DEFAULT = 12_000
/** Output-side packing condition: a coarse per-member estimate (§3.6-3). */
export const PACK_OUTPUT_BASE_TOKENS = 1_024
export const PACK_OUTPUT_TOKENS_PER_MEMBER = 768
/** Never give a packed call less output room than the single-unit path had. */
export const PACK_OUTPUT_FLOOR_TOKENS = 4_096

export function computePackInputTarget(
  inputBudget: number,
  options?: { fillRatio?: number; qualityCap?: number },
): number {
  const fillRatio = options?.fillRatio ?? PACK_FILL_RATIO_DEFAULT
  const qualityCap = options?.qualityCap ?? PACK_QUALITY_CAP_TOKENS_DEFAULT
  return Math.max(
    MIN_INPUT_BUDGET,
    Math.min(Math.floor(inputBudget * fillRatio), qualityCap),
  )
}

export function estimatePackOutputTokens(memberCount: number): number {
  return (
    PACK_OUTPUT_BASE_TOKENS +
    PACK_OUTPUT_TOKENS_PER_MEMBER * Math.max(1, memberCount)
  )
}

export function computePackOutputTokens(
  outputBudget: number,
  memberCount: number,
): number {
  return Math.min(
    outputBudget,
    Math.max(PACK_OUTPUT_FLOOR_TOKENS, estimatePackOutputTokens(memberCount)),
  )
}

/**
 * Bound every map/reduce partial so intermediate outputs cannot become a second
 * oversized input during hierarchical reduction or final agent grounding.
 */
export function computeMapReduceOutputBudget(
  inputBudget: number,
  maxOutputTokens: number = MAX_MAP_REDUCE_OUTPUT_TOKENS,
): number {
  return Math.max(
    256,
    Math.min(
      maxOutputTokens,
      Math.floor(inputBudget * MAP_REDUCE_OUTPUT_RATIO),
    ),
  )
}
