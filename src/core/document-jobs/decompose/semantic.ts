import type { StyleApi } from '../../report-style/kordocStyleApi'
import {
  type SemanticResult,
  readSemanticAnalysis,
} from '../../report-style/semanticRead'

/** Optional semantic evidence never prevents structural decomposition. */
export async function readDecomposeSemantic(input: {
  api: StyleApi
  path: string
  sourceSha256: string
  measurementSha256: string
  signal?: AbortSignal
}): Promise<{
  semantic: Pick<SemanticResult, 'nodes'>
  semanticUnavailable: string | null
}> {
  try {
    const semantic = await readSemanticAnalysis(
      input.api,
      input.path,
      input.sourceSha256,
      input.measurementSha256,
      input.signal,
    )
    return { semantic, semanticUnavailable: null }
  } catch (error) {
    if (input.signal?.aborted) throw error
    const code = (error as { code?: unknown } | null)?.code
    return {
      semantic: { nodes: [] },
      semanticUnavailable:
        typeof code === 'string' ? code : 'semantic_read_failed',
    }
  }
}
