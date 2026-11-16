import type { RequestTool } from '../types/llm/request'
import { tokenCount, tokenizerRanksGeneration } from '../utils/llm/token'

// Provider refreshes recreate definition objects, so key by their exact JSON.
// Only schema definitions enter this bounded, in-memory cache, never requests.
const MAX_ENTRIES = 256
const MAX_CODE_UNITS = 512 * 1024
const counts = new Map<string, Promise<number>>()
let size = 0
let cacheGeneration = -1
let cacheCounter: typeof tokenCount | undefined

export function toolDefinitionTokenCount(
  definition: RequestTool,
): Promise<number> {
  const json = JSON.stringify(definition)
  const generation = tokenizerRanksGeneration()
  const counter = tokenCount
  if (generation !== cacheGeneration || counter !== cacheCounter) {
    counts.clear()
    size = 0
    cacheGeneration = generation
    cacheCounter = counter
  }
  const cached = counts.get(json)
  if (cached) {
    counts.delete(json)
    counts.set(json, cached)
    return cached
  }
  const result = counter(json)
  if (json.length > MAX_CODE_UNITS) return result
  while (counts.size >= MAX_ENTRIES || size + json.length > MAX_CODE_UNITS) {
    const oldest = counts.keys().next().value as string | undefined
    if (oldest === undefined) break
    counts.delete(oldest)
    size -= oldest.length
  }
  counts.set(json, result)
  size += json.length
  void result.catch(() => {
    if (counts.get(json) === result) {
      counts.delete(json)
      size -= json.length
    }
  })
  return result
}
