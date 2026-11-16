import { execFileSync } from 'node:child_process'

/** Build identity uses repository facts only, including when Git is unavailable. */
export function readBuildProvenance(cwd = process.cwd(), run = execFileSync) {
  const git = (...args) =>
    run('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  try {
    const source = git('rev-parse', '--short=12', 'HEAD')
    const dirty =
      git('status', '--porcelain', '--untracked-files=normal').length > 0
    const committedAt = new Date(git('log', '-1', '--format=%cI'))
    return {
      source,
      dirty,
      builtAt: dirty ? 'unknown-dirty' : committedAt.toISOString(),
    }
  } catch {
    return { source: 'unknown', dirty: true, builtAt: 'unknown' }
  }
}
