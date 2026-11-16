import { env, pipeline } from './transformers.web.js'

env.allowRemoteModels = false
env.allowLocalModels = true
env.useBrowserCache = false
env.backends.onnx.wasm.numThreads = 1
let extractor
let queue = Promise.resolve()
const cancelled = new Set()
self.onmessage = ({ data: { id, texts, kind, cancel, base, wasmModule } }) => {
  if (cancel !== undefined) {
    cancelled.add(cancel)
    return
  }
  queue = queue
    .then(async () => {
      if (cancelled.delete(id)) return
      env.localModelPath = `${base}models/`
      env.backends.onnx.wasm.wasmPaths = {
        mjs: wasmModule,
        wasm: `${base}ort-wasm-simd-threaded.jsep.wasm`,
      }
      if (!self.navigator.gpu || !(await self.navigator.gpu.requestAdapter()))
        throw new Error('WebGPU adapter unavailable')
      extractor ||= await pipeline(
        'feature-extraction',
        'multilingual-e5-small',
        { device: 'webgpu', dtype: 'fp16' },
      )
      const vectors = []
      for (const text of texts) {
        if (cancelled.delete(id)) return
        const result = await extractor(`${kind}: ${text}`, {
          pooling: 'mean',
          normalize: true,
        })
        vectors.push(Array.from(result.data))
      }
      if (!cancelled.delete(id)) self.postMessage({ id, vectors })
    })
    .catch((error) =>
      self.postMessage({ id, error: String(error?.message || error) }),
    )
}
self.postMessage({ ready: true })
