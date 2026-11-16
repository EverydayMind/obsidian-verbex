// Main-module EM_JS/EM_ASM are statically implemented in postgres.js. Only
// side-module exports reach loadWebAssemblyModule's dynamic compilation branch.
import fs from 'node:fs'
import zlib from 'node:zlib'
import crypto from 'node:crypto'

const dir = 'node_modules/@electric-sql/pglite/dist/'
const dynamic = (module) =>
  WebAssembly.Module.exports(module).filter(
    ({ name }) => name === '__start_em_asm' || name.startsWith('__em_js__'),
  )
export async function checkPgliteWasm() {
  const version = JSON.parse(
    fs.readFileSync(dir + '../package.json', 'utf8'),
  ).version
  if (version !== '0.2.12') throw new Error(`Review PGlite upgrade: ${version}`)
  const bytes = fs.readFileSync(dir + 'postgres.wasm')
  const main = dynamic(await WebAssembly.compile(bytes))
  const tar = zlib.gunzipSync(fs.readFileSync(dir + 'vector.tar.gz'))
  const sideModules = []
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const name = tar
      .subarray(offset, offset + 100)
      .toString()
      .replace(/\0.*$/s, '')
    if (!name) break
    const size =
      parseInt(
        tar
          .subarray(offset + 124, offset + 136)
          .toString()
          .replace(/\0.*$/s, '')
          .trim(),
        8,
      ) || 0
    const data = tar.subarray(offset + 512, offset + 512 + size)
    if (data.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) {
      const exports = dynamic(await WebAssembly.compile(data))
      if (exports.length)
        throw new Error(
          `Dynamic JavaScript required by ${name}: ${JSON.stringify(exports)}`,
        )
      sideModules.push({
        name,
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
        dynamicExports: exports,
      })
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  if (
    sideModules.length !== 1 ||
    sideModules[0].name !== 'lib/postgresql/vector.so'
  )
    throw new Error('Review changed vector extension archive')
  return {
    version,
    mainModule: {
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      dynamicExports: main,
    },
    sideModules,
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/check-pglite-wasm.mjs')) {
  console.log(JSON.stringify(await checkPgliteWasm(), null, 2))
}
