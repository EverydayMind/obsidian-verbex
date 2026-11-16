import { PGlite } from '@electric-sql/pglite'
import { PGliteWorker } from '@electric-sql/pglite/worker'
import { sql } from 'drizzle-orm'
import { PgliteDatabase, drizzle } from 'drizzle-orm/pglite'
import { App, normalizePath, requestUrl } from 'obsidian'

import { PGLITE_DB_PATH } from '../constants'
import type { BackgroundWorkScheduler } from '../core/background/backgroundScheduler'
import { StartupDiagnostics } from '../utils/startupDiagnostics'

import { DatabaseErrorReporter, logDatabaseError } from './errorReporter'
import {
  DatabaseLoadRecoveredException,
  DatabaseSaveException,
  PGLiteAbortedException,
} from './exception'
import { guardWorkerClient } from './guardWorkerClient'
import migrations from './migrations.json'
import { LegacyTemplateManager } from './modules/template/TemplateManager'
import { VectorManager } from './modules/vector/VectorManager'
import { waitForWorkerInitialization } from './waitForWorkerInitialization'

// Must match the @electric-sql/pglite version in package.json
const PGLITE_VERSION = '0.2.12'
// Runtime resources shipped alongside main.js (copied by esbuild.config.mjs)
const PGLITE_RESOURCE_FILES = [
  'postgres.data',
  'postgres.wasm',
  'vector.tar.gz',
] as const

type PGliteResources = {
  fsBundle: Blob
  wasmModule: WebAssembly.Module
  vectorExtensionBundlePath: URL
}

export type DatabaseManagerCreateOptions = {
  reportError?: DatabaseErrorReporter
  /** Experimental opt-in; the stable default remains main-thread PGlite. */
  usePGliteWorker?: boolean
}

type PGliteClient = PGlite | PGliteWorker

type MigrationState = {
  latestCreatedAt: string | null
  count: number
}

export class DatabaseManager {
  private readonly reportError: DatabaseErrorReporter
  private app: App
  private dbPath: string
  // Vault-relative plugin folder containing bundled PGlite resources
  // (postgres.data, postgres.wasm, vector.tar.gz)
  private pluginDir: string | null
  private readonly startupDiagnostics: StartupDiagnostics | null
  private readonly usePGliteWorker: boolean
  private pgClient: PGliteClient | null = null
  private db: PgliteDatabase | null = null
  private recoveredDatabaseBackupPath: string | null = null
  private saveDebounceId: ReturnType<typeof setTimeout> | null = null
  private backgroundScheduler: BackgroundWorkScheduler | null = null
  private savePromise: Promise<void> | null = null
  private saveFollowUpRequested = false
  // Minimum interval between filesystem saves to avoid dumping the full
  // PGlite database on every incremental index update
  private static readonly SAVE_DEBOUNCE_MS = 30_000
  // WeakMap to prevent circular references
  private static managers = new WeakMap<
    DatabaseManager,
    {
      templateManager?: LegacyTemplateManager
      vectorManager?: VectorManager
    }
  >()

  constructor(
    app: App,
    dbPath: string,
    pluginDir?: string,
    startupDiagnostics?: StartupDiagnostics,
    options: DatabaseManagerCreateOptions = {},
  ) {
    this.reportError = options.reportError ?? logDatabaseError
    this.app = app
    this.dbPath = dbPath
    this.pluginDir = pluginDir ?? null
    this.startupDiagnostics = startupDiagnostics ?? null
    this.usePGliteWorker = options.usePGliteWorker === true
  }

