import { App, normalizePath } from 'obsidian'

import { runtimeTimers } from '../../platform/runtime'
import { forwardRejection } from '../../utils/forwardRejection'

import { localE5GpuFiles, localE5RuntimeMissing } from './localE5Runtime'
type Pending = {
  resolve: (vectors: number[][]) => void
  reject: (error: Error) => void
}
let app: App | undefined
let pluginDir: string | undefined
let worker: Worker | undefined
let opening: Promise<Worker> | undefined
let generation = 0
let nextId = 0
const pending = new Map<number, Pending>()
const urls: string[] = []

export function configureLocalE5Gpu(value: App, directory?: string) {
  app = value
  pluginDir = directory
}

export function disposeLocalE5Gpu() {
  generation++
  worker?.terminate()
  worker = undefined
  opening = undefined
  for (const url of urls.splice(0)) URL.revokeObjectURL(url)
  for (const request of pending.values())
    request.reject(new Error('WebGPU runtime stopped'))
  pending.clear()
}

async function startGpuWorker(): Promise<Worker> {
  if (opening) return opening
  if (worker) return worker
  const currentGeneration = generation
  const currentApp = app
  const directory = pluginDir
  if (!currentApp || !directory) throw new Error('WebGPU assets unavailable')
  opening = (async () => {
    const dir = normalizePath(`${directory}/local-embedding`)
    const adapter = currentApp.vault.adapter
    const installed = await Promise.all(
      localE5GpuFiles.map((file) => adapter.exists(`${dir}/${file}`)),
    )
    if (installed.some((exists) => !exists)) throw localE5RuntimeMissing()
    const [source, library, wasmSource] = await Promise.all([
      adapter.read(`${dir}/gpu-worker.mjs`),
      adapter.read(`${dir}/transformers.web.js`),
      adapter.read(`${dir}/ort-wasm-simd-threaded.jsep.mjs`),
    ])
    if (generation !== currentGeneration)
      throw new Error('WebGPU runtime stopped')
    const makeUrl = (text: string) => {
      const url = URL.createObjectURL(
        new Blob([text], { type: 'text/javascript' }),
      )
      urls.push(url)
      return url
    }
    const libraryUrl = makeUrl(library)
    const wasmModule = makeUrl(wasmSource)
    const moduleUrl = makeUrl(
      source.replace('./transformers.web.js', libraryUrl),
    )
    // Electron exposes Node's process in web workers. Transformers.js must
    // detect the browser backend before its module is evaluated.
    const bootstrap = makeUrl(
      `self.process=undefined;await import(${JSON.stringify(moduleUrl)});`,
    )
    const base = new URL('.', adapter.getResourcePath(`${dir}/gpu-worker.mjs`))
      .href
    const current = new Worker(bootstrap, { type: 'module' })
    worker = current
    await new Promise<void>((resolve, reject) => {
      const timer = runtimeTimers.setTimeout(
        () => reject(new Error('WebGPU worker startup timed out')),
        30000,
      )
      current.onmessage = (event: MessageEvent<{ ready?: boolean }>) => {
        if (event.data.ready) {
          runtimeTimers.clearTimeout(timer)
          resolve()
        }
      }
      current.onerror = (event) => {
        runtimeTimers.clearTimeout(timer)
        reject(new Error(event.message || 'WebGPU worker failed'))
      }
    })
    if (generation !== currentGeneration)
      throw new Error('WebGPU runtime stopped')
    current.onmessage = (
      event: MessageEvent<{ id: number; vectors?: number[][]; error?: string }>,
    ) => {
      const request = pending.get(event.data.id)
      if (!request) return
      pending.delete(event.data.id)
      if (event.data.error) request.reject(new Error(event.data.error))
      else if (event.data.vectors) request.resolve(event.data.vectors)
      else request.reject(new Error('Invalid WebGPU response'))
    }
    current.onerror = (event) => {
      const error = new Error(event.message || 'WebGPU worker failed')
      for (const request of pending.values()) request.reject(error)
      pending.clear()
      disposeLocalE5Gpu()
    }
    Object.assign(current, { __e5Base: base, __e5Wasm: wasmModule })
    return current
  })()
    .catch((error) => {
      if (generation === currentGeneration) disposeLocalE5Gpu()
      throw error
    })
    .finally(() => {
      if (generation === currentGeneration) opening = undefined
    })
  return opening
}

export async function embedLocalE5Gpu(
  texts: string[],
  kind: 'query' | 'passage',
  signal?: AbortSignal,
): Promise<number[][]> {
  if (signal?.aborted) throw new Error('Embedding cancelled')
  const current = await startGpuWorker()
  if (signal?.aborted) throw new Error('Embedding cancelled')
  const id = ++nextId
  const resources = current as Worker & { __e5Base: string; __e5Wasm: string }
  return new Promise((resolve, reject) => {
    const timer = runtimeTimers.setTimeout(() => {
      pending.delete(id)
      signal?.removeEventListener('abort', abort)
      reject(new Error('WebGPU inference timed out'))
    }, 120000)
    const finish = () => {
      runtimeTimers.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      pending.delete(id)
      finish()
      current.postMessage({ cancel: id })
      reject(new Error('Embedding cancelled'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    pending.set(id, {
      resolve: (vectors) => {
        finish()
        resolve(vectors)
      },
      reject: (error) => {
        finish()
        reject(error)
      },
    })
    try {
      current.postMessage({
        id,
        texts,
        kind,
        base: resources.__e5Base,
        wasmModule: resources.__e5Wasm,
      })
    } catch (error) {
      pending.delete(id)
      finish()
      forwardRejection(reject, error)
    }
  })
}
