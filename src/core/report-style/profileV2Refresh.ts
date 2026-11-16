import { canonicalDigest } from '../../security/promptInjectionBoundary'

import { refreshCompactStyle } from './compactStyleApi'
import { type StyleApi, measureStyle } from './kordocStyleApi'
import {
  type ProfileV2,
  validateExpandedProfileV2,
  validateProfileV2,
} from './profileV2'

/** The current extractor still returns snapshot/1, so cached analysis remains unavailable. */
export async function refreshV2(
  machine: ProfileV2,
  api: StyleApi,
  path: string,
  signal?: AbortSignal,
  compact?: { byteHash: (path: string) => Promise<string> },
): Promise<ProfileV2> {
  const measured = compact
    ? await refreshCompactStyle(api, path, compact.byteHash, signal)
    : await measureStyle(api, path, undefined, signal)
  const changed = measured.measurementSha256 !== machine.measurementSha256
  const { semanticReplay, ...rest } = machine
  return (compact ? validateExpandedProfileV2 : validateProfileV2)({
    ...rest,
    ...measured,
    ...(!changed && semanticReplay ? { semanticReplay } : {}),
    semantics: changed ? [] : machine.semantics,
    semanticsSha256: changed
      ? await canonicalDigest([])
      : machine.semanticsSha256,
    roleStyleMap: [],
    fixedRegions: [],
    template: null,
  })
}