  static async create(
    app: App,
    pluginDir?: string,
    startupDiagnostics?: StartupDiagnostics,
    options: DatabaseManagerCreateOptions = {},
  ): Promise<DatabaseManager> {
    const dbManager = new DatabaseManager(
      app,
      normalizePath(PGLITE_DB_PATH),
      pluginDir,
      startupDiagnostics,
      options,
    )
    dbManager.db = await dbManager.measureStartup('load-existing', () =>
      dbManager.loadExistingDatabase(),
    )
    const loadedExisting = Boolean(dbManager.db)
    dbManager.startupDiagnostics?.mark('database:selection', {
      source: loadedExisting ? 'existing' : 'new',
    })
    let createdNew = false
    if (!dbManager.db) {
      createdNew = true
      dbManager.db = await dbManager.measureStartup('create-new', () =>
        dbManager.createNewDatabase(),
      )
    }
    const migrationChanged = await dbManager.measureStartup('migrate', () =>
      dbManager.migrateDatabase(),
    )
    const shouldSaveAfterInitialization = createdNew || migrationChanged
    dbManager.startupDiagnostics?.mark('database:initial-save', {
      loadedExisting,
      createdNew,
      migrationChanged,
      saved: shouldSaveAfterInitialization,
    })
    if (shouldSaveAfterInitialization) {
      await dbManager.measureStartup('save', () => dbManager.save())
    }
    dbManager.notifyRecoveredDatabaseIfNeeded()

    // WeakMap setup
    const managers = {
      vectorManager: new VectorManager(
        app,
        dbManager.db,
        startupDiagnostics,
        dbManager.reportError,
      ),
      templateManager: new LegacyTemplateManager(app, dbManager.db),
    }

    // save, vacuum callback setup
    // Use debouncedSave so that rapid incremental index updates do not trigger
    // a full PGlite dump+write on every change; cleanup() always flushes immediately.
    const saveCallback = (): Promise<void> => {
      dbManager.debouncedSave()
      return Promise.resolve()
    }
    const vacuumCallback = dbManager.vacuum.bind(
      dbManager,
    ) as () => Promise<void>

    managers.vectorManager.setSaveCallback(saveCallback)
    managers.vectorManager.setVacuumCallback(vacuumCallback)
    managers.templateManager.setSaveCallback(saveCallback)
    managers.templateManager.setVacuumCallback(vacuumCallback)

    DatabaseManager.managers.set(dbManager, managers)

    console.debug('Verbex database initialized.', dbManager)

    return dbManager
  }

  getDb() {
    return this.db
  }

  setBackgroundScheduler(scheduler: BackgroundWorkScheduler | null): void {
    if (this.saveDebounceId) {
      clearTimeout(this.saveDebounceId)
      this.saveDebounceId = null
    }
    this.backgroundScheduler = scheduler
  }

  getVectorManager(): VectorManager {
    const managers = DatabaseManager.managers.get(this) ?? {}
    if (!managers.vectorManager) {
      if (this.db) {
        managers.vectorManager = new VectorManager(
          this.app,
          this.db,
          this.startupDiagnostics ?? undefined,
          this.reportError,
        )
        DatabaseManager.managers.set(this, managers)
      } else {
        throw new Error('Database is not initialized')
      }
    }
    return managers.vectorManager
  }

  getTemplateManager(): LegacyTemplateManager {
    const managers = DatabaseManager.managers.get(this) ?? {}
    if (!managers.templateManager) {
      if (this.db) {
        managers.templateManager = new LegacyTemplateManager(this.app, this.db)
        DatabaseManager.managers.set(this, managers)
      } else {
        throw new Error('Database is not initialized')
      }
    }
    return managers.templateManager
  }

  // vacuum the database to release unused space
  async vacuum() {
    if (!this.pgClient) {
      return
    }
    await this.pgClient.query('VACUUM FULL;')
  }

