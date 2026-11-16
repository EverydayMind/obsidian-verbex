import { App, TFile } from 'obsidian'

import { tokenize } from '../core/rag/bm25'

/**
 * Resolve a folder from a natural-language name. The LLM (or a command) names a
 * folder approximately — e.g. "한-UAE 협정문" — and this maps it to the actual
 * vault folder(s) even when spacing, separators, or surrounding words differ.
 *
 * Folders are derived from the markdown file tree (every ancestor directory of a
 * note) rather than the Obsidian `TFolder` graph, so this works the same in the
 * plugin runtime and in unit tests with a memory vault.
 */

export type FolderMatch = {
  /** Vault-relative folder path (no trailing slash). */
  path: string
  /** Relative match strength; higher is a closer match. */
  score: number
  /** Number of markdown files directly or transitively under the folder. */
  fileCount: number
}

/** Folders below this score are treated as noise and dropped. */
const MIN_FOLDER_SCORE = 30

/** Strip separators/whitespace so "한-UAE 협정문" ≈ "한 UAE  협정문". */
function compact(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\-_/().,]+/g, '')
    .trim()
}

/** Every ancestor directory of a vault-relative file path, excluding root. */
function ancestorDirs(filePath: string): string[] {
  const parts = filePath.split('/')
  parts.pop() // drop the file name
  const dirs: string[] = []
  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    dirs.push(current)
  }
  return dirs
}

/**
 * Map every vault folder to the count of markdown files it contains
 * (transitively). Folders under `.verbex/` are excluded — they hold plugin
 * runtime state, not user notes.
 */
export function collectFolders(
  app: App,
  files?: readonly TFile[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const file of files ?? app.vault.getMarkdownFiles()) {
    if (file.path.startsWith('.verbex/')) {
      continue
    }
    for (const dir of ancestorDirs(file.path)) {
      if (dir.startsWith('.verbex')) {
        continue
      }
      counts.set(dir, (counts.get(dir) ?? 0) + 1)
    }
  }
  return counts
}

function scoreFolder(folderPath: string, query: string): number {
  const basename = folderPath.split('/').pop() ?? folderPath
  const compactQuery = compact(query)
  const compactBase = compact(basename)
  const compactPath = compact(folderPath)
  if (!compactQuery) {
    return 0
  }

  let score = 0

  // Compact-form containment on the folder's own name is the strongest signal.
  if (compactBase === compactQuery) {
    score += 1000
  } else if (compactBase.includes(compactQuery)) {
    // Closer in length → closer match (penalise long folders that merely
    // contain the query as a fragment).
    score += 500 + Math.round((compactQuery.length / compactBase.length) * 200)
  } else if (compactQuery.includes(compactBase)) {
    score += 400 + Math.round((compactBase.length / compactQuery.length) * 200)
  } else if (compactPath.includes(compactQuery)) {
    // The query matches somewhere along the path (e.g. a parent folder).
    score += 250
  }

  // CJK-aware token overlap (shared with BM25) catches reordered or partially
  // matching names where compact containment misses.
  const queryTokens = new Set(tokenize(query))
  if (queryTokens.size > 0) {
    const folderTokens = new Set(tokenize(folderPath))
    let matched = 0
    for (const token of queryTokens) {
      if (folderTokens.has(token)) {
        matched += 1
      }
    }
    score += Math.round((matched / queryTokens.size) * 300)
  }

  // Tie-break toward shallower folders so the canonical top-level folder wins
  // over a deeply nested namesake.
  score -= folderPath.split('/').length

  return score
}

/**
 * Rank vault folders against a natural-language folder name. Returns the closest
 * matches (highest score first), each with its markdown file count, so callers
 * can pick the best match or surface alternatives for disambiguation.
 */
export function resolveFolders(
  app: App,
  query: string,
  limit = 5,
  files?: readonly TFile[],
): FolderMatch[] {
  const counts = collectFolders(app, files)
  const matches: FolderMatch[] = []
  for (const [path, fileCount] of counts) {
    const score = scoreFolder(path, query)
    if (score >= MIN_FOLDER_SCORE) {
      matches.push({ path, score, fileCount })
    }
  }
  matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return matches.slice(0, limit)
}
