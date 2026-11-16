import { t } from '../../i18n'
import { nodeHttp, randomBytes } from '../../platform/node/api'
import { runtimeTimers } from '../../platform/runtime'

export const OAUTH_LOGIN_TIMEOUT_MS = 180_000
/** One-use local callback. Unexpected requests cannot consume a pending login. */
export async function openOAuthCallback(signal: AbortSignal) {
  signal.throwIfAborted()
  const state = randomBytes(32).toString('base64url')
  let resolve!: (params: URLSearchParams) => void
  let reject!: (error: Error) => void
  let settled = false
  const result = new Promise<URLSearchParams>((yes, no) => {
    resolve = yes
    reject = no
  })
  // A browser callback can fail before the caller begins awaiting it.
  void result.catch(() => {})
  let url: URL
  const server = nodeHttp().createServer((request, response) => {
    const params = validateOAuthCallback(
      request.method,
      request.headers.host,
      request.url,
      url,
      state,
    )
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    if (!params || settled) {
      response.writeHead(400)
      response.end('Invalid OAuth callback.')
      return
    }
    response.end(t('runtimeR5.oauthReceived'))
    finish(
      params.has('error') ? new Error(t('runtimeR5.oauthRejected')) : undefined,
      params,
    )
  })
  const finish = (error?: Error, params?: URLSearchParams) => {
    if (settled) return
    settled = true
    runtimeTimers.clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    server.close()
    if (error) server.closeAllConnections?.()
    if (error) reject(error)
    else if (params) resolve(params)
  }
  const abort = () => finish(new Error(t('runtimeR5.oauthCancelled')))
  const timer = runtimeTimers.setTimeout(
    () => finish(new Error(t('runtimeR5.oauthTimeout'))),
    OAUTH_LOGIN_TIMEOUT_MS,
  )
  signal.addEventListener('abort', abort, { once: true })
  try {
    await new Promise<void>((yes, no) => {
      server.once('error', no)
      server.listen(0, '127.0.0.1', yes)
    })
    signal.throwIfAborted()
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error(t('runtimeR5.oauthCallback'))
    url = new URL(`http://127.0.0.1:${address.port}/verbex-oauth/callback`)
    return { url: url.href, state, result, close: abort }
  } catch (error) {
    finish(error as Error)
    throw error
  }
}

export function validateOAuthCallback(
  method: string | undefined,
  host: string | undefined,
  path: string | undefined,
  expected: URL,
  state: string,
): URLSearchParams | undefined {
  if (method !== 'GET' || host !== expected.host || !path || path.length > 8192)
    return undefined
  let url: URL
  try {
    url = new URL(path, expected)
  } catch {
    return undefined
  }
  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.searchParams.getAll('state').length !== 1 ||
    url.searchParams.get('state') !== state
  )
    return undefined
  if (
    url.searchParams.getAll('code').length > 1 ||
    url.searchParams.getAll('iss').length > 1 ||
    (!url.searchParams.get('code') && !url.searchParams.has('error'))
  )
    return undefined
  return url.searchParams
}
