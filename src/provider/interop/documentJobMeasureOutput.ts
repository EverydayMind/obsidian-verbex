import { measureStyle } from '../../core/report-style/kordocStyleApi'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'
import { sha256HexBytes } from '../../utils/hash'
import { KORDOC_PROVIDER_ID } from '../contract'

import { readDataMember } from './descriptorReader'
import type { HostContext } from './editorActions'
import { callProvider } from './providerCall'

export async function hashJobOutput(
  host: HostContext,
  path: string,
): Promise<string> {
  if (host.vaultPath(path) !== path) throw new Error('Invalid output path.')
  const stat = await host.app.vault.adapter.stat(path)
  if (!stat || stat.type !== 'file' || stat.size > 32 * 1024 * 1024)
    throw new Error('Output unavailable or too large.')
  const bytes = await host.app.vault.adapter.readBinary(path)
  if (bytes.byteLength > 32 * 1024 * 1024) throw new Error('Output too large.')
  return sha256HexBytes(bytes)
}

/** Approved KORDOC read, bound to the committed output bytes and provider identity. */
export async function measureJobOutput(
  host: HostContext,
  input: {
    path: string
    expectedSha256: string
    runId: string
    turnId: string
    signal?: AbortSignal
  },
) {
  const path = host.vaultPath(input.path)
  if (path !== input.path || !/^[a-f0-9]{64}$/.test(input.expectedSha256))
    throw new Error('Invalid output identity.')
  const diskHash = () => hashJobOutput(host, path)
  if ((await diskHash()) !== input.expectedSha256)
    throw new Error('Output changed before measurement.')
  await host.refresh(input.signal)
  const id = KORDOC_PROVIDER_ID,
    found = host.getActiveDiscovered(id)
  if (!found || !host.isCurrent(id))
    throw new Error('Approved KORDOC unavailable.')
  const readApi = () => {
    const api = readDataMember(found.handle.plugin, 'api')
    const style =
      api && typeof api === 'object'
        ? readDataMember(api, 'styleProfile')
        : undefined
    if (
      !style ||
      typeof style !== 'object' ||
      readDataMember(style, 'version') !== 1
    )
      return undefined
    const extract = readDataMember(style, 'extract')
    return typeof extract === 'function'
      ? { style, extract: extract as (...args: unknown[]) => unknown }
      : undefined
  }
  const api = readApi()
  if (!api) throw new Error('KORDOC style measurement unavailable.')
  const current = () => {
    const now = host.getActiveDiscovered(id),
      live = readApi()
    return (
      !input.signal?.aborted &&
      host.isCurrent(id) &&
      now?.handle.provider === found.handle.provider &&
      now.digest === found.digest &&
      now.generation === found.generation &&
      live?.style === api.style &&
      live.extract === api.extract
    )
  }
  const name = `plg__${id}__measureJobOutput`,
    destination = `plugin://${id}/styleProfile/extract`
  const args = { path, expectedSha256: input.expectedSha256 }
  const providerIdentity = {
    serverConfigHash: found.digest,
    connectionGeneration: found.generation,
    toolSchemaHash: await canonicalDigest({ version: 1, operation: 'extract' }),
  }
  const permit = await issueLocalPluginCallPermit({
    name,
    args,
    runId: input.runId,
    turnId: input.turnId,
    ...providerIdentity,
    destination,
  })
  await assertExternalCallMatches(permit, {
    name,
    args,
    destination,
    effect: 'vaultRead',
    providerIdentity,
  })
  if (!current() || host.busy.has(id))
    throw new Error('KORDOC measurement unavailable or busy.')
  consumeAuthorizedExecution(permit, {
    runId: input.runId,
    turnId: input.turnId,
  })
  const result = await callProvider({
    app: host.app,
    busy: host.busy,
    providerId: id,
    signal: input.signal,
    timeoutMs: Math.min(host.callTimeoutMs ?? 30000, 30000),
    invoke: (signal) => {
      if (!current()) throw new Error('KORDOC changed before measurement.')
      return Reflect.apply(api.extract, api.style, [{ ...args, signal }])
    },
  })
  if (!current() || result.vaultEvents)
    throw new Error('Measurement stale or Vault mutation observed.')
  const measured = await measureStyle(
    { version: 1, extract: async () => result.raw, inspect: async () => ({}) },
    path,
    input.expectedSha256,
    input.signal,
  )
  if (!current() || (await diskHash()) !== input.expectedSha256 || !current())
    throw new Error('Output or KORDOC changed during measurement.')
  return measured
}
