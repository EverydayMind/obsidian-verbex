import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { setTimeout } from 'node:timers/promises'

function build() {
  const result = spawnSync(
    process.execPath,
    ['esbuild.config.mjs', 'production'],
    { stdio: 'inherit' },
  )
  assert.equal(result.status, 0, 'Production build failed')
  const bytes = fs.readFileSync('main.js')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const info = JSON.parse(fs.readFileSync('build-info.json', 'utf8'))
  assert.equal(
    info.finalSha256,
    hash,
    'Build metadata must match the final bundle',
  )
  return { hash, bytes: bytes.length, info }
}

const first = build()
await setTimeout(1100)
const second = build()
assert.deepEqual(
  second,
  first,
  'Production builds from the same tree must be identical',
)
console.log(JSON.stringify(second, null, 2))
if (process.argv[2]) fs.writeFileSync(process.argv[2], second.hash + '\n')