  private async createNewDatabase() {
    try {
      const { fsBundle, wasmModule, vectorExtensionBundlePath } =
        await this.measureStartup('resources-load', () =>
          this.loadPGliteResources(),
        )
      this.pgClient = await this.measureStartup('pglite-create-new', () =>
        this.createPGliteClient({
          fsBundle: fsBundle,
          wasmModule: wasmModule,
          vectorExtensionBundlePath,
        }),
      )
      // PGliteWorker implements the same runtime client contract, but its
      // private fields make TypeScript reject it as the PGlite class expected
      // by drizzle's older overloads.
      const db = drizzle(this.pgClient as PGlite)
      return db
    } catch (error) {
      console.debug('createNewDatabase error', error)
      if (
        error instanceof Error &&
        error.message.includes(
          'Aborted(). Build with -sASSERTIONS for more info.',
        )
      ) {
        // This error occurs when using an outdated Obsidian installer version
        throw new PGLiteAbortedException()
      }
      throw error
    }
  }

  private async loadExistingDatabase(): Promise<PgliteDatabase | null> {
    let databaseFileExists = false
    try {
      databaseFileExists = await this.app.vault.adapter.exists(this.dbPath)
      if (!databaseFileExists) {
        this.startupDiagnostics?.mark('database:file', { exists: false })
        return null
      }
      const fileBuffer = await this.app.vault.adapter.readBinary(this.dbPath)
      this.startupDiagnostics?.mark('database:file', {
        exists: true,
        bytes: fileBuffer.byteLength,
      })
      const fileBlob = new Blob([fileBuffer], { type: 'application/x-gzip' })
      const { fsBundle, wasmModule, vectorExtensionBundlePath } =
        await this.measureStartup('resources-load', () =>
          this.loadPGliteResources(),
        )
      this.pgClient = await this.measureStartup('pglite-create-existing', () =>
        this.createPGliteClient({
          loadDataDir: fileBlob,
          fsBundle: fsBundle,
          wasmModule: wasmModule,
          vectorExtensionBundlePath,
        }),
      )
      return drizzle(this.pgClient as PGlite)
    } catch (error) {
      console.debug('loadExistingDatabase error', error)
      if (
        error instanceof Error &&
        error.message.includes(
          'Aborted(). Build with -sASSERTIONS for more info.',
        )
      ) {
        // This error occurs when using an outdated Obsidian installer version
        throw new PGLiteAbortedException()
      }
      if (databaseFileExists) {
        this.recoveredDatabaseBackupPath =
          await this.backupExistingDatabaseFile('load-failed')
        this.openDatabaseRecoveryModal(error, this.recoveredDatabaseBackupPath)
      }
      return null
    }
  }

  private async createPGliteClient(options: {
    loadDataDir?: Blob
    fsBundle: Blob
    wasmModule: WebAssembly.Module
    vectorExtensionBundlePath: URL
  }): Promise<PGliteClient> {
    if (!this.usePGliteWorker) {
      return await PGlite.create({
        ...(options.loadDataDir ? { loadDataDir: options.loadDataDir } : {}),
        fsBundle: options.fsBundle,
        wasmModule: options.wasmModule,
        extensions: { vector: options.vectorExtensionBundlePath },
      })
    }

    let workerClient: PGliteWorker | null = null
    let worker: Worker | undefined
    let workerUrl: string | undefined
    try {
      if (!this.pluginDir) throw new Error('PGlite worker package unavailable')
      const source = await this.app.vault.adapter.read(
        normalizePath(`${this.pluginDir}/pglite-worker.js`),
      )
      const bootstrap = `globalThis.__verbexPgliteVectorUrl=${JSON.stringify(options.vectorExtensionBundlePath.href)};\n`
      workerUrl = URL.createObjectURL(
        new Blob([bootstrap, source], { type: 'text/javascript' }),
      )
      worker = new Worker(workerUrl, { type: 'module' })
      const activeWorker = worker
      const creation = PGliteWorker.create(worker, {
        ...(options.loadDataDir ? { loadDataDir: options.loadDataDir } : {}),
        fsBundle: options.fsBundle,
        wasmModule: options.wasmModule,
      })
      try {
        workerClient = await waitForWorkerInitialization(
          worker,
          creation,
          30_000,
          (client) => guardWorkerClient(activeWorker, client),
        )
      } catch (error) {
        // A worker may resolve after the deadline; its client must not survive
        // alongside the main-thread fallback.
        void creation.then((late) => late.close()).catch(() => undefined)
        throw error
      }
      this.startupDiagnostics?.mark('database:pglite-runtime', {
        mode: 'worker',
      })
      return workerClient
    } catch (error) {
      // Diagnostics can throw after the awaited client has been assigned.
      const failedClient = workerClient as PGliteWorker | null
      await failedClient?.close().catch(() => undefined)
      try {
        worker?.terminate()
      } catch {
        // A failed cleanup must not prevent the stable fallback.
      }
      this.startupDiagnostics?.mark('database:pglite-runtime', {
        mode: 'main-thread-fallback',
        error: error instanceof Error ? error.message : String(error),
      })
      console.warn(
        'Verbex: PGlite Worker initialization failed; falling back to main-thread PGlite.',
        error,
      )
      return await PGlite.create({
        ...(options.loadDataDir ? { loadDataDir: options.loadDataDir } : {}),
        fsBundle: options.fsBundle,
        wasmModule: options.wasmModule,
        extensions: { vector: options.vectorExtensionBundlePath },
      })
    } finally {
      if (workerUrl) URL.revokeObjectURL(workerUrl)
    }
  }

