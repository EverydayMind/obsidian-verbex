import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export function forbiddenPath(file) {
  return /(^|\/)(docs|samples|node_modules|dist|__mocks__|__fixtures__|__golden__)(\/|$)|(^|\/)(AGENTS\.md|CLAUDE\.md|CONTRIBUTING\.md|DEVELOPMENT\.md|main\.js|pglite-worker\.js|data\.json)$|\.test\.[^/]+$|\.map$|(^|\/)[^/]*(plan|review)[^/]*\.md$/i.test(
    file,
  )
}

const [manifest, pkg, versions] = [
  'manifest.json',
  'package.json',
  'versions.json',
].map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
if (
  manifest.id !== 'verbex' ||
  pkg.name !== 'obsidian-verbex' ||
  pkg.version !== manifest.version ||
  versions[manifest.version] !== manifest.minAppVersion ||
  (process.argv[2] && process.argv[2] !== manifest.version)
) {
  throw new Error('Release metadata or tag mismatch')
}
const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim()
// Windows reports the drive letter in either case depending on the shell.
const samePath = (a, b) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
if (!samePath(path.resolve(gitRoot), process.cwd())) {
  throw new Error('Run check:release at the public Git checkout root')
}
const tracked = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)
const forbidden = tracked.filter(forbiddenPath)
if (forbidden.length) {
  throw new Error(`Forbidden tracked files:\n${forbidden.join('\n')}`)
}
console.log('Release metadata and tracked-file checks passed.')
