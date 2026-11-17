import manifest from '../../../manifest.json'
import { L } from '../../i18n/modelText'
import { join } from '../../platform/node/api'

const modelFiles = [
  'models/multilingual-e5-small/config.json',
  'models/multilingual-e5-small/tokenizer.json',
  'models/multilingual-e5-small/tokenizer_config.json',
  'models/multilingual-e5-small/onnx/model_fp16.onnx',
]

export const localE5CpuFiles = [
  'node.exe',
  'worker.cjs',
  'node_modules/@huggingface/transformers/dist/transformers.node.cjs',
  'node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node',
  ...modelFiles,
]

export const localE5GpuFiles = [
  'gpu-worker.mjs',
  'transformers.web.js',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  ...modelFiles,
]

export class LocalEmbeddingRuntimeMissingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocalEmbeddingRuntimeMissingError'
  }
}

export function isLocalE5RuntimeInstalled(
  pluginDir: string,
  exists: (path: string) => boolean,
  platform: string,
  arch: string,
): boolean {
  return (
    platform === 'win32' &&
    arch === 'x64' &&
    localE5CpuFiles.every((file) =>
      exists(join(pluginDir, 'local-embedding', file)),
    )
  )
}

export function localE5RuntimeMissing(): LocalEmbeddingRuntimeMissingError {
  const archive = `verbex-${manifest.version}-offline-windows-x64.zip`
  return new LocalEmbeddingRuntimeMissingError(
    L({
      ko: `로컬 임베딩 런타임이 설치되어 있지 않습니다. 플러그인 릴리스 페이지에서 ${archive} 파일을 다운로드하여 플러그인 폴더에 압축을 풀거나, 설정에서 다른 임베딩 모델을 선택하세요.`,
      en: `Local embedding runtime is not installed. Download ${archive} from the plugin's release page and extract it into the plugin folder, or select another embedding model in settings.`,
    }),
  )
}
