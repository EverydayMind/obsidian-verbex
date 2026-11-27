import { t } from '../../../i18n'
import { canonicalDigest } from '../../../security/promptInjectionBoundary'
import {
  UnsafeValueError,
  copyJson,
  deepFreeze,
  readDataMember,
} from '../descriptorReader'
import { withTimeout } from '../discoveryWait'
import type { JsonValue } from '../protocol'

import {
  type ExtractorVersionValue,
  MEMBER_LIMITS,
  parseExtractTextMember,
} from './extractText'
import {
  type AssetsDescriptorValue,
  type AssetsReason,
  parseAssetsDescriptor,
} from './skillAssets'

const TIMEOUT_LABEL = 'describeAssets timeout'

export type AssetsOutcome =
  | { state: 'absent'; unsupportedVersion?: number }
  | { state: 'ok'; value: AssetsDescriptorValue }
  | { state: 'rejected'; reason: AssetsReason }

export type ExtractTextFacts = {
  version: 1
  extensions: string[]
  extractorVersion: ExtractorVersionValue
}

/** What the host may call in later units; nothing here is called now. */
export type HostMembers = {
  receiver: object
  readAsset: boolean
  ownership: boolean
  /** The extractText member exists but cannot be used (diagnostic fact only). */
  extractTextUnusable?: true
  /** describeAssets() reported a version this host does not know (ignored). */
  assetsUnsupportedVersion?: number
}

export type HostMembersRead = {
  assets: AssetsOutcome
  extractText?: ExtractTextFacts
  hostMembers: HostMembers
}

function readSafely(object: object, key: string): unknown {
  try {
    return readDataMember(object, key)
  } catch {
    return undefined
  }
}

function readExtractText(provider: object): {
  facts?: ExtractTextFacts
  unusable?: true
} {
  let raw: unknown
  try {
    raw = readDataMember(provider, 'extractText')
  } catch {
    return { unusable: true }
  }
  if (raw === undefined) return {}
  const judged = parseExtractTextMember(raw)
  if (!judged.usable) return { unusable: true }
  try {
    const object = raw as object
    if (typeof readDataMember(object, 'extract') !== 'function')
      return { unusable: true }
    const extractorVersion = copyJson(
      readDataMember(object, 'extractorVersion'),
      MEMBER_LIMITS,
    ) as ExtractorVersionValue
    return {
      facts: { version: 1, extensions: judged.extensions, extractorVersion },
    }
  } catch {
    return { unusable: true }
  }
}

async function callDescribeAssets(
  provider: object,
  call: unknown,
  pluginId: string,
  timeoutMs: number,
): Promise<AssetsOutcome> {
  if (typeof call !== 'function') return { state: 'rejected', reason: 'schema' }
  let raw: unknown
  try {
    raw = await withTimeout(
      Promise.resolve().then(() => {
        const result: unknown = Reflect.apply(call, provider, [])
        return result
      }),
      timeoutMs,
      TIMEOUT_LABEL,
    )
  } catch (error) {
    const timedOut = error instanceof Error && error.message === TIMEOUT_LABEL
    return { state: 'rejected', reason: timedOut ? 'timeout' : 'error' }
  }
  const parsed = parseAssetsDescriptor(raw, pluginId)
  if (parsed.ok) return { state: 'ok', value: parsed.value }
  if (parsed.reason === 'unsupported_version')
    return { state: 'absent', unsupportedVersion: parsed.version }
  return { state: 'rejected', reason: parsed.reason }
}

/**
 * Reads the optional host members of a provider object without running
 * provider code, and starts describeAssets() right away so it runs beside
 * describe(). The returned promise never rejects.
 */
export function readHostMembers(
  provider: object,
  pluginId: string,
  timeoutMs: number,
): Promise<HostMembersRead> {
  const extract = readExtractText(provider)
  const ownership = readSafely(provider, 'ownership')
  const hostMembers: HostMembers = {
    receiver: provider,
    readAsset: typeof readSafely(provider, 'readAsset') === 'function',
    ownership:
      !!ownership &&
      typeof ownership === 'object' &&
      typeof readSafely(ownership, 'openDocumentPaths') === 'function',
    ...(extract.unusable ? { extractTextUnusable: true as const } : {}),
  }
  const finish = (assets: AssetsOutcome): HostMembersRead => ({
    assets,
    ...(extract.facts ? { extractText: extract.facts } : {}),
    hostMembers:
      assets.state === 'absent' && assets.unsupportedVersion !== undefined
        ? {
            ...hostMembers,
            assetsUnsupportedVersion: assets.unsupportedVersion,
          }
        : hostMembers,
  })
  let call: unknown
  try {
    call = readDataMember(provider, 'describeAssets')
  } catch (error) {
    if (error instanceof UnsafeValueError)
      return Promise.resolve(
        finish({ state: 'rejected', reason: 'getter_member' }),
      )
    return Promise.resolve(finish({ state: 'rejected', reason: 'error' }))
  }
  if (call === undefined) return Promise.resolve(finish({ state: 'absent' }))
  return callDescribeAssets(provider, call, pluginId, timeoutMs).then(finish)
}

/**
 * The approved definition: the descriptor alone for a provider without the
 * new members (digest and JSON as before), otherwise a wrapped snapshot.
 */
export async function approvalSnapshot(
  descriptor: JsonValue,
  assets?: AssetsDescriptorValue,
  extractText?: Pick<ExtractTextFacts, 'version' | 'extensions'>,
): Promise<{ json: string; digest: string }> {
  const value: unknown =
    !assets && !extractText
      ? descriptor
      : {
          descriptor,
          ...(assets ? { assets } : {}),
          ...(extractText
            ? {
                extractText: {
                  version: extractText.version,
                  extensions: extractText.extensions,
                },
              }
            : {}),
        }
  return { json: JSON.stringify(value), digest: await canonicalDigest(value) }
}

/**
 * The snapshot-derived fields of a discovered provider. Throws when
 * describeAssets() was rejected: the whole provider is refused.
 */
export async function snapshotFields(
  descriptor: JsonValue,
  read: HostMembersRead,
): Promise<{
  descriptorJson: string
  digest: string
  assets?: AssetsDescriptorValue
  extractText?: ExtractTextFacts
  hostMembers: HostMembers
}> {
  if (read.assets.state === 'rejected')
    throw new Error(
      t('nativeProviderR10.assetsRejected', { reason: read.assets.reason }),
    )
  const assets = read.assets.state === 'ok' ? read.assets.value : undefined
  const snapshot = await approvalSnapshot(descriptor, assets, read.extractText)
  return {
    descriptorJson: snapshot.json,
    digest: snapshot.digest,
    ...(assets ? { assets: deepFreeze(assets) } : {}),
    ...(read.extractText ? { extractText: deepFreeze(read.extractText) } : {}),
    hostMembers: read.hostMembers,
  }
}

/** The review-screen parts of a discovered provider's snapshot. */
export function statusSnapshotFields(found: {
  assets?: AssetsDescriptorValue
  extractText?: ExtractTextFacts
}): { assets?: AssetsDescriptorValue; extractTextExtensions?: string[] } {
  return {
    ...(found.assets ? { assets: found.assets } : {}),
    ...(found.extractText
      ? { extractTextExtensions: found.extractText.extensions }
      : {}),
  }
}
