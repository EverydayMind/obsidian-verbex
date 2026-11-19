import type { App } from 'obsidian'

import { L } from '../i18n/modelText'

/**
 * Documents the user marked "AI-private" in HWP Hands. Verbex never reads their
 * content (or the content of their `.index.md` index note) into model context.
 * The source is registered once at plugin load so pure functions can ask
 * without an `app`. No source registered means nothing is private.
 */
type AiPrivateSource = (path: string) => boolean

let source: AiPrivateSource | null = null

export function setAiPrivateSource(fn: AiPrivateSource | null): void {
  source = fn
}

export function hasAiPrivateSource(): boolean {
  return source !== null
}

/**
 * Fail closed: a source that throws blocks the path. The path is normalized
 * the way Obsidian resolves it, so every caller asks about the same file.
 */
export function isAiPrivatePath(path: string): boolean {
  if (!source) return false
  try {
    const normalized = asVaultPath(path)
    return !!normalized && source(normalized)
  } catch {
    return true
  }
}

type HwpHandsLike = {
  api?: { privacy?: { isBlocked?: (path: string) => unknown } }
  isAiPrivate?: (path: string) => unknown
  aiPrivacyNeedsReview?: () => unknown
}

type VaultLookup = {
  getAbstractFileByPath?: (path: string) => unknown
  // Present in Obsidian; the file system may ignore letter case.
  getAbstractFileByPathInsensitive?: (path: string) => unknown
}

function fileExists(vault: VaultLookup, path: string): boolean {
  return !!(
    vault.getAbstractFileByPath?.(path) ??
    vault.getAbstractFileByPathInsensitive?.(path)
  )
}

const INDEX_NOTE_RE = /^(.*\.hwpx?)\.index\.md$/i
const HWP_DOCUMENT_RE = /\.hwpx?$/i

/**
 * Looks the plugin up on every call, so enabling or disabling HWP Hands is
 * followed without a restart. A missing plugin exposes no list.
 */
export function createHwpHandsPrivacySource(app: App): AiPrivateSource {
  return (path) => {
    const plugin = (
      app as unknown as {
        plugins?: { plugins?: Record<string, HwpHandsLike | undefined> }
      }
    ).plugins?.plugins?.['hwp-hands']
    if (!plugin) return false
    // Only HWP documents and their index notes can be private. Asking about
    // anything else would let a "list needs review" state block every note.
    const document = INDEX_NOTE_RE.exec(path)?.[1] ?? path
    if (!HWP_DOCUMENT_RE.test(document)) return false
    // A path with no file behind it has no content to protect, and a tool may
    // be about to create it; refusing it would state a false fact.
    const vault = (app as unknown as { vault?: VaultLookup }).vault
    if (
      typeof vault?.getAbstractFileByPath === 'function' &&
      !fileExists(vault, path) &&
      !fileExists(vault, document)
    )
      return false
    const privacy = plugin.api?.privacy
    if (typeof privacy?.isBlocked === 'function')
      return privacy.isBlocked(path) === true
    // Older HWP Hands: no index-note mapping and no fail-closed query.
    if (
      typeof plugin.aiPrivacyNeedsReview === 'function' &&
      plugin.aiPrivacyNeedsReview() === true
    )
      return true
    if (typeof plugin.isAiPrivate !== 'function') return false
    return (
      plugin.isAiPrivate(path) === true ||
      (document !== path && plugin.isAiPrivate(document) === true)
    )
  }
}

/**
 * Normalizes a string as a vault path the way Obsidian's `normalizePath` does
 * (one slash between parts, none at either end, ordinary spaces, NFC), after
 * trimming it and dropping a leading `./`. An empty result stays empty.
 */
export function asVaultPath(value: string): string {
  return value
    .trim()
    .replace(/[\\/]+/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\u00A0|\u202F/g, ' ')
    .normalize('NFC')
}

export function aiPrivateRefusalText(): string {
  return L({
    ko: '이 문서는 HWP Hands의 AI 비공개 설정 때문에 읽지 않았습니다(사용자가 비공개로 지정했거나, 비공개 목록에 사용자의 확인이 필요한 상태입니다). 확인과 해제는 사용자가 HWP Hands 설정에서 합니다.',
    en: "This document was not read because of HWP Hands AI-privacy settings (the user marked it private, or the private list needs the user's review). Only the user can review or remove that, in HWP Hands settings.",
  })
}
