import { L } from '../../i18n/modelText'

const MAX_SUGGESTIONS = 3

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash)
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]
      previous[j] = Math.min(
        above + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return previous[b.length]
}

/**
 * Existing files in the same folder whose path is a near miss of `missing`
 * (a mistyped date prefix or name). Only the closest distance is kept, so an
 * unrelated sibling is never offered beside a near-identical one.
 */
export function closestExistingPaths(
  files: readonly { path: string }[],
  missing: string,
): string[] {
  const folder = parentOf(missing)
  const limit = Math.max(2, Math.floor(missing.length * 0.15))
  const scored = files
    .filter((file) => parentOf(file.path) === folder && file.path !== missing)
    .map((file) => ({
      path: file.path,
      distance: editDistance(missing, file.path),
    }))
    .filter((entry) => entry.distance <= limit)
  const best = Math.min(...scored.map((entry) => entry.distance))
  return scored
    .filter((entry) => entry.distance === best)
    .map((entry) => entry.path)
    .sort()
    .slice(0, MAX_SUGGESTIONS)
}

/** `read_files` not-found list with near-miss hints for the model. */
export function describeMissingPaths(
  files: readonly { path: string }[],
  missing: readonly string[],
  readInBatch: readonly string[],
): string {
  return missing
    .map((path) => {
      const near = closestExistingPaths(files, path)
      if (near.length === 0) return path
      const hints = near.map((candidate) =>
        readInBatch.includes(candidate)
          ? L({
              ko: `${candidate}(이 호출에서 이미 읽음 — 같은 노트라면 누락 아님)`,
              en: `${candidate}(already read in this call — not missing if it is the same note)`,
            })
          : candidate,
      )
      return L({
        ko: `${path} (같은 폴더의 비슷한 실제 경로: ${hints.join(' | ')})`,
        en: `${path} (similar existing paths in the same folder: ${hints.join(' | ')})`,
      })
    })
    .join(', ')
}