  private async migrateDatabase(): Promise<boolean> {
    try {
      const before = await this.readMigrationState()
      // Workaround for running Drizzle migrations in a browser environment
      // This method uses an undocumented API to perform migrations
      // See: https://github.com/drizzle-team/drizzle-orm/discussions/2532#discussioncomment-10780523
      const migrationDb = this.db as unknown as {
        dialect: {
          migrate: (
            entries: typeof migrations,
            session: unknown,
            config: { migrationsTable: string },
          ) => Promise<void>
        }
        session: unknown
      }
      await migrationDb.dialect.migrate(migrations, migrationDb.session, {
        migrationsTable: 'drizzle_migrations',
      })
      const after = await this.readMigrationState()
      if (!before || !after) {
        return before !== after
      }
      return (
        before.count !== after.count ||
        before.latestCreatedAt !== after.latestCreatedAt
      )
    } catch (error) {
      console.error('Error migrating database:', error)
      throw error
    }
  }

  /**
   * Drizzle's dialect migration API does not report whether it applied a
   * migration. Compare the migration ledger before and after the call so a
   * read-only startup does not trigger a full PGlite dump.
   */
  private async readMigrationState(): Promise<MigrationState | null> {
    if (!this.db) {
      return null
    }
    try {
      const rows = await this.db.execute<{
        latestCreatedAt: string | number | null
        count: string | number
      }>(
        sql`SELECT MAX(created_at) AS "latestCreatedAt", COUNT(*) AS "count" FROM "drizzle"."drizzle_migrations"`,
      )
      const row = rows.rows[0]
      if (!row) {
        return { latestCreatedAt: null, count: 0 }
      }
      return {
        latestCreatedAt:
          row.latestCreatedAt === null ? null : String(row.latestCreatedAt),
        count: Number(row.count),
      }
    } catch {
      // A new/legacy database may not have Drizzle's ledger yet. The
      // migration call creates it; the before/after comparison then marks the
      // initialization as changed and persists the migrated database.
      return null
    }
  }

  async save(): Promise<void> {
    if (this.savePromise) {
      this.saveFollowUpRequested = true
      return await this.savePromise
    }

    const run = this.performSave()
    const completion = run.then(
      async () => {
        this.savePromise = null
        if (this.saveFollowUpRequested) {
          this.saveFollowUpRequested = false
          await this.save()
        }
      },
      (error) => {
        this.savePromise = null
        this.saveFollowUpRequested = false
        throw error
      },
    )
    this.savePromise = completion
    return await completion
  }

