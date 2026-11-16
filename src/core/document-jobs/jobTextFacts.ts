import type { JsonObject } from '../../provider/interop/protocol'
import { readSemanticAnalysis } from '../report-style/semanticRead'
import type { StyleApi } from '../report-style/styleApiTypes'

/** Bounded text-free semantic facts; a missing extractor is not a zero distribution. */
export async function readJobTextFacts(input: {
  api: StyleApi
  path: string
  sourceSha256: string
  measurementSha256: string
  signal?: AbortSignal
}): Promise<{ facts: JsonObject; available: boolean }> {
  try {
    const analysis = await readSemanticAnalysis(
      input.api,
      input.path,
      input.sourceSha256,
      input.measurementSha256,
      input.signal,
    )
    const nodes = analysis.nodes.filter(
      (node) =>
        node.features.container === 'body' &&
        node.state === 'decided' &&
        ['BODY_PARAGRAPH', 'BULLET_ITEM'].includes(
          node.candidates[0]?.role ?? '',
        ) &&
        node.features.ending !== 'empty',
    )
    if (!nodes.length) return { facts: {}, available: false }
    const endings: Record<string, number> = {}
    let words = 0
    for (const node of nodes) {
      const ending = String(node.features.ending)
      endings[ending] = (endings[ending] ?? 0) + 1
      words += Number(node.features.wordCount)
    }
    return {
      facts: {
        endings: Object.fromEntries(
          Object.entries(endings).map(([key, count]) => [
            key,
            count / nodes.length,
          ]),
        ),
        avgWords: words / nodes.length,
      },
      available: true,
    }
  } catch (error) {
    if (input.signal?.aborted) throw error
    return { facts: {}, available: false }
  }
}
