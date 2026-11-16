import { type App, type TFile, normalizePath } from 'obsidian'

import { L } from '../../i18n/modelText'
import {
  type AuthorizedExecution,
  assertApplyMatches,
  consumeAuthorizedExecution,
} from '../../security/promptInjectionBoundary'
import type { CompositeChange, ProposedChange } from '../../verbex/types'
import { ensureVaultDir } from '../../verbex/vault'

import { noteComposer, noteComposerUnavailable } from './noteComposerPort'
import { observeTidyChanges } from './tidyApplyObserver'
import { assertCompositeCurrent } from './tidyApplyPreflight'
import { assertComposerTargets } from './tidyApplyTargets'
import * as tidyApplyText from './tidyApplyText'
import { type CapturedLinks, captureLinks, readLinks } from './tidyLinkReadback'
import { folderOf } from './tidyVault'

export type CompositeApplyReport = {
  /** Readback facts for the outcome; never a judgment of the text. */
  notes: string[]
  partial: boolean
  links?: { updated: number; unchanged: number; broken: number; total: number }
}

export type CompositeApplier = {
  apply(
    change: ProposedChange,
    execution: AuthorizedExecution,
    context: { runId: string; turnId: string },
  ): Promise<CompositeApplyReport>
}

const lf = (text: string) => text.replace(/\r\n/g, '\n')

/**
 * Applies note tidy composites after StepExecutor's approval and checkpoint.
 * Verbex writes exactly the approved text; link-aware moves are Obsidian's
 * (Note Composer, FileManager.renameFile), observed through vault events.
 */
export class NoteTidyApplier implements CompositeApplier {
  constructor(private app: App) {}

