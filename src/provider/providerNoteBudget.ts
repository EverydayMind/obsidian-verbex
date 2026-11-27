import { tokenCount } from '../utils/llm/token'

type Count = (text: string) => Promise<number>

export type NoteFit = {
  /** Providers whose instruction text was left out, lowest exposure rank first. */
  omitted: string[]
  tokens: number
  /** Tokens before anything was left out. */
  before: number
}

/**
 * B3: keeps the provider note block within `budget` tokens by leaving out the
 * instruction text of the providers with the lowest exposure rank first. The
 * block is measured whole (instructions, host facts, paths, editor scope);
 * only instruction text can be left out, so the other parts stay even when the
 * block still exceeds the budget afterwards.
 *
 * `rank` lists the provider ids from the highest exposure rank to the lowest.
 * `render` returns the block for a set of providers whose text is left out.
 */
export async function fitProviderNotes(input: {
  budget: number
  rank: readonly string[]
  render: (omitted: ReadonlySet<string>) => string
  /** Providers already left out (carried over from the first request). */
  start?: readonly string[]
  count?: Count
}): Promise<NoteFit> {
  const count = input.count ?? tokenCount
  const omitted = new Set(input.start ?? [])
  let text = input.render(omitted)
  let tokens = await count(text)
  const before = omitted.size ? await count(input.render(new Set())) : tokens
  for (const id of [...input.rank].reverse()) {
    if (tokens <= input.budget) break
    if (omitted.has(id)) continue
    const next = new Set(omitted).add(id)
    const rendered = input.render(next)
    // A provider with no instruction text changes nothing; keep it as is.
    if (rendered === text) continue
    omitted.add(id)
    text = rendered
    tokens = await count(text)
  }
  return { omitted: [...omitted], tokens, before }
}
