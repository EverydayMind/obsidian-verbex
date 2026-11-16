import { App, TFile } from 'obsidian'

import { runtimeTimers } from '../../../platform/runtime'
import { VerbexSettings } from '../../../settings/schema/setting.types'

import { ChangeEvents } from './changeEvents'
import { deadlineExtraction } from './extractionRequest'
import {
  documentSettings,
  isDocumentPath,
  listDocumentSources,
  shouldIndexSource,
} from './indexableSources'
import { extractIndexText, kordocIndexApi } from './kordocIndexText'
import { buildProjection } from './projection'
import {
  fingerprintDocument,
  relocateProjection,
  reusableProjection,
} from './projectionReuse'
import { DocumentProjectionStore } from './projectionStore'
import { ReconcileWorklist } from './reconcileWorklist'
import { DocumentProjection, IndexTextResult } from './types'

/** One extraction at a time; timed-out work must settle before the next parse. */
export class DocumentExtractionQueue {
  readonly store: DocumentProjectionStore
  settings?: VerbexSettings
  lastReconcile: string | null = null
  private worklist = new ReconcileWorklist()
  get progress() {
    return this.worklist.progress
  }
  private reusable = new Map<string, DocumentProjection>()
  private tail: Promise<void> = Promise.resolve()
  private events = new ChangeEvents()
  subscribe = (listener: () => void) => this.events.subscribe(listener)
  notify = () => this.events.notify()
  private disposed = false
  private active?: AbortController
  private unsettled: Promise<void> = Promise.resolve()
  constructor(readonly app: App) {
    this.store = new DocumentProjectionStore(app)
  }

  configure(settings: VerbexSettings) {
    this.settings = settings
  }
  dispose() {
    this.disposed = true
    this.active?.abort()
  }

  enqueue(
    file: TFile,
    force = false,
    ocr: 'off' | 'candidates' = 'off',
  ): Promise<void> {
    if (
      ocr === 'candidates' &&
      documentSettings(this.settings).ocr !== 'manual'
    )
      return Promise.reject(new Error('Manual OCR is disabled'))
    const work = this.tail.then(async () => {
      await this.unsettled
      await this.extract(file, force, ocr)
    })
    this.tail = work.catch(() => {})
    return work
  }

  async reconcile(forceFailed = false): Promise<void> {
    await this.reconcileSlice(Infinity, forceFailed, true)
  }

  async reconcileSlice(
    budgetMs: number,
    forceFailed = false,
    restart = false,
  ): Promise<boolean> {
    const done = await this.worklist.slice(
      () => listDocumentSources(this.app, this.settings),
      budgetMs,
      restart,
      async (file) => {
        const previous = await this.store.read(file.path)
        if (previous?.sourceSha256)
          this.reusable.set(previous.sourceSha256, previous)
        await this.enqueue(file, forceFailed && previous?.status !== 'ok')
      },
      () => this.disposed,
    )
    if (done) this.lastReconcile = new Date().toISOString()
    return done
  }

  async stats(): Promise<Record<string, number>> {
    return this.store.counts(
      listDocumentSources(this.app, this.settings).map((file) => file.path),
    )
  }

