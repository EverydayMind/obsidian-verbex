import fs from 'fs'
import path from 'path'

import {
  packageDirectoryName,
  requiredFiles,
  requiredDirectories,
} from './package-manifest.mjs'

const root = process.cwd()
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
)
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'),
)
const missing = requiredFiles.filter(
  (file) => !fs.existsSync(path.join(root, file)),
)
missing.push(
  ...requiredDirectories.filter(
    (dir) => !fs.existsSync(path.join(root, dir, 'worker.cjs')),
  ),
)
for (const file of [
  'local-embedding/node.exe',
  'local-embedding/gpu-worker.mjs',
  'local-embedding/transformers.web.js',
  'local-embedding/ort-wasm-simd-threaded.jsep.mjs',
  'local-embedding/ort-wasm-simd-threaded.jsep.wasm',
  'local-embedding/models/multilingual-e5-small/config.json',
  'local-embedding/models/multilingual-e5-small/tokenizer.json',
  'local-embedding/models/multilingual-e5-small/tokenizer_config.json',
  'local-embedding/models/multilingual-e5-small/onnx/model_fp16.onnx',
  'local-embedding/node_modules/@huggingface/transformers/dist/transformers.node.cjs',
  'local-embedding/node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node',
]) {
  if (!fs.existsSync(path.join(root, file))) missing.push(file)
}
if (missing.length > 0) {
  throw new Error(
    `Missing build artifact(s): ${missing.join(', ')}. Run npm.cmd run build first.`,
  )
}

if (manifest.id !== 'verbex') {
  throw new Error(`Expected manifest id "verbex", got "${manifest.id}".`)
}

if (manifest.version !== packageJson.version) {
  throw new Error(
    `Version mismatch: manifest ${manifest.version}, package ${packageJson.version}.`,
  )
}

const packageDir = path.join(root, 'dist', packageDirectoryName)
const legacyPackageDir = path.join(root, 'dist', manifest.id)
if (legacyPackageDir !== packageDir) {
  fs.rmSync(legacyPackageDir, { recursive: true, force: true })
}
fs.rmSync(packageDir, { recursive: true, force: true })
fs.mkdirSync(packageDir, { recursive: true })

for (const file of requiredFiles) {
  fs.copyFileSync(path.join(root, file), path.join(packageDir, file))
}

for (const dir of requiredDirectories) {
  fs.cpSync(path.join(root, dir), path.join(packageDir, dir), {
    recursive: true,
  })
}

const manifestForInstall = {
  id: manifest.id,
  name: manifest.name,
  version: manifest.version,
  minAppVersion: manifest.minAppVersion,
  isDesktopOnly: manifest.isDesktopOnly,
}

const installList = [
  ...requiredFiles,
  ...requiredDirectories.map((dir) => `${dir}/`),
]
  .map((file) => `- ${file}`)
  .join('\n')
fs.writeFileSync(
  path.join(root, 'dist', 'INSTALL.md'),
  [
    `# ${manifest.name} ${manifest.version} manual package`,
    '',
    `New install: copy the files in \`${packageDirectoryName}/\` to:`,
    '',
    `\`.obsidian/plugins/${packageDirectoryName}/\``,
    '',
    `Upgrade: overwrite the files in the folder that already holds this plugin`,
    `(manifest id \`${manifest.id}\`). Do not create a second folder for the same id.`,
    '',
    'Required files:',
    installList,
    '',
    'Manifest check:',
    '```json',
    JSON.stringify(manifestForInstall, null, 2),
    '```',
    '',
  ].join('\n'),
)

// NOTE: this script regenerates dist/ (it is not a read-only check).
console.log(
  `Packaged ${manifest.name} ${manifest.version} into dist/${packageDirectoryName}`,
)
