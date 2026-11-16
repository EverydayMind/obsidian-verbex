import type { NodeBuffer } from './buffer'

export type NodeReadable = AsyncIterable<string | Uint8Array> & {
  destroy(error?: Error): void
}

export type IncomingMessage = NodeReadable & {
  statusCode?: number
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined> & { host?: string }
  on(event: 'data', listener: (chunk: NodeBuffer) => void): IncomingMessage
  once(event: 'error', listener: (error: Error) => void): IncomingMessage
  once(
    event: 'end' | 'aborted' | 'close',
    listener: () => void,
  ): IncomingMessage
  pause(): void
  resume(): void
}

type ClientRequest = {
  on(event: 'error', listener: (error: Error) => void): ClientRequest
  on(event: 'close', listener: () => void): ClientRequest
  once(event: 'error', listener: (error: Error) => void): ClientRequest
  once(event: 'close', listener: () => void): ClientRequest
  setTimeout(ms: number, callback: () => void): void
  destroy(error?: Error): void
  write(data: string): void
  end(data?: Uint8Array): void
}

type RequestOptions = {
  protocol?: string
  hostname?: string
  port?: number
  path?: string
  method?: string
  headers?: Record<string, string>
  ca?: string[]
  rejectUnauthorized?: boolean
}

type ServerResponse = {
  setHeader(name: string, value: string): void
  writeHead(status: number): void
  end(text: string): void
}
type Server = {
  close(): void
  closeAllConnections?: () => void
  once(event: 'error', listener: (error: Error) => void): void
  listen(port: number, host: string, callback: () => void): void
  address(): { port: number; family: string; address: string } | string | null
}

export type NodeHttp = {
  request: {
    (
      options: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ): ClientRequest
    (
      url: URL,
      options: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ): ClientRequest
  }
  createServer(
    callback: (request: IncomingMessage, response: ServerResponse) => void,
  ): Server
}
