import { App, normalizePath } from 'obsidian'
import path from 'path-browserify'

import { uuidv4 } from '../../../utils/uuid'
import { AbstractJsonRepository } from '../base'
import { CHAT_DIR } from '../constants'
import { EmptyChatTitleException } from '../exception'
import {
  JsonRecordError,
  assertSupportedVersion,
  isFiniteNumber,
  isPlainObject,
} from '../recordCodec'

import {
  CHAT_SCHEMA_VERSION,
  ChatConversation,
  ChatConversationMetadata,
} from './types'

export class ChatManager extends AbstractJsonRepository<
  ChatConversation,
  ChatConversationMetadata
> {
  // Serializes concurrent updateChat calls for the same conversation ID so the
  // latest state wins deterministically.
  private updateLocks = new Map<string, Promise<unknown>>()

  // Renames legacy files (whose names embedded title/updatedAt) to the
  // canonical id-only form. Memoized so it runs at most once per instance.
  private legacyMigration: Promise<void> | null = null

  constructor(app: App, root: string) {
    super(app, `${root}/${CHAT_DIR}`)
  }

  protected generateFileName(chat: ChatConversation): string {
    // Format: v{schemaVersion}_{id}.json
    //
    // The file name intentionally contains only immutable fields. Previously it
    // embedded the (mutable) title and updatedAt, so every save produced a new
    // file name and the update wrote a new file then deleted the old one. During
    // streaming, concurrent debounced saves could read a file that another save
    // had just deleted (ENOENT). With an id-only name, updates overwrite in
    // place and that race cannot occur.
    return `v${chat.schemaVersion}_${chat.id}.json`
  }

  protected override validateRecord(
    value: unknown,
    fileName: string,
  ): ChatConversation {
    if (
      !isPlainObject(value) ||
      typeof value.id !== 'string' ||
      typeof value.title !== 'string' ||
      !Array.isArray(value.messages) ||
      !isFiniteNumber(value.updatedAt) ||
      !isFiniteNumber(value.schemaVersion)
    ) {
      throw new JsonRecordError('invalid', fileName)
    }
    assertSupportedVersion(value.schemaVersion, CHAT_SCHEMA_VERSION, fileName)
    return value as unknown as ChatConversation
  }

  protected parseFileName(fileName: string): ChatConversationMetadata | null {
    // Only the id is encoded in the canonical file name; title/updatedAt live in
    // the file body and are read by the overridden listMetadata() below. This
    // method exists to satisfy the base-class contract and to recognize
    // canonical names. Its title/updatedAt placeholders are never surfaced
    // because listMetadata() is overridden.
    const match = fileName.match(
      new RegExp(`^v${CHAT_SCHEMA_VERSION}_([0-9a-f-]+)\\.json$`),
    )
    if (!match) return null

    return {
      id: match[1],
      schemaVersion: CHAT_SCHEMA_VERSION,
      title: '',
      updatedAt: 0,
    }
  }

  // Title and updatedAt are no longer part of the file name, so metadata is read
  // from each file's content rather than parsed from its name.
  public async listMetadata(): Promise<
    (ChatConversationMetadata & { fileName: string })[]
  > {
    await this.ensureLegacyMigration()

    const listed = await this.app.vault.adapter.list(this.dataDir)
    const fileNames = listed.files
      .map((filePath) => path.basename(filePath))
      .filter((fileName) => fileName.endsWith('.json'))

    // One corrupt file must not hide every other conversation.
    const chats = await this.readIsolated(fileNames)
    return chats.map(({ fileName, record: chat }) => ({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
      schemaVersion: chat.schemaVersion,
      fileName,
    }))
  }

  public async createChat(
    initialData: Partial<ChatConversation>,
  ): Promise<ChatConversation> {
    if (initialData.title && initialData.title.length === 0) {
      throw new EmptyChatTitleException()
    }

    const now = Date.now()
    const newChat: ChatConversation = {
      id: uuidv4(),
      title: 'New chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
      schemaVersion: CHAT_SCHEMA_VERSION,
      ...initialData,
    }

    await this.withChatLock(newChat.id, () => this.create(newChat))
    return newChat
  }

  public async findById(id: string): Promise<ChatConversation | null> {
    await this.ensureLegacyMigration()
    // Deterministic file name → direct read. No directory scan, so there is no
    // window in which a concurrent save can delete the file between listing it
    // and reading it.
    return this.read(this.fileNameForId(id))
  }

  public async updateChat(
    id: string,
    updates: Partial<
      Omit<ChatConversation, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>
    >,
  ): Promise<ChatConversation | null> {
    const run = async (): Promise<ChatConversation | null> => {
      // Not findById(): that awaits the legacy migration, which takes this
      // same per-ID lock and would deadlock.
      await this.ensureLegacyMigration()
      const chat = await this.read(this.fileNameForId(id))
      if (!chat) return null

      if (updates.title !== undefined && updates.title.length === 0) {
        throw new EmptyChatTitleException()
      }

      const updatedChat: ChatConversation = {
        ...chat,
        ...updates,
        updatedAt: Date.now(),
      }

      // Same id → same file name → in-place overwrite (no rename, no delete).
      await this.update(chat, updatedChat)
      return updatedChat
    }

    return this.withChatLock(id, run)
  }

  // One queue per conversation ID shared by update, create, delete and the
  // legacy-name migration, so none of them can interleave on the same chat.
  // Tasks must not call another locked method for the same ID.
  private async withChatLock<R>(
    id: string,
    task: () => Promise<R>,
  ): Promise<R> {
    const previous = this.updateLocks.get(id) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(task)
    this.updateLocks.set(id, next)
    try {
      return await next
    } finally {
      if (this.updateLocks.get(id) === next) {
        this.updateLocks.delete(id)
      }
    }
  }

  public async deleteChat(id: string): Promise<boolean> {
    const fileName = this.fileNameForId(id)
    const filePath = normalizePath(path.join(this.dataDir, fileName))
    // Enter the queue first so call order decides who wins against saves.
    return this.withChatLock(id, async () => {
      await this.ensureLegacyMigration()
      if (!(await this.app.vault.adapter.exists(filePath))) return false
      await this.delete(fileName)
      return true
    })
  }

  public async listChats(): Promise<ChatConversationMetadata[]> {
    const metadata = await this.listMetadata()
    return metadata.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  private fileNameForId(id: string): string {
    return `v${CHAT_SCHEMA_VERSION}_${id}.json`
  }

  // Directory preparation errors propagate; the rename pass itself is
  // best-effort and memoized only once the directory listing has succeeded.
  private async ensureLegacyMigration(): Promise<void> {
    await this.ready()
    if (!this.legacyMigration) {
      this.legacyMigration = this.migrateLegacyFileNames().then((listed) => {
        // A transient listing failure must not count as a finished migration.
        if (!listed) this.legacyMigration = null
      })
    }
    return this.legacyMigration
  }

  // Best-effort, idempotent rename of pre-existing files that still embed
  // title/updatedAt in their names. Never throws so it cannot wedge reads.
  // Returns false when the directory could not be listed.
  private async migrateLegacyFileNames(): Promise<boolean> {
    try {
      const listed = await this.app.vault.adapter.list(this.dataDir)
      const fileNames = listed.files
        .map((filePath) => path.basename(filePath))
        .filter((fileName) => fileName.endsWith('.json'))
      const canonical = new RegExp(
        `^v${CHAT_SCHEMA_VERSION}_[0-9a-f-]+\\.json$`,
      )

      for (const fileName of fileNames) {
        if (canonical.test(fileName)) continue
        try {
          const chat = await this.read(fileName)
          if (!chat?.id) continue

          const targetName = this.generateFileName(chat)
          const targetPath = normalizePath(path.join(this.dataDir, targetName))
          if (!(await this.app.vault.adapter.exists(targetPath))) {
            await this.writeRecord(targetName, JSON.stringify(chat, null, 2))
          }
          await this.delete(fileName)
        } catch (error) {
          console.error('Failed to migrate legacy chat file', fileName, error)
        }
      }
    } catch (error) {
      console.error('Failed to migrate legacy chat files', error)
      return false
    }
    return true
  }
}
