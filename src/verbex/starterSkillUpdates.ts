import type { App } from 'obsidian'

import { sha256Hex } from '../utils/hash'

import {
  STARTER_PACKS,
  type StarterFile,
  type StarterFolders,
  type StarterLocale,
  starterFolders,
  starterTarget,
} from './starterAssets'
import editionHashes from './starterEditionHashes.json'

/**
 * A Skill file in the vault that is an unedited copy of an earlier default
 * edition while the plugin now ships a newer one. Installing never replaces
 * an existing file, so such a copy stays old until the person approves the
 * replacement (see replaceStarterSkills).
 */
export type OutdatedStarterSkill = {
  /** The Skill's folder name. */
  skill: string
  /** Vault path of the old copy. */
  path: string
  locale: StarterLocale
  /** The vault text now. */
  current: string
  /** The bundled edition, in the same language. */
  next: string
  /** Stable key for "closed"; it changes when the bundled edition changes. */
  key: string
}

type EditionTable = Record<
  StarterLocale,
  Record<string, readonly string[] | undefined>
>

const LOCALES: readonly StarterLocale[] = ['ko', 'en']
const normalizeLF = (text: string) => text.replace(/\r\n/g, '\n')

/** Bundled Skill files of one language (all sets). */
function bundledSkills(locale: StarterLocale): StarterFile[] {
  return STARTER_PACKS.flatMap((pack) =>
    pack.files[locale].filter((file) => file.kind === 'skill'),
  )
}

async function closeKey(target: string, next: string): Promise<string> {
  const edition = (await sha256Hex(normalizeLF(next))).slice(0, 16)
  return `${target.slice(0, 200)}@${edition}`
}

/**
 * Re-reads one bundled file's target and reports it when it is an unedited
 * old edition of that language. Missing, current, edited and unreadable files
 * are not reported.
 */
export async function detectOutdatedFile(
  app: App,
  folders: StarterFolders,
  locale: StarterLocale,
  file: StarterFile,
  table: EditionTable = editionHashes,
): Promise<OutdatedStarterSkill | null> {
  const old = table[locale][file.path]
  if (!old || old.length === 0) return null
  const target = starterTarget(folders, file)
  const adapter = app.vault.adapter
  let current: string
  try {
    if (!(await adapter.exists(target))) return null
    current = await adapter.read(target)
  } catch {
    return null
  }
  const hash = await sha256Hex(normalizeLF(current))
  if (!old.includes(hash)) return null
  // A hash that is also the current edition is never "old".
  if (hash === (await sha256Hex(normalizeLF(file.content)))) return null
  return {
    skill: file.path.split('/')[0],
    path: target,
    locale,
    current,
    next: file.content,
    key: await closeKey(target, file.content),
  }
}

/**
 * Every default Skill file in the vault that is an unedited old edition and
 * has a newer bundled edition of the same language.
 */
export async function findOutdatedStarterSkills(
  app: App,
  rawFolders: StarterFolders,
  table?: EditionTable,
): Promise<OutdatedStarterSkill[]> {
  let folders: StarterFolders
  try {
    folders = starterFolders(rawFolders)
  } catch {
    return []
  }
  const found = new Map<string, OutdatedStarterSkill>()
  for (const locale of LOCALES)
    for (const file of bundledSkills(locale)) {
      const item = await detectOutdatedFile(app, folders, locale, file, table)
      if (item && !found.has(item.path)) found.set(item.path, item)
    }
  return [...found.values()]
}

/** The bundled file behind a listed item, for a re-check right before a write. */
export function bundledFileFor(
  item: OutdatedStarterSkill,
  folders: StarterFolders,
): StarterFile | undefined {
  return bundledSkills(item.locale).find(
    (file) => starterTarget(folders, file) === item.path,
  )
}

/** The items whose key the person has not closed. */
export const unclosedStarterSkills = (
  items: readonly OutdatedStarterSkill[],
  closed: readonly string[],
) => items.filter((item) => !closed.includes(item.key))

/** The closed list after closing these items (bounded like the setting). */
export const closedAfterClosingSkills = (
  closed: readonly string[],
  items: readonly OutdatedStarterSkill[],
) => [...new Set([...closed, ...items.map((item) => item.key)])].slice(-100)
