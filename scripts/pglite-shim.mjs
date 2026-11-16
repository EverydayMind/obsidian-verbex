import fs from 'node:fs/promises'

const replacements = [
  [
    "var ENVIRONMENT_IS_WORKER = typeof importScripts == 'function';",
    'var ENVIRONMENT_IS_WORKER = false;',
  ],
  [
    'ASM_CONSTS[start] = eval(func);',
    "throw new Error('Dynamic side-module EM_ASM is unsupported in Verbex');",
  ],
  [
    'moduleExports[name] = eval(func);',
    "throw new Error('Dynamic side-module EM_JS is unsupported in Verbex');",
  ],
]

export function patchMainThreadPostgres(source) {
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) {
      throw new Error(`PGlite 0.2.12 shim target changed: ${before}`)
    }
    source = source.replace(before, after)
  }
  return source
}

export function pgliteShimPlugin({ mainThread = false } = {}) {
  return {
    name: 'pglite-shim-plugin',
    setup(build) {
      build.onLoad({ filter: /@electric-sql[/\\]pglite/ }, async (args) => {
        let source = await fs.readFile(args.path, 'utf8')
        if (mainThread && /[/\\]postgres\.js$/.test(args.path)) {
          source = patchMainThreadPostgres(source)
        }
        // Obsidian's renderer has Node globals but uses browser resource loading.
        return { contents: `const process = {};\n${source}`, loader: 'js' }
      })
    },
  }
}
