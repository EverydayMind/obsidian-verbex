import type { App } from 'obsidian'

import { privacyCompatibilityBlock } from '../provider/interop/compatibilityRuntime'
import { readDataMember } from '../provider/interop/descriptorReader'
import {
  type PluginInstance,
  listEnabledPluginInstances,
} from '../provider/interop/discovery'
import { AGENT_CAPABILITY_PROVIDER } from '../provider/interop/protocol'

import {
  type VaultLookup,
  asVaultPath,
  createHwpHandsPrivacySource,
  fileExists,
  setAiPrivateBlockerResolver,
  setAiPrivateSource,
} from './aiPrivatePaths'

/**
 * AI-privacy declared by plugins (host-capabilities-v1 section 4), read from
 * every enabled plugin on every question, uncached; only `false` allows.
 */
const INDEX_NOTE_RE = /^(.*)\.index\.md$/i
const MAX_EXTENSIONS = 32
const MAX_NAME_CHARS = 60

type PrivacyReading =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | {
      kind: 'ok'
      privacy: object
      isBlocked: (path: string) => unknown
      extensions: string[]
    }

function isExtension(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 1 &&
    value.startsWith('.') &&
    value === value.toLowerCase() &&
    !/[/\\\s]/.test(value)
  )
}

function readExtensions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const length = value.length
  if (length < 1 || length > MAX_EXTENSIONS) return undefined
  const found: string[] = []
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    const item: unknown = descriptor?.value
    if (!descriptor || !('value' in descriptor) || !isExtension(item))
      return undefined
    found.push(item)
  }
  return found
}

/** Separate from `readProviderHandle`: a protocol violation elsewhere must not hide this. */
function readPrivacy(plugin: PluginInstance): PrivacyReading {
  try {
    const provider = readDataMember(plugin.instance, AGENT_CAPABILITY_PROVIDER)
    if (typeof provider !== 'object' && typeof provider !== 'function')
      return { kind: 'none' }
    if (provider === null) return { kind: 'none' }
    const privacy = readDataMember(provider, 'privacy')
    if (privacy === undefined) return { kind: 'none' }
    if (
      !privacy ||
      (typeof privacy !== 'object' && typeof privacy !== 'function')
    )
      return { kind: 'invalid' }
    const isBlocked = readDataMember(privacy, 'isBlocked')
    const extensions = readExtensions(readDataMember(privacy, 'extensions'))
    if (typeof isBlocked !== 'function' || !extensions)
      return { kind: 'invalid' }
    return {
      kind: 'ok',
      privacy,
      isBlocked: isBlocked as (path: string) => unknown,
      extensions,
    }
  } catch {
    // An accessor-shaped member cannot be read without running provider code.
    return { kind: 'invalid' }
  }
}

/** Only a plain `false` allows. Everything else, including a thrown error, blocks. */
function providerBlocks(
  reading: Extract<PrivacyReading, { kind: 'ok' }>,
  path: string,
): boolean {
  let answer: unknown
  try {
    answer = reading.isBlocked.call(reading.privacy, path)
  } catch {
    return true
  }
  if (
    answer !== null &&
    (typeof answer === 'object' || typeof answer === 'function')
  )
    // A pending answer is not "allowed", and its rejection must not go unhandled.
    void Promise.resolve(answer).catch(() => undefined)
  return answer !== false
}

function pluginName(plugin: PluginInstance): string {
  let name = plugin.id
  try {
    const manifest = readDataMember(plugin.instance, 'manifest')
    const declared =
      manifest && typeof manifest === 'object'
        ? readDataMember(manifest, 'name')
        : undefined
    if (typeof declared === 'string') name = declared
  } catch {
    // The id is the fallback.
  }
  const clean = name
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_CHARS)
  return clean || plugin.id
}

/**
 * The first enabled plugin whose declared privacy blocks `path`, or undefined.
 * Throws only if the plugin list itself cannot be read; the caller blocks then.
 */
export function findPrivacyBlocker(
  app: App,
  rawPath: string,
): { id: string; name: string; updateNote?: string } | undefined {
  const path = asVaultPath(rawPath)
  if (!path) return undefined
  const original = INDEX_NOTE_RE.exec(path)?.[1]
  const subject = original && /\.[^./]+$/.test(original) ? original : undefined
  const asked = subject ?? path
  const extension = /\.[^./]+$/.exec(asked)?.[0]?.toLowerCase()
  if (!extension) return undefined
  const vault = (app as unknown as { vault?: VaultLookup }).vault
  const missing =
    typeof vault?.getAbstractFileByPath === 'function' &&
    !fileExists(vault, path) &&
    !fileExists(vault, asked)
  if (missing) return undefined
  for (const plugin of listEnabledPluginInstances(app)) {
    const reading = readPrivacy(plugin)
    const stale =
      reading.kind === 'none' &&
      privacyCompatibilityBlock(app, plugin, extension)
    if (stale) return { id: plugin.id, name: pluginName(plugin), ...stale }
    if (reading.kind !== 'ok' || !reading.extensions.includes(extension))
      continue
    if (
      providerBlocks(reading, path) ||
      (subject !== undefined && providerBlocks(reading, subject))
    )
      return { id: plugin.id, name: pluginName(plugin) }
  }
  return undefined
}

/** Plugins whose `privacy` member is present but unusable, for the settings screen. */
export function listPrivacyWarnings(app: App): { id: string; name: string }[] {
  const warnings: { id: string; name: string }[] = []
  for (const plugin of listEnabledPluginInstances(app))
    if (readPrivacy(plugin).kind === 'invalid')
      warnings.push({ id: plugin.id, name: pluginName(plugin) })
  return warnings
}

export function createProviderPrivacySource(app: App) {
  return (path: string): boolean => findPrivacyBlocker(app, path) !== undefined
}

/**
 * Registers plugin-declared privacy together with the older HWP Hands source.
 * Either one blocking blocks; either one failing blocks.
 */
export function installAiPrivacy(app: App): void {
  const provider = createProviderPrivacySource(app)
  const legacy = createHwpHandsPrivacySource(app)
  setAiPrivateSource((path) => provider(path) || legacy(path))
  // Only a plugin-declared block names its plugin (and any update it needs).
  setAiPrivateBlockerResolver((path) => findPrivacyBlocker(app, path))
}

export function uninstallAiPrivacy(): void {
  setAiPrivateSource(null)
  setAiPrivateBlockerResolver(null)
}
