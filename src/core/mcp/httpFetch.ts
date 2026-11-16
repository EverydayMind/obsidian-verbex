import type { FetchLike } from '@modelcontextprotocol/client'

import { nodeBuffer, nodeHttp, nodeHttps } from '../../platform/node/api'
import type { NodeBuffer } from '../../platform/node/buffer'
import type { IncomingMessage } from '../../platform/node/http'
import { runtimeTimers } from '../../platform/runtime'

import * as text from './httpFetchText'

export function validateMcpUrl(value: string): URL {
  const url = new URL(value)
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error(text.urlFormat())
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol === 'http:' && !loopback)
    throw new Error(text.httpsRequired())
  return url
}

/** Desktop Node transport: streams JSON/SSE without renderer CORS or redirects. */
export const mcpHttpFetch: FetchLike = async (input, init) => {
  const source = new Request(input, init)
  const url = validateMcpUrl(source.url)
  const payload = source.body
    ? nodeBuffer().from(await source.arrayBuffer())
    : undefined
  if ((payload?.byteLength ?? 0) > 2 * 1024 * 1024)
    throw new Error(text.requestTooLarge())
  source.signal.throwIfAborted()
  // Obsidian evaluates the CJS bundle in a renderer: native import() uses
  // Chromium's resolver, which cannot load Node builtins. Static imports are
  // bundled as require() and use Obsidian's desktop Node module loader.
  const sendRequest =
    url.protocol === 'https:' ? nodeHttps().request : nodeHttp().request
  const headers = Object.fromEntries(source.headers.entries())
  if (payload) headers['content-length'] = String(payload.byteLength)
  headers['accept-encoding'] = 'identity'
  return new Promise<Response>((resolve, reject) => {
    let incoming: IncomingMessage | undefined
    const request = sendRequest(
      url,
      { method: source.method, headers },
      (response) => {
        incoming = response
        runtimeTimers.clearTimeout(timer)
        const status = response.statusCode ?? 500
        if (status >= 300 && status < 400 && status !== 304) {
          response.resume()
          request.destroy()
          reject(new Error(text.redirect()))
          return
        }
        const responseHeaders = new Headers()
        for (const [key, value] of Object.entries(response.headers)) {
          if (Array.isArray(value))
            value.forEach((item) => responseHeaders.append(key, item))
          else if (value !== undefined) responseHeaders.set(key, value)
        }
        let finished = false
        let bytes = 0
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const fail = (error: Error) => {
              if (finished) return
              finished = true
              controller.error(error)
            }
            response.on('data', (chunk: NodeBuffer) => {
              bytes += chunk.byteLength
              if (bytes > 16 * 1024 * 1024) {
                const error = new Error(text.responseTooLarge())
                fail(error)
                response.destroy(error)
                return
              }
              controller.enqueue(new Uint8Array(chunk))
              if ((controller.desiredSize ?? 0) <= 0) response.pause()
            })
            response.once('end', () => {
              if (!finished) {
                finished = true
                controller.close()
              }
            })
            response.once('error', fail)
            response.once('aborted', () => fail(new Error(text.aborted())))
            response.once('close', () => {
              if (!finished) fail(new Error(text.closed()))
            })
            response.pause()
          },
          pull() {
            response.resume()
          },
          cancel() {
            finished = true
            response.destroy()
          },
        })
        const empty =
          source.method === 'HEAD' || [204, 205, 304].includes(status)
        if (empty) {
          void body.cancel()
          response.resume()
        }
        resolve(
          new Response(empty ? null : body, {
            status,
            headers: responseHeaders,
          }),
        )
      },
    )
    const abort = () => {
      const error = new DOMException('MCP HTTP request aborted', 'AbortError')
      incoming?.destroy(error)
      request.destroy(error)
      reject(error)
    }
    const timer = runtimeTimers.setTimeout(() => {
      request.destroy(new Error(text.timeout()))
    }, 60_000)
    request.once('error', reject)
    request.once('close', () => {
      runtimeTimers.clearTimeout(timer)
      source.signal.removeEventListener('abort', abort)
    })
    source.signal.addEventListener('abort', abort, { once: true })
    if (source.signal.aborted) {
      abort()
      return
    }
    request.end(payload)
  })
}