  private async performSave(): Promise<void> {
    const pgClient = this.pgClient
    if (!pgClient) {
      return
    }
    let backupPath: string | null = null
    try {
      const buffer = await this.measureStartup('save-dump', async () => {
        const blob: Blob = await pgClient.dumpDataDir('gzip')
        return Buffer.from(await blob.arrayBuffer())
      })
      this.startupDiagnostics?.mark('database:save-dump', {
        bytes: buffer.byteLength,
      })
      await this.measureStartup('save-write', () =>
        this.app.vault.adapter.writeBinary(this.dbPath, buffer),
      )
    } catch (error) {
      console.error('Error saving database:', error)
      try {
        const blob: Blob = await pgClient.dumpDataDir('gzip')
        backupPath = await this.writeDatabaseBackup(
          Buffer.from(await blob.arrayBuffer()),
          'save-failed',
        )
      } catch (backupError) {
        console.error('Error writing database backup:', backupError)
      }
      this.openDatabaseSaveFailureModal(error, backupPath)
      throw new DatabaseSaveException(
        `Failed to save Verbex database${backupPath ? `. Backup written to ${backupPath}.` : '.'}`,
      )
    }
  }

  debouncedSave(): void {
    if (this.savePromise) {
      this.saveFollowUpRequested = true
      return
    }
    if (this.backgroundScheduler) {
      this.backgroundScheduler.schedule(
        'database-save',
        () => this.save(),
        DatabaseManager.SAVE_DEBOUNCE_MS,
      )
      return
    }
    if (this.saveDebounceId) {
      clearTimeout(this.saveDebounceId)
    }
    this.saveDebounceId = setTimeout(() => {
      this.saveDebounceId = null
      void this.save()
    }, DatabaseManager.SAVE_DEBOUNCE_MS)
  }

  async cleanup() {
    // Cancel any pending debounced save and flush immediately
    this.backgroundScheduler?.cancel('database-save')
    if (this.saveDebounceId) {
      clearTimeout(this.saveDebounceId)
      this.saveDebounceId = null
    }
    try {
      await this.save()
    } catch {
      // save() already reported the error to the user.
    }
    // WeakMap cleanup
    DatabaseManager.managers.delete(this)
    await this.pgClient?.close()
    this.pgClient = null
    this.db = null
  }

  /**
   * Loads the PGlite runtime resources (filesystem bundle, WASM module,
   * vector extension). Bundled files in the plugin folder are preferred so
   * the plugin works in offline (air-gapped) environments; the unpkg CDN is
   * only a fallback for installations missing the bundled files.
   */
  private async loadPGliteResources(): Promise<PGliteResources> {
    const localResources = await this.measureStartup('resources-local', () =>
      this.loadLocalPGliteResources(),
    )
    if (localResources) {
      this.startupDiagnostics?.mark('database:resources-source', {
        source: 'local',
      })
      return localResources
    }
    try {
      const remoteResources = await this.measureStartup(
        'resources-remote',
        () => this.loadRemotePGliteResources(),
      )
      this.startupDiagnostics?.mark('database:resources-source', {
        source: 'remote',
      })
      return remoteResources
    } catch (error) {
      console.error('Error loading PGlite resources:', error)
      throw new Error(
        `Failed to load PGlite resources. Bundled resources were not found in the plugin folder${
          this.pluginDir ? ` (${this.pluginDir})` : ''
        }, and downloading from the unpkg CDN failed — expected in offline environments. Copy ${PGLITE_RESOURCE_FILES.join(
          ', ',
        )} from @electric-sql/pglite@${PGLITE_VERSION}/dist into the plugin folder, then reload Obsidian. (${
          error instanceof Error ? error.message : String(error)
        })`,
      )
    }
  }

