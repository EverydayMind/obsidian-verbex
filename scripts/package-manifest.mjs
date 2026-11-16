// Single source for the plugin package contents, shared by package-plugin.mjs
// and verify.mjs so the two cannot drift apart.
export const packageDirectoryName = 'verbex-agent'

export const requiredFiles = [
  'manifest.json',
  'main.js',
  'pglite-worker.js',
  'build-info.json',
  'styles.css',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'postgres.data',
  'postgres.wasm',
  'vector.tar.gz',
  'cl100k_base.json',
]

export const requiredDirectories = ['local-embedding']
