import { App, normalizePath } from 'obsidian'

import {
  AuthorizedExecution,
  assertApplyMatches,
  consumeAuthorizedExecution,
} from '../security/promptInjectionBoundary'
import { assertUserVaultPath } from '../security/vaultPathPolicy'
import { sha256HexBytes } from '../utils/hash'
import { ProposedChange } from '../verbex/types'
import { ensureVaultDir } from '../verbex/vault'

import { binaryDependencyConflict } from './binaryDependencies'

/**
 * Applies an approved {@link ProposedChange} to the vault. Runs only after a
 * checkpoint has been written (see StepExecutor), so it never needs to keep a
 * backup itself.
 */
export type ChangeApplier = {
  apply(
    change: ProposedChange,
    content: string | null,
    execution: AuthorizedExecution,
    context: { runId: string; turnId: string },
  ): Promise<void>
  /**
   * Current content of a vault file, or null when it does not exist. Used for
   * optimistic-lock conflict detection just before applying (see StepExecutor).
   */
  readCurrent(path: string): Promise<string | null>
  readByteHash?(
    path: string,
    budget?: { remainingBytes: number },
  ): Promise<string | null>
}

export class VaultChangeApplier implements ChangeApplier {
  constructor(
    private app: App,
    private onApplied?: (...paths: string[]) => void,
  ) {}

  async readByteHash(
    path: string,
    budget = { remainingBytes: 128 * 1024 * 1024 },
  ): Promise<string | null> {
    const normalized = assertUserVaultPath(this.app, path)
    if (!(await this.app.vault.adapter.exists(normalized))) return null
    const stat = await this.app.vault.adapter.stat(normalized)
    if (!stat || stat.type !== 'file' || stat.size > budget.remainingBytes)
      throw new Error(
        'Binary source read exceeds byte budget or is not a file.',
      )
    const bytes = await this.app.vault.adapter.readBinary(normalized)
    if (bytes.byteLength > budget.remainingBytes)
      throw new Error('Binary source read exceeds byte budget.')
    budget.remainingBytes -= bytes.byteLength
    return sha256HexBytes(new Uint8Array(bytes))
  }

  async readCurrent(path: string): Promise<string | null> {
    const normalized = assertUserVaultPath(this.app, path)
    if (!(await this.app.vault.adapter.exists(normalized))) return null
    return this.app.vault.adapter.read(normalized)
  }

  async apply(
    change: ProposedChange,
    content: string | null,
    execution: AuthorizedExecution,
    context: { runId: string; turnId: string },
  ): Promise<void> {
    // Freeze the target and preconditions before the asynchronous fingerprint
    // check; the caller may still hold the original proposal object.
    change = structuredClone(change)
    context = { ...context }
    assertUserVaultPath(this.app, change.path)
    if (change.originalPath) assertUserVaultPath(this.app, change.originalPath)
    if (
      execution.phase !== 'apply' ||
      execution.descriptor.path !== normalizePath(change.path)
    ) {
      throw new Error(
        'Apply execution permit does not match the proposed change.',
      )
    }
    await assertApplyMatches(execution, change, content)
    consumeAuthorizedExecution(execution, context)
    const dependencyConflict = await binaryDependencyConflict(change, this)
    if (dependencyConflict) throw new Error(dependencyConflict)
    switch (change.op) {
      case 'delete': {
        await this.removeIfExists(change.path)
        this.onApplied?.(change.path)
        return
      }
      case 'rename':
      case 'move': {
        // Write to the new path first so the source file is never removed
        // before a successful destination write. If the write throws (bad path,
        // permissions, disk full), the original file is left untouched.
        await this.write(change.path, content ?? '')
        if (change.originalPath && change.originalPath !== change.path) {
          await this.removeIfExists(change.originalPath)
        }
        this.onApplied?.(
          change.path,
          ...(change.originalPath ? [change.originalPath] : []),
        )
        return
      }
      case 'create':
      case 'modify': {
        await this.writeAtomically(change.path, content ?? '', change.before)
        this.onApplied?.(change.path)
        return
      }
    }
  }

  private async write(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path)
    const dir = normalized.split('/').slice(0, -1).join('/')
    if (dir) await ensureVaultDir(this.app, dir)
    await this.app.vault.adapter.write(normalized, content)
  }

  private async writeAtomically(
    path: string,
    content: string,
    expectedBefore: string | null,
  ): Promise<void> {
    const normalized = normalizePath(path)
    const existing = await this.app.vault.adapter.exists(normalized)
    if (expectedBefore === null) {
      if (existing) throw new Error(`Conflict: "${normalized}" already exists.`)
      await this.write(normalized, content)
      return
    }
    const file = this.app.vault.getFileByPath
      ? this.app.vault.getFileByPath(normalized)
      : null
    if (!file) {
      const current = await this.app.vault.adapter.read(normalized)
      if (
        current.replace(/\r\n/g, '\n') !== expectedBefore.replace(/\r\n/g, '\n')
      ) {
        throw new Error(`Conflict: "${normalized}" changed during apply.`)
      }
      await this.write(normalized, content)
      return
    }
    const vault = this.app.vault
    if (typeof vault.process !== 'function') {
      const current = await this.app.vault.adapter.read(normalized)
      if (
        current.replace(/\r\n/g, '\n') !== expectedBefore.replace(/\r\n/g, '\n')
      ) {
        throw new Error(`Conflict: "${normalized}" changed during apply.`)
      }
      await this.write(normalized, content)
      return
    }
    await vault.process(file, (current: string) => {
      if (
        current.replace(/\r\n/g, '\n') !== expectedBefore.replace(/\r\n/g, '\n')
      ) {
        throw new Error(`Conflict: "${normalized}" changed during apply.`)
      }
      return content
    })
  }

  private async removeIfExists(path: string): Promise<void> {
    const normalized = normalizePath(path)
    if (await this.app.vault.adapter.exists(normalized)) {
      await this.app.vault.adapter.remove(normalized)
    }
  }
}
