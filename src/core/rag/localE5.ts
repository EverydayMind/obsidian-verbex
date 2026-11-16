import { ChildProcess, fork } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

import { LOCAL_E5_FP16_MODEL_ID } from '../../constants'
import { EmbeddingModelClient } from '../../types/embedding'
import { forwardRejection } from '../../utils/forwardRejection'

import { disposeLocalE5Gpu, embedLocalE5Gpu } from './localE5Gpu'
import { localE5CpuFiles, localE5RuntimeMissing } from './localE5Runtime'

let directory: string | undefined
let worker: ChildProcess | undefined
let nextId = 0
let gpuFailed = false
let lastDevice: 'cpu' | 'webgpu' = 'cpu'
let gpuValidation: Promise<void> | undefined
const pending = new Map<
  number,
  { resolve: (value: number[][]) => void; reject: (error: Error) => void }
>()

export function configureLocalE5(pluginDirectory: string) {
  directory = pluginDirectory
}

export function disposeLocalE5() {
  disposeLocalE5Gpu()
  gpuFailed = false
  gpuValidation = undefined
  lastDevice = 'cpu'
  const previous = worker
  worker = undefined
  directory = undefined
  for (const request of pending.values())
    request.reject(new Error('Local embedding runtime stopped'))
  pending.clear()
  previous?.kill()
}

function startWorker(): ChildProcess {
  if (worker) return worker
  if (!directory) throw new Error('Local embedding runtime is unavailable')
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('The bundled local embedding runtime requires Windows x64')
  }
  const runtimeDirectory = join(directory, 'local-embedding')
  if (
    !localE5CpuFiles.every((file) => existsSync(join(runtimeDirectory, file)))
  )
    throw localE5RuntimeMissing()
  const current = fork(join(directory, 'local-embedding', 'worker.cjs'), [], {
    execPath: join(directory, 'local-embedding', 'node.exe'),
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    ...({ windowsHide: true } as object),
  })
  worker = current
  current.on(
    'message',
    (message: { id: number; vectors?: number[][]; error?: string }) => {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error))
      else if (message.vectors) request.resolve(message.vectors)
      else request.reject(new Error('Invalid local embedding response'))
    },
  )
  const fail = (error: Error) => {
    if (worker !== current) return
    worker = undefined
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }
  current.on('error', fail)
  current.on('exit', (code) =>
    fail(new Error(`Local embedding worker exited (${String(code)})`)),
  )
  return current
}

function embed(
  texts: string[],
  kind: 'query' | 'passage',
  signal?: AbortSignal,
): Promise<number[][]> {
  if (signal?.aborted) return Promise.reject(new Error('Embedding cancelled'))
  if (!texts.length) return Promise.resolve([])
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const abort = () => {
      pending.delete(id)
      worker?.send({ cancel: id })
      reject(new Error('Embedding cancelled'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    const finish = () => signal?.removeEventListener('abort', abort)
    pending.set(id, {
      resolve: (value) => {
        finish()
        resolve(value)
      },
      reject: (error) => {
        finish()
        reject(error)
      },
    })
    try {
      startWorker().send({ id, texts, kind })
    } catch (error) {
      pending.delete(id)
      finish()
      forwardRejection(reject, error)
    }
  })
}

// Do not mix vectors from runtimes whose kernels disagree. This is
// a narrow compatibility check, not a retrieval quality benchmark.
async function validateGpu(signal?: AbortSignal): Promise<void> {
  if (!gpuValidation) {
    const check = (async () => {
      for (const [kind, text] of [
        ['query', 'Seoul weather and local search'],
        ['passage', 'A short multilingual document about Seoul weather'],
      ] as const) {
        const gpu = (await embedLocalE5Gpu([text], kind, signal))[0]
        const cpu = (await embed([text], kind, signal))[0]
        if (!gpu || !cpu || gpu.length !== 384 || cpu.length !== 384)
          throw new Error('WebGPU compatibility check returned invalid vectors')
        let dot = 0,
          a = 0,
          b = 0
        for (let i = 0; i < 384; i++) {
          dot += gpu[i] * cpu[i]
          a += gpu[i] ** 2
          b += cpu[i] ** 2
        }
        if (!Number.isFinite(dot) || !a || !b || dot / Math.sqrt(a * b) < 0.999)
          throw new Error('WebGPU output differs from CPU output')
      }
    })()
    const tracked = check.catch((error) => {
      if (gpuValidation === tracked) gpuValidation = undefined
      throw error
    })
    gpuValidation = tracked
  }
  await gpuValidation
}

export function getLocalE5Client(
  device: 'cpu' | 'webgpu' = 'cpu',
): EmbeddingModelClient {
  if (device !== lastDevice) {
    disposeLocalE5Gpu()
    gpuFailed = false
    gpuValidation = undefined
    lastDevice = device
  }
  const request = async (
    texts: string[],
    kind: 'query' | 'passage',
    signal?: AbortSignal,
  ) => {
    if (device === 'webgpu' && !gpuFailed) {
      try {
        await validateGpu(signal)
        const vectors = await embedLocalE5Gpu(texts, kind, signal)
        if (
          vectors.length !== texts.length ||
          vectors.some(
            (vector) =>
              vector.length !== 384 ||
              vector.some((value) => !Number.isFinite(value)),
          )
        )
          throw new Error('Invalid WebGPU vector')
        return vectors
      } catch (error) {
        if (signal?.aborted) throw error
        gpuFailed = true
        gpuValidation = undefined
        disposeLocalE5Gpu()
        console.warn('Local E5 WebGPU unavailable; using CPU', error)
      }
    }
    return embed(texts, kind, signal)
  }
  return {
    id: LOCAL_E5_FP16_MODEL_ID,
    dimension: 384,
    getEmbedding: async (text, options) =>
      (await request([text], 'query', options?.signal))[0],
    getEmbeddings: (texts, options) =>
      request(texts, 'passage', options?.signal),
  }
}
