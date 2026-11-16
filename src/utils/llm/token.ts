import { Tiktoken, type TiktokenBPE } from 'js-tiktoken/lite'

// TODO: Replace js-tiktoken with tiktoken library for better performance
// Note: tiktoken uses WebAssembly, requiring esbuild configuration

// Token counting across Verbex uses exactly two functions, with distinct roles:
//   - estimateTokens (utils/llm/estimateTokens.ts): synchronous, CJK-aware,
//     intentionally conservative (over-counts). Use for budget packing and
//     "does this fit?" short-circuits where under-counting risks an overflow.
//   - tokenCount (here): exact, asynchronous. Use only where precision matters.
// There is no third char/length heuristic any more — a previous one under-counted
// CJK by ~3-4x and could mis-judge a Korean document as within budget.
//
// tokenCount uses cl100k_base. Counts for models with another tokenizer are
// approximate; use estimateTokens for conservative budget checks.

// The rank table is supplied by the runtime resource loader so the full
// cl100k_base literal is not parsed while main.js is evaluated.
let ranksLoader: (() => Promise<TiktokenBPE>) | null = null
let encoderPromise: Promise<Tiktoken> | null = null
let ranksGeneration = 0

/** Changes whenever cached exact counts must be recomputed. */
export const tokenizerRanksGeneration = (): number => ranksGeneration

export function registerTokenizerRanksLoader(
  loader: (() => Promise<TiktokenBPE>) | null,
): void {
  ranksLoader = loader
  encoderPromise = null
  ranksGeneration++
}

async function getEncoder(): Promise<Tiktoken> {
  if (!encoderPromise) {
    if (!ranksLoader) {
      throw new Error('Verbex tokenizer: ranks loader not registered')
    }
    encoderPromise = ranksLoader().then((ranks) => new Tiktoken(ranks))
    // A missing/corrupt runtime resource must be retryable after repair.
    encoderPromise.catch(() => {
      encoderPromise = null
    })
  }
  return encoderPromise
}

// Caution: tokenCount is computationally expensive for large inputs.
// Frequent use, especially on large files, may significantly impact performance.
// Prefer estimateTokens for hot-loop budget checks and reserve this for
// the boundary cases that require an exact count.
export async function tokenCount(text: string): Promise<number> {
  return (await getEncoder()).encode(text).length
}
