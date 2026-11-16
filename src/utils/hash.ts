import { createHash } from '../platform/node/api'
import { runtimeGlobal } from '../platform/runtime'
/**
 * SHA-256 hex digest. Uses Web Crypto (available in Obsidian's Electron/webview
 * runtime) and falls back to Node's crypto for unit tests / older runtimes.
 */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = runtimeGlobal().crypto?.subtle
  if (subtle) {
    const data = new TextEncoder().encode(text)
    const digest = await subtle.digest('SHA-256', data)
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** SHA-256 for binary payloads without converting them through UTF-8 text. */
export async function sha256HexBytes(
  input: Uint8Array | ArrayBuffer,
): Promise<string> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const subtle = runtimeGlobal().crypto?.subtle
  if (subtle) {
    const digest = await subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  return createHash('sha256').update(bytes).digest('hex')
}