  private async extract(
    file: TFile,
    force: boolean,
    ocr: 'off' | 'candidates',
  ): Promise<void> {
    if (
      this.disposed ||
      !shouldIndexSource(file, this.settings) ||
      !isDocumentPath(file.path)
    )
      return
    const path = file.path
    const stamp = { mtime: file.stat.mtime, size: file.stat.size }
    const previous = await this.store.read(path)
    const version = kordocIndexApi(this.app)?.indexTextExtractor
    const chunkSize = this.settings?.ragOptions.chunkSize ?? 1000
    if (
      !force &&
      previous &&
      previous.sourceStamp.mtime === stamp.mtime &&
      previous.sourceStamp.size === stamp.size &&
      previous.chunkSize === chunkSize &&
      previous.status !== 'extractor_unavailable' &&
      (!version ||
        !previous.extractor ||
        (version.engineVersion === previous.extractor.engineVersion &&
          version.chunkerVersion === previous.extractor.chunkerVersion))
    )
      return
    let sourceHash = ''
    if (
      stamp.size <= 100 * 1024 * 1024 &&
      (force || stamp.size <= documentSettings(this.settings).autoMaxBytes)
    ) {
      sourceHash = await fingerprintDocument(this.app, file).catch(() => '')
      const candidate =
        previous?.sourceSha256 === sourceHash
          ? previous
          : this.reusable.get(sourceHash)
      if (reusableProjection(candidate, version, chunkSize, force, ocr)) {
        if (
          this.disposed ||
          file.path !== path ||
          !this.app.vault.getFileByPath(path) ||
          file.stat.mtime !== stamp.mtime ||
          file.stat.size !== stamp.size
        )
          return
        await this.store.write(relocateProjection(candidate, path, stamp))
        this.notify()
        return
      }
    }
    const control = (this.active = new AbortController())
    const request =
      !force && stamp.size > documentSettings(this.settings).autoMaxBytes
        ? Promise.resolve<IndexTextResult>({
            status: 'too_large_auto',
            message: 'Manual extraction required',
          })
        : extractIndexText(this.app, path, control.signal, ocr)
    const response = await deadlineExtraction(request, control)
    let result = response.result
    this.unsettled = response.settled
    this.active = undefined
    if (
      this.disposed ||
      file.path !== path ||
      !this.app.vault.getFileByPath(path) ||
      file.stat.mtime !== stamp.mtime ||
      file.stat.size !== stamp.size ||
      !shouldIndexSource(file, this.settings)
    )
      return
    if (
      result.status === 'extractor_unavailable' &&
      previous?.status === 'ok' &&
      previous.sourceStamp.mtime === stamp.mtime &&
      previous.sourceStamp.size === stamp.size
    )
      return
    if (
      result.status === 'ok' &&
      (result.sourceStamp.mtime !== stamp.mtime ||
        result.sourceStamp.size !== stamp.size)
    )
      return
    if (
      !force &&
      result.status === 'ok' &&
      (result.pageCount ?? 0) > documentSettings(this.settings).autoMaxPages
    )
      result = {
        status: 'too_large_auto',
        message: 'Manual extraction required',
        pageCount: result.pageCount ?? undefined,
        quality: result.quality,
      }
    if (
      result.status === 'ok' &&
      sourceHash &&
      sourceHash !== result.sourceSha256
    )
      result = {
        status: 'corrupted',
        message: 'Source changed during extraction',
      }
    const unchanged =
      result.status === 'ok' &&
      previous?.status === 'ok' &&
      previous.sourceSha256 === result.sourceSha256 &&
      previous.chunkSize === chunkSize &&
      previous.extractor?.engineVersion === result.extractor.engineVersion &&
      previous.extractor?.chunkerVersion === result.extractor.chunkerVersion &&
      previous.extractor?.ocrApplied === result.extractor.ocrApplied
    const projection = unchanged
      ? { ...previous, sourceStamp: stamp }
      : buildProjection(path, stamp, result, chunkSize)
    projection.sourceSha256 = sourceHash || projection.sourceSha256
    if (!projection.extractor && version)
      projection.extractor = { id: 'kordoc', ...version, ocrApplied: false }
    await this.store.write(projection)
    if (projection.sourceSha256)
      this.reusable.set(projection.sourceSha256, projection)
    this.notify()
    await new Promise<void>((resolve) => runtimeTimers.setTimeout(resolve, 0))
  }
}

const queues = new WeakMap<App, DocumentExtractionQueue>()
export function documentQueue(app: App): DocumentExtractionQueue {
  const queue = queues.get(app) ?? new DocumentExtractionQueue(app)
  queues.set(app, queue)
  return queue
}