  private async loadLocalPGliteResources(): Promise<PGliteResources | null> {
    const pluginDir = this.pluginDir
    if (!pluginDir) {
      return null
    }
    try {
      const adapter = this.app.vault.adapter
      const resourcePaths = PGLITE_RESOURCE_FILES.map((file) =>
        normalizePath(`${pluginDir}/${file}`),
      )
      const allExist = (
        await Promise.all(resourcePaths.map((p) => adapter.exists(p)))
      ).every(Boolean)
      if (!allExist) {
        return null
      }
      const [dataBuffer, wasmBuffer, vectorBuffer] = await Promise.all(
        resourcePaths.map((p) => adapter.readBinary(p)),
      )
      const fsBundle = new Blob([dataBuffer], {
        type: 'application/octet-stream',
      })
      const wasmModule = await WebAssembly.compile(wasmBuffer)
      // PGlite downloads the extension bundle with fetch(), so expose the
      // local file through an object URL
      const vectorExtensionBundlePath = new URL(
        URL.createObjectURL(
          new Blob([vectorBuffer], { type: 'application/gzip' }),
        ),
      )
      return { fsBundle, wasmModule, vectorExtensionBundlePath }
    } catch (error) {
      console.warn(
        'Failed to load bundled PGlite resources, falling back to CDN:',
        error,
      )
      return null
    }
  }

  private async loadRemotePGliteResources(): Promise<PGliteResources> {
    const [fsBundleResponse, wasmResponse] = await Promise.all([
      requestUrl(
        `https://unpkg.com/@electric-sql/pglite@${PGLITE_VERSION}/dist/postgres.data`,
      ),
      requestUrl(
        `https://unpkg.com/@electric-sql/pglite@${PGLITE_VERSION}/dist/postgres.wasm`,
      ),
    ])

    const fsBundle = new Blob([fsBundleResponse.arrayBuffer], {
      type: 'application/octet-stream',
    })
    const wasmModule = await WebAssembly.compile(wasmResponse.arrayBuffer)
    const vectorExtensionBundlePath = new URL(
      `https://unpkg.com/@electric-sql/pglite@${PGLITE_VERSION}/dist/vector.tar.gz`,
    )

    return { fsBundle, wasmModule, vectorExtensionBundlePath }
  }

  private async measureStartup<T>(
    stage: string,
    operation: () => Promise<T> | T,
  ): Promise<T> {
    if (!this.startupDiagnostics) return await operation()
    return await this.startupDiagnostics.measure(`database:${stage}`, operation)
  }

  private getBackupPath(reason: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return normalizePath(`${this.dbPath}.${reason}.${timestamp}.backup.gz`)
  }

  private async backupExistingDatabaseFile(reason: string): Promise<string> {
    const backupPath = this.getBackupPath(reason)
    const fileBuffer = await this.app.vault.adapter.readBinary(this.dbPath)
    await this.app.vault.adapter.writeBinary(backupPath, fileBuffer)
    return backupPath
  }

  private async writeDatabaseBackup(
    buffer: Buffer,
    reason: string,
  ): Promise<string> {
    const backupPath = this.getBackupPath(reason)
    await this.app.vault.adapter.writeBinary(backupPath, buffer)
    return backupPath
  }

  private notifyRecoveredDatabaseIfNeeded() {
    if (!this.recoveredDatabaseBackupPath) {
      return
    }
    console.warn(
      new DatabaseLoadRecoveredException(
        `Recovered Verbex database. Backup: ${this.recoveredDatabaseBackupPath}`,
      ),
    )
  }

  private openDatabaseRecoveryModal(error: unknown, backupPath: string | null) {
    this.reportError(
      'Verbex database recovered',
      `Verbex could not load the existing vector database, so it backed up the old file and created a fresh database. You can rebuild the vault index from settings or the command palette.`,
      [
        `[Backup]`,
        backupPath ?? 'Backup failed',
        '',
        `[Error]`,
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    )
  }

  private openDatabaseSaveFailureModal(
    error: unknown,
    backupPath: string | null,
  ) {
    this.reportError(
      'Verbex database save failed',
      `Verbex could not save the vector database. Recent index changes may not persist after restart.${backupPath ? ' A backup dump was written.' : ' The backup attempt also failed.'}`,
      [
        `[Backup]`,
        backupPath ?? 'Backup failed',
        '',
        `[Error]`,
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    )
  }
}
