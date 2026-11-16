import type { App } from 'obsidian'

export type ConfigFolders = {
  skillsFolder: string
  workflowsFolder: string
  promptsFolder: string
}

/** Only descendants of configured folders can expose hidden configuration. */
export function isAllowedHiddenConfigPath(
  app: App,
  path: string,
  folders: ConfigFolders,
): boolean {
  let normalized: string
  try {
    normalized = assertUserVaultPath(app, path)
  } catch {
    return false
  }
  const parts = normalized.toLowerCase().split('/')
  if (parts[0] !== '.verbex' || parts.length < 3) return false
  if (
    [
      'runs',
      'batch',
      'index',
      'checkpoints',
      'binary-checkpoints',
      'provider-checkpoints',
      'backups',
    ].includes(parts[1])
  )
    return false
  // Only the three configuration folders; callers may pass the whole settings
  // object, whose other string values must never widen the allowed roots.
  return [
    folders.skillsFolder,
    folders.workflowsFolder,
    folders.promptsFolder,
  ].some((folder) => {
    if (typeof folder !== 'string') return false
    try {
      const root = assertUserVaultPath(app, folder.trim()).toLowerCase()
      return normalized.toLowerCase().startsWith(`${root}/`)
    } catch {
      return false
    }
  })
}

export function assertUserVaultPath(app: App, path: string): string {
  if (
    !path.trim() ||
    /^[\\/]|^[A-Za-z]:/.test(path) ||
    [...path].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error('Invalid Vault path.')
  const parts = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.')
  if (!parts.length || parts.includes('..'))
    throw new Error('Invalid Vault path.')
  const normalized = parts.join('/')
  const config = (app.vault.configDir ?? '.obsidian')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
  const lower = normalized.toLowerCase()
  if (
    ['.obsidian', config].some(
      (root) => root && (lower === root || lower.startsWith(`${root}/`)),
    )
  )
    throw new Error('Agent access to Obsidian configuration paths is denied.')
  return normalized
}