  async apply(
    change: ProposedChange,
    execution: AuthorizedExecution,
    context: { runId: string; turnId: string },
  ): Promise<CompositeApplyReport> {
    // The approved write set must remain the one consumed after hashing.
    change = structuredClone(change)
    context = { ...context }
    const composite = change.composite
    if (!composite)
      throw new Error('Composite apply requires a composite change.')
    assertComposerTargets(composite)
    await assertApplyMatches(execution, change, change.after)
    consumeAuthorizedExecution(execution, context)
    await assertCompositeCurrent(this.app, composite)
    const originalLinks = await captureLinks(this.app, composite)
    const touched = new Set<string>()
    const release = observeTidyChanges(this.app.vault, touched)
    const done: string[] = []
    try {
      await this.run(composite, done)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        done.length
          ? tidyApplyText.completedSteps(message, done.join(', '))
          : message,
      )
    } finally {
      release()
    }
    return this.readback(composite, touched, originalLinks)
  }

  private async run(composite: CompositeChange, done: string[]): Promise<void> {
    const p = composite.params
    switch (composite.operation) {
      case 'write_set':
        for (const entry of composite.entries) {
          if (entry.after === undefined || entry.after === null) continue
          if (entry.before === null) await this.create(entry.path, entry.after)
          else await this.process(entry.path, entry.before, entry.after)
          done.push(entry.path)
        }
        return
      case 'note_merge': {
        const composer = noteComposer(this.app)
        if (!composer) throw new Error(noteComposerUnavailable())
        const source = this.file(String(p.sourcePath))
        const target = this.file(String(p.targetPath))
        const staged = String(p.stagedSource)
        const sourceEntry = composite.entries.find(
          (e) => e.path === source.path,
        )
        if (
          sourceEntry?.before !== undefined &&
          sourceEntry.before !== staged
        ) {
          await this.process(source.path, sourceEntry.before, staged)
          done.push(tidyApplyText.deduplicated(source.path))
        }
        await composer.mergeFile(
          target,
          source,
          p.position === 'prepend' ? 'prepend' : 'append',
        )
        return
      }
      case 'note_extract': {
        const composer = noteComposer(this.app)
        if (!composer) throw new Error(noteComposerUnavailable())
        const source = this.file(String(p.sourcePath))
        const created = await this.create(
          String(p.newPath),
          String(p.newNoteContent),
        )
        done.push(tidyApplyText.created(created.path))
        await composer.extractSection(
          source,
          created,
          Number(p.start),
          Number(p.end),
          'append',
        )
        return
      }
      case 'note_rename': {
        const file = this.file(String(p.path))
        if (typeof p.aliasedContent === 'string') {
          const entry = composite.entries.find(
            (e) => e.originalPath === file.path,
          )
          await this.process(file.path, entry?.before ?? null, p.aliasedContent)
          done.push(tidyApplyText.aliasAdded())
        }
        const folder = folderOf(String(p.newPath))
        if (folder) await ensureVaultDir(this.app, folder)
        await this.app.fileManager.renameFile(file, String(p.newPath))
        return
      }
      case 'file_trash': {
        const config = this.app.vault as typeof this.app.vault & {
          getConfig?: (key: string) => unknown
        }
        if (config.getConfig?.('trashOption') === 'none')
          throw new Error(tidyApplyText.permanentDeleteRefused())
        await this.app.fileManager.trashFile(this.file(String(p.path)))
        return
      }
    }
  }

  private file(path: string): TFile {
    const file = this.app.vault.getFileByPath(normalizePath(path))
    if (!file) throw new Error(`Conflict: "${path}" is missing.`)
    return file
  }

  private async create(path: string, content: string): Promise<TFile> {
    const normalized = normalizePath(path)
    if (this.app.vault.getAbstractFileByPath(normalized))
      throw new Error(`Conflict: "${normalized}" already exists.`)
    const folder = folderOf(normalized)
    if (folder) await ensureVaultDir(this.app, folder)
    return this.app.vault.create(normalized, content)
  }

  private async process(
    path: string,
    before: string | null,
    after: string,
  ): Promise<void> {
    const file = this.file(path)
    await this.app.vault.process(file, (current) => {
      if (before !== null && lf(current) !== lf(before))
        throw new Error(`Conflict: "${path}" changed during apply.`)
      return after
    })
  }

  private async readback(
    composite: CompositeChange,
    touched: Set<string>,
    originalLinks: CapturedLinks,
  ): Promise<CompositeApplyReport> {
    const notes: string[] = []
    let partial = false
    const exists = (path: string) =>
      this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null
    const expected = new Set(
      composite.entries.flatMap((entry) =>
        [entry.path, entry.originalPath].filter(
          (path): path is string => typeof path === 'string',
        ),
      ),
    )
    const configDir = this.app.vault.configDir
    const unexpected = [...touched].filter(
      (path) => !expected.has(path) && !path.startsWith(`${configDir}/`),
    )
    if (unexpected.length)
      notes.push(tidyApplyText.unexpectedChanges(unexpected.join(', ')))
    const { brokenPaths, ...links } = await readLinks(
      this.app,
      composite,
      originalLinks,
    )
    if (links.total) {
      notes.push(tidyApplyText.updatedLinks(links.updated, links.total))
      notes.push(tidyApplyText.linkCounts(links.unchanged, links.broken))
      if (links.broken) {
        partial = true
        notes.push(
          L({
            ko: `새 경로로 해석되는 링크 수가 줄어든 노트: ${brokenPaths.slice(0, 5).join(', ')}${brokenPaths.length > 5 ? ` 외 ${brokenPaths.length - 5}개` : ''}.`,
            en: `Notes with fewer links resolving to the new path: ${brokenPaths.slice(0, 5).join(', ')}${brokenPaths.length > 5 ? tidyApplyText.morePaths(brokenPaths.length - 5) : ''}.`,
          }),
        )
      }
    }
    const p = composite.params
    if (composite.operation === 'file_trash') {
      if (exists(String(p.path))) {
        partial = true
        notes.push(tidyApplyText.sourceStillExists(String(p.path)))
      } else {
        notes.push(tidyApplyText.trashed())
      }
    }
    if (composite.operation === 'note_merge' && exists(String(p.sourcePath))) {
      partial = true
      notes.push(tidyApplyText.sourceStillExists(String(p.sourcePath)))
    }
    if (composite.operation === 'note_rename' && !exists(String(p.newPath))) {
      partial = true
      notes.push(tidyApplyText.newPathMissing(String(p.newPath)))
    }
    if (composite.operation === 'note_extract' && !exists(String(p.newPath))) {
      partial = true
      notes.push(tidyApplyText.newNoteMissing(String(p.newPath)))
    }
    return {
      notes,
      partial,
      links,
    }
  }
}
