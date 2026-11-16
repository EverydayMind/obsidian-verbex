import { App, normalizePath } from 'obsidian'
import path from 'path-browserify'

export async function ensureVaultDir(app: App, dir: string): Promise<void> {
  const normalized = normalizePath(dir)
  const parts = normalized.split('/').filter(Boolean)
  let current = ''

  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    if (!(await app.vault.adapter.exists(current))) {
      await app.vault.adapter.mkdir(current)
    }
  }
}

export async function writeTextIfMissing(
  app: App,
  filePath: string,
  content: string,
): Promise<boolean> {
  const normalized = normalizePath(filePath)
  const dir = path.dirname(normalized)
  if (dir && dir !== '.') {
    await ensureVaultDir(app, dir)
  }
  if (await app.vault.adapter.exists(normalized)) {
    return false
  }
  await app.vault.adapter.write(normalized, content)
  return true
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function slugifyId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
}
