import { App, normalizePath } from 'obsidian'

import { VERBEX_DIR } from '../constants'
import { AbstractJsonRepository } from '../database/json/base'
import {
  JsonRecordError,
  assertSupportedVersion,
  isPlainObject,
} from '../database/json/recordCodec'
import { redactSecrets } from '../utils/llm/redact'
import { VerbexRunState } from '../verbex/types'
import { nowIso } from '../verbex/vault'

import { RunArtifactStore } from './RunArtifactStore'

type RunStateMetadata = {
  runId: string
}

export class RunStateRepository extends AbstractJsonRepository<
  VerbexRunState,
  RunStateMetadata
> {
  // Returns the secret values (e.g. provider API keys) that must never be
  // persisted to Run State files. Defaults to none.
  private getSecrets: () => string[]

  constructor(app: App, getSecrets: () => string[] = () => []) {
    super(app, `${VERBEX_DIR}/Runs`)
    this.getSecrets = getSecrets
  }

  // Defensive scrub: removes any configured secret from the serialized run
  // before it is written, so chat history / logs / artifacts can never leak
  // an API key onto disk.
  private redactRun(run: VerbexRunState): VerbexRunState {
    const secrets = this.getSecrets()
    if (secrets.length === 0) {
      return run
    }
    return JSON.parse(
      redactSecrets(JSON.stringify(run), secrets),
    ) as VerbexRunState
  }

  protected generateFileName(row: VerbexRunState): string {
    return `${row.id}.json`
  }

  protected parseFileName(fileName: string): RunStateMetadata | null {
    const match = fileName.match(/^(run-[^.]+)\.json$/)
    return match ? { runId: match[1] } : null
  }

  // Accepts legacy (v1 / unversioned) runs; read() migrates them afterwards.
  protected override validateRecord(
    value: unknown,
    fileName: string,
  ): VerbexRunState {
    if (
      !isPlainObject(value) ||
      typeof value.id !== 'string' ||
      typeof value.status !== 'string' ||
      typeof value.updatedAt !== 'string' ||
      !isPlainObject(value.artifacts) ||
      (value.schemaVersion !== undefined &&
        typeof value.schemaVersion !== 'number')
    ) {
      throw new JsonRecordError('invalid', fileName)
    }
    assertSupportedVersion(value.schemaVersion, 2, fileName)
    return value as unknown as VerbexRunState
  }

  override async read(fileName: string): Promise<VerbexRunState | null> {
    const persisted = (await super.read(fileName)) as
      | (Omit<VerbexRunState, 'schemaVersion'> & { schemaVersion?: number })
      | null
    if (!persisted) return null
    if (!RunArtifactStore.needsMigration(persisted)) {
      return persisted as VerbexRunState
    }
    const migrated = RunArtifactStore.migrateRunState(persisted)
    await super.update(persisted as VerbexRunState, migrated)
    return migrated
  }

  // Serializes every write to the same run so a read-modify-write can never
  // interleave with another one (in-process only; there is no adapter CAS, so
  // an external writer such as a sync client is not excluded).
  private runLocks = new Map<string, Promise<unknown>>()

  private withRunLock<R>(runId: string, task: () => Promise<R>): Promise<R> {
    const previous = this.runLocks.get(runId) ?? Promise.resolve()
    // A failed earlier save must not wedge the queue for this run.
    const next = previous.catch(() => undefined).then(task)
    this.runLocks.set(runId, next)
    const clear = () => {
      if (this.runLocks.get(runId) === next) this.runLocks.delete(runId)
    }
    next.then(clear, clear)
    return next
  }

  private async persist(run: VerbexRunState): Promise<VerbexRunState> {
    const existing = await this.read(`${run.id}.json`)
    const updated = this.redactRun({ ...run, updatedAt: nowIso() })
    if (existing) {
      await this.update(existing, updated)
    } else {
      await this.create(updated)
    }
    return updated
  }

  /** Replaces the whole run. Prefer updateRun for read-modify-write. */
  async saveRun(run: VerbexRunState): Promise<VerbexRunState> {
    return this.withRunLock(run.id, () => this.persist(run))
  }

  /**
   * Latest-read, mutate, save: all inside the per-run lock, so concurrent
   * updates each see the previous one's result. `mutate` must be synchronous
   * and free of side effects (it must not call back into this repository).
   * Returning null skips the write. Resolves to the saved run (or null).
   */
  async updateRun(
    runId: string,
    mutate: (latest: VerbexRunState | null) => VerbexRunState | null,
  ): Promise<VerbexRunState | null> {
    return this.withRunLock(runId, async () => {
      const latest = await this.read(`${runId}.json`)
      const next = mutate(latest)
      return next ? this.persist(next) : null
    })
  }

  async listRuns(): Promise<VerbexRunState[]> {
    const metadata = await this.listMetadata()
    // A corrupt run file is reported via getListDiagnostics() and is never an
    // auto-resume candidate; it must not hide the healthy runs.
    const runs = await this.readIsolated(
      metadata.map((item) => normalizePath(item.fileName)),
    )
    return runs
      .map(({ record }) => record)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async findLatestPaused(): Promise<VerbexRunState[]> {
    const runs = await this.listRuns()
    return runs.filter((run) => run.status === 'paused')
  }

  /**
   * Runs that were interrupted and can be resumed: anything not in a terminal
   * state (completed / error / cancelled). Used on startup to detect runs that
   * did not finish in the previous session.
   */
  async findResumable(): Promise<VerbexRunState[]> {
    const runs = await this.listRuns()
    return runs.filter(
      (run) =>
        run.status === 'paused' ||
        run.status === 'in_progress' ||
        run.status === 'created',
    )
  }
}
