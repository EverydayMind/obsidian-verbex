import { replayCompactSemantic } from './compactSemanticApi'
import { encodeCompactSnapshot } from './compactSnapshotEncode'
import { retainedCompactSnapshot } from './compactSnapshotMemo'
import { validateExpandedSnapshot } from './expandedSnapshot'
import { readSavedSemanticAnalysis } from './semanticRead'
import type { SemanticReplay } from './semanticReplay'
import type { StyleApi } from './styleApiTypes'
import type { StyleSnapshot } from './types'

export async function readProfileSemanticAnalysis(
  api: StyleApi,
  snapshot: StyleSnapshot,
  measurementSha256: string,
  replay: SemanticReplay,
  signal?: AbortSignal,
  compact = false,
) {
  if (!compact)
    return readSavedSemanticAnalysis(
      api,
      snapshot,
      measurementSha256,
      replay,
      signal,
    )
  const sourceSha256 = snapshot.source.sha256
  let packed = retainedCompactSnapshot(snapshot)
  if (packed === undefined)
    packed = await encodeCompactSnapshot(
      snapshot,
      measurementSha256,
      sourceSha256,
    )
  else await validateExpandedSnapshot(snapshot, measurementSha256, sourceSha256)
  return replayCompactSemantic(
    api,
    packed,
    sourceSha256,
    measurementSha256,
    replay,
    signal,
  )
}
