import type { NodeBuffer, NodeBufferConstructor } from './buffer'
import type { NodeHttp } from './http'

// Obsidian's desktop CJS loader and tsx's CJS execution both provide require.
// Keep this declaration local: installed ambient Node types are optional.
declare const require: (id: string) => unknown

type Hash = {
  update(input: string | Uint8Array, encoding?: string): Hash
  digest(encoding: 'hex'): string
}
type NodeCrypto = {
  createHash(algorithm: string): Hash
  randomUUID(): string
  randomBytes(size: number): NodeBuffer
}
type NodePath = {
  join(...parts: string[]): string
  resolve(...parts: string[]): string
  isAbsolute(path: string): boolean
}
type FileHandle = {
  writeFile(data: string, encoding: 'utf8'): Promise<void>
  sync(): Promise<void>
  close(): Promise<void>
}
type NodeFsPromises = {
  readFile(path: string, encoding: 'utf8'): Promise<string>
  open(path: string, flags: string): Promise<FileHandle>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  stat(path: string): Promise<{ isDirectory(): boolean }>
  mkdtemp(prefix: string): Promise<string>
  writeFile(
    path: string,
    data: string,
    options: { encoding: 'utf8'; flag: string },
  ): Promise<void>
}
type NodeFs = {
  promises: NodeFsPromises
  existsSync(path: string): boolean
  readFileSync(path: string, encoding: 'utf8'): string
}
export type ChildProcess = {
  kill(): boolean
  send(message: object): boolean
  on(
    event: 'message',
    callback: (message: {
      id: number
      vectors?: number[][]
      error?: string
    }) => void,
  ): void
  on(event: 'error', callback: (error: Error) => void): void
  on(event: 'exit', callback: (code: number | null) => void): void
}
type NodeChildProcess = {
  fork(
    module: string,
    args: string[],
    options: {
      execPath: string
      env: Record<string, string | undefined>
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
      windowsHide?: boolean
    },
  ): ChildProcess
}
type NodeProcess = {
  platform: string
  arch: string
  env: Record<string, string | undefined>
  versions: { node: string }
}
type Modules = {
  crypto: NodeCrypto
  buffer: { Buffer: NodeBufferConstructor }
  fs: NodeFs
  path: NodePath
  http: NodeHttp
  https: Pick<NodeHttp, 'request'>
  tls: { rootCertificates: readonly string[] }
  child_process: NodeChildProcess
  process: NodeProcess
}

function load<K extends keyof Modules>(name: K): Modules[K] {
  // One typed boundary to the desktop loader. Loading stays at the point of use.
  return require(name) as Modules[K]
}

export const nodeBuffer = () => load('buffer').Buffer
export const nodeFs = () => load('fs')
export const nodePath = () => load('path')
export const nodeHttp = () => load('http')
export const nodeHttps = () => load('https')
export const nodeTls = () => load('tls')
export const nodeProcess = () => load('process')
export function optionalNodeProcess(): NodeProcess | undefined {
  try {
    return nodeProcess()
  } catch {
    return undefined
  }
}
export const createHash = (algorithm: string) =>
  load('crypto').createHash(algorithm)
export const randomUUID = () => load('crypto').randomUUID()
export const randomBytes = (size: number) => load('crypto').randomBytes(size)
export const fork: NodeChildProcess['fork'] = (...args) =>
  load('child_process').fork(...args)
export const existsSync = (path: string) => load('fs').existsSync(path)
export const join = (...parts: string[]) => load('path').join(...parts)
