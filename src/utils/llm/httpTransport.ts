/*
 * Transport selection:
 * - Non-streaming requests use Obsidian's requestUrl on desktop. It goes
 *   through Electron's network stack, so it bypasses CORS and trusts the OS
 *   certificate store (important behind TLS-inspecting proxies / internal
 *   CAs in air-gapped networks).
 * - Streaming requests use Node's http/https on desktop because requestUrl
 *   does not support streaming. Node ignores the OS certificate store, so
 *   custom CA / verification options can be passed via TlsOptions.
 * - When TlsOptions are set, non-streaming requests also use the Node path
 *   so the options take effect consistently.
 * - Mobile has no Node APIs; callers pass fetchFn there.
 */
import type { IncomingMessage } from 'http'

import { Platform, requestUrl } from 'obsidian'

export type StreamSource = ReadableStream<Uint8Array> | NodeJS.ReadableStream

/**
 * Thrown when the server responds with a non-2xx status. Callers should
 * read the `status` property instead of parsing the error message.
 */
export class HttpRequestError extends Error {
  readonly status: number
  readonly body?: string
  readonly retryAfterMs?: number

  constructor(status: number, body?: string, retryAfterMs?: number) {
    super(`Request failed: ${status}${body ? ` ${body}` : ''}`)
    this.name = 'HttpRequestError'
    this.status = status
    this.body = body
    this.retryAfterMs = retryAfterMs
  }
}

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`)
    this.name = 'RequestTimeoutError'
  }
}

export type TlsOptions = {
  // Additional trusted CA certificates in PEM format. Appended to Node's
  // default root certificates (Node ignores the OS certificate store).
  caCerts?: string[]
  // Disables TLS certificate verification entirely. Last resort for
  // self-signed server certificates; prefer caCerts.
  rejectUnauthorized?: boolean
}

type PostOptions = {
  headers?: Record<string, string>
  signal?: AbortSignal
  fetchFn?: typeof fetch
  tls?: TlsOptions
  timeoutMs?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000

export async function postJson<T>(
  endpoint: string,
  body: unknown,
  options: PostOptions = {},
): Promise<T> {
  const {
    headers,
    signal,
    fetchFn,
    tls,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = options
  const payload = JSON.stringify(body)

  if (fetchFn) {
    const { signal: requestSignal, cleanup } = createRequestSignal(signal)
    try {
      const response = await withTimeout(
        fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(headers ?? {}),
          },
          body: payload,
          signal: requestSignal,
        }),
        timeoutMs,
        cleanup.abort,
      )

      if (!response.ok) {
        throw new HttpRequestError(
          response.status,
          await response.text().catch(() => undefined),
          parseRetryAfterMs(response.headers.get('retry-after')),
        )
      }

      return (await response.json()) as T
    } finally {
      cleanup.detach()
    }
  }

  if (!hasTlsOptions(tls)) {
    // Electron's network stack: bypasses CORS and trusts the OS certificate
    // store. No AbortSignal support — cancellation is best-effort here.
    const response = await withTimeout(
      requestUrl({
        url: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(headers ?? {}),
        },
        body: payload,
        throw: false,
      }),
      timeoutMs,
    )
    if (response.status < 200 || response.status >= 300) {
      throw new HttpRequestError(
        response.status,
        response.text,
        parseRetryAfterMs(getHeader(response.headers, 'retry-after')),
      )
    }
    return response.json as T
  }

  const response = await nodePost(
    endpoint,
    payload,
    headers,
    signal,
    tls,
    timeoutMs,
  )
  const status = response.statusCode ?? 0
  const responseBody = await withTimeout(
    readStreamToString(response),
    timeoutMs,
    () => response.destroy(new RequestTimeoutError(timeoutMs)),
  )
  if (status < 200 || status >= 300) {
    throw new HttpRequestError(
      status,
      responseBody,
      parseRetryAfterMs(getHeader(response.headers, 'retry-after')),
    )
  }

  return JSON.parse(responseBody) as T
}

export async function getJson<T>(
  endpoint: string,
  options: PostOptions = {},
): Promise<T> {
  const {
    headers,
    signal,
    fetchFn,
    tls,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = options

  if (fetchFn) {
    const { signal: requestSignal, cleanup } = createRequestSignal(signal)
    try {
      const response = await withTimeout(
        fetchFn(endpoint, {
          method: 'GET',
          headers: headers ?? {},
          signal: requestSignal,
        }),
        timeoutMs,
        cleanup.abort,
      )

      if (!response.ok) {
        throw new HttpRequestError(
          response.status,
          await response.text().catch(() => undefined),
          parseRetryAfterMs(response.headers.get('retry-after')),
        )
      }

      return (await response.json()) as T
    } finally {
      cleanup.detach()
    }
  }

  if (!hasTlsOptions(tls)) {
    const response = await withTimeout(
      requestUrl({
        url: endpoint,
        method: 'GET',
        headers: headers ?? {},
        throw: false,
      }),
      timeoutMs,
    )
    if (response.status < 200 || response.status >= 300) {
      throw new HttpRequestError(
        response.status,
        response.text,
        parseRetryAfterMs(getHeader(response.headers, 'retry-after')),
      )
    }
    return response.json as T
  }

  const response = await nodeGet(endpoint, headers, signal, tls, timeoutMs)
  const status = response.statusCode ?? 0
  const responseBody = await withTimeout(
    readStreamToString(response),
    timeoutMs,
    () => response.destroy(new RequestTimeoutError(timeoutMs)),
  )
  if (status < 200 || status >= 300) {
    throw new HttpRequestError(
      status,
      responseBody,
      parseRetryAfterMs(getHeader(response.headers, 'retry-after')),
    )
  }

  return JSON.parse(responseBody) as T
}

async function nodeGet(
  endpoint: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
  tlsOptions?: TlsOptions,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<IncomingMessage> {
  if (!Platform.isDesktop) {
    throw new Error('HTTP transport is not available on mobile')
  }

  const http = require('http') as typeof import('http')
  const https = require('https') as typeof import('https')
  const tls = require('tls') as typeof import('tls')
  const url = new URL(endpoint)
  const client = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: headers ?? {},
        // ca replaces Node's default roots, so append to them instead
        ...(tlsOptions?.caCerts?.length
          ? { ca: [...tls.rootCertificates, ...tlsOptions.caCerts] }
          : {}),
        ...(tlsOptions?.rejectUnauthorized === false
          ? { rejectUnauthorized: false }
          : {}),
      },
      (response) => {
        resolve(response)
      },
    )

    let settled = false
    const rejectOnce = (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    }

    request.on('error', (error) => {
      rejectOnce(error)
    })

    request.setTimeout(timeoutMs, () => {
      const timeoutError = new RequestTimeoutError(timeoutMs)
      rejectOnce(timeoutError)
      request.destroy(timeoutError)
    })

    if (signal) {
      const abortError = new Error('Request aborted')
      if (signal.aborted) {
        rejectOnce(abortError)
        request.destroy(abortError)
        return
      }
      const abortHandler = () => {
        rejectOnce(abortError)
        request.destroy(abortError)
      }
      signal.addEventListener('abort', abortHandler, { once: true })
      request.on('close', () => {
        signal.removeEventListener('abort', abortHandler)
      })
    }

    request.end()
  })
}

function hasTlsOptions(tls?: TlsOptions): tls is TlsOptions {
  return Boolean(
    tls && ((tls.caCerts?.length ?? 0) > 0 || tls.rejectUnauthorized === false),
  )
}

export async function postStream(
  endpoint: string,
  body: unknown,
  options: PostOptions = {},
): Promise<StreamSource> {
  const {
    headers,
    signal,
    fetchFn,
    tls,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = options
  const payload = JSON.stringify(body)

  if (fetchFn) {
    const { signal: requestSignal, cleanup } = createRequestSignal(signal)
    try {
      const response = await withTimeout(
        fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(headers ?? {}),
          },
          body: payload,
          signal: requestSignal,
        }),
        timeoutMs,
        cleanup.abort,
      )

      if (!response.ok || !response.body) {
        throw new HttpRequestError(
          response.status,
          response.ok
            ? undefined
            : await response.text().catch(() => undefined),
          parseRetryAfterMs(response.headers.get('retry-after')),
        )
      }

      return response.body
    } finally {
      cleanup.detach()
    }
  }

  const response = await nodePost(
    endpoint,
    payload,
    headers,
    signal,
    tls,
    timeoutMs,
  )
  const status = response.statusCode ?? 0
  if (status < 200 || status >= 300) {
    const responseBody = await readStreamToString(response)
    throw new HttpRequestError(
      status,
      responseBody,
      parseRetryAfterMs(getHeader(response.headers, 'retry-after')),
    )
  }

  return response
}

async function nodePost(
  endpoint: string,
  body: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
  tlsOptions?: TlsOptions,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<IncomingMessage> {
  if (!Platform.isDesktop) {
    throw new Error('HTTP transport is not available on mobile')
  }

  const http = require('http') as typeof import('http')
  const https = require('https') as typeof import('https')
  const tls = require('tls') as typeof import('tls')
  const url = new URL(endpoint)
  const client = url.protocol === 'https:' ? https : http
  const payloadLength = Buffer.byteLength(body)
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': payloadLength.toString(),
    ...(headers ?? {}),
  }

  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: requestHeaders,
        // ca replaces Node's default roots, so append to them instead
        ...(tlsOptions?.caCerts?.length
          ? { ca: [...tls.rootCertificates, ...tlsOptions.caCerts] }
          : {}),
        ...(tlsOptions?.rejectUnauthorized === false
          ? { rejectUnauthorized: false }
          : {}),
      },
      (response) => {
        resolve(response)
      },
    )

    let settled = false
    const rejectOnce = (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    }

    request.on('error', (error) => {
      rejectOnce(error)
    })

    request.setTimeout(timeoutMs, () => {
      const timeoutError = new RequestTimeoutError(timeoutMs)
      rejectOnce(timeoutError)
      request.destroy(timeoutError)
    })

    if (signal) {
      const abortError = new Error('Request aborted')
      if (signal.aborted) {
        rejectOnce(abortError)
        request.destroy(abortError)
        return
      }
      const abortHandler = () => {
        rejectOnce(abortError)
        request.destroy(abortError)
      }
      signal.addEventListener('abort', abortHandler, { once: true })
      request.on('close', () => {
        signal.removeEventListener('abort', abortHandler)
      })
    }

    request.write(body)
    request.end()
  })
}

function createRequestSignal(signal?: AbortSignal): {
  signal: AbortSignal
  cleanup: {
    abort: () => void
    detach: () => void
  }
} {
  const controller = new AbortController()
  if (!signal) {
    return {
      signal: controller.signal,
      cleanup: {
        abort: () => controller.abort(),
        detach: () => undefined,
      },
    }
  }

  if (signal.aborted) {
    controller.abort()
    return {
      signal: controller.signal,
      cleanup: {
        abort: () => controller.abort(),
        detach: () => undefined,
      },
    }
  }

  const abortHandler = () => controller.abort()
  signal.addEventListener('abort', abortHandler, { once: true })
  return {
    signal: controller.signal,
    cleanup: {
      abort: () => controller.abort(),
      detach: () => signal.removeEventListener('abort', abortHandler),
    },
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          onTimeout?.()
          reject(new RequestTimeoutError(timeoutMs))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

async function readStreamToString(
  stream: NodeJS.ReadableStream,
): Promise<string> {
  const chunks: Uint8Array[] = []
  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk))
    } else {
      chunks.push(chunk)
    }
  }
  return Buffer.concat(chunks).toString('utf8')
}

function getHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined
  const exact = headers[name]
  if (Array.isArray(exact)) return exact[0]
  if (exact) return exact

  const lowerName = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) continue
    return Array.isArray(value) ? value[0] : value
  }
  return undefined
}

function parseRetryAfterMs(
  value: string | null | undefined,
): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }

  const dateMs = Date.parse(value)
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now())
  }
  return undefined
}
