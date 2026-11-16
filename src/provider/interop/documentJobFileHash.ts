import { sha256HexBytes } from '../../utils/hash'

import type { HostContext } from './editorActions'

/** Check before and after reading to bound allocation and reject a growing file. */
export async function documentJobFileHash(
  host: HostContext,
  path: string,
  maxBytes = 32 * 1024 * 1024,
): Promise<string> {
  return sha256HexBytes(await documentJobFileBytes(host, path, maxBytes))
}

export async function documentJobFileBytes(
  host: HostContext,
  path: string,
  maxBytes = 32 * 1024 * 1024,
): Promise<ArrayBuffer> {
  const stat = await host.app.vault.adapter.stat(path)
  if (!stat || stat.type !== 'file' || stat.size > maxBytes)
    throw new Error('File missing or exceeds the size limit.')
  const bytes = await host.app.vault.adapter.readBinary(path)
  if (bytes.byteLength > maxBytes)
    throw new Error('File exceeds the size limit.')
  return bytes
}
