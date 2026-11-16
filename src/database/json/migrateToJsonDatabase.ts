import { App, normalizePath } from 'obsidian'

import { ChatConversationManager } from '../../utils/chat/chatHistoryManager'
import { logStartupDiagnostic } from '../../utils/startupDiagnostics'
import { DatabaseManager } from '../DatabaseManager'
import { DuplicateTemplateException } from '../exception'

import { INITIAL_MIGRATION_MARKER } from './constants'
import { JsonStorageService } from './JsonStorageService'

export type MigrationFailureKind =
  | 'conflict'
  | 'verify_failed'
  | 'delete_failed'
  | 'migrate_failed'

export type MigrationFailure = {
  kind: MigrationFailureKind
  item: string
  error: unknown
}

export class MigrationAggregateError extends Error {
  constructor(readonly failures: readonly MigrationFailure[]) {
    super(
      `JSON migration failed for ${failures.length} item(s): ${failures
        .map((failure) => `${failure.item} [${failure.kind}]`)
        .join(', ')}`,
    )
    this.name = 'MigrationAggregateError'
  }
}

export class PostMigrationUiError extends Error {
  constructor(
    message: string,
    readonly causeError?: unknown,
  ) {
    super(message)
    this.name = 'PostMigrationUiError'
  }
}

async function hasMigrationCompleted(app: App, root: string): Promise<boolean> {
  const markerPath = normalizePath(`${root}/${INITIAL_MIGRATION_MARKER}`)
  return await app.vault.adapter.exists(markerPath)
}

async function markMigrationCompleted(app: App, root: string): Promise<void> {
  const markerPath = normalizePath(`${root}/${INITIAL_MIGRATION_MARKER}`)
  await app.vault.adapter.write(
    markerPath,
    `Migration completed on ${new Date().toISOString()}`,
  )
}

async function transferChatHistoryFromLegacy(
  app: App,
  storage: JsonStorageService,
): Promise<void> {
  const oldChatManager = new ChatConversationManager(app)
  const newChatManager = storage.chatManager

  const chatList = await oldChatManager.getChatList()
  const failures: MigrationFailure[] = []

  for (const chatMeta of chatList) {
    try {
      const oldChat = await oldChatManager.findChatConversation(chatMeta.id)
      if (!oldChat) {
        continue
      }

      const migrationData = {
        id: oldChat.id,
        title: oldChat.title,
        messages: oldChat.messages,
        createdAt: oldChat.createdAt,
        updatedAt: oldChat.updatedAt,
      }
      const existingChat = await newChatManager.findById(oldChat.id)
      if (existingChat) {
        if (!sameChatContent(existingChat, migrationData)) {
          throw new MigrationItemError('conflict')
        }
        try {
          await oldChatManager.deleteChatConversation(oldChat.id)
        } catch {
          throw new MigrationItemError('delete_failed')
        }
        continue
      }

      await newChatManager.createChat(migrationData)

      const verifyChat = await newChatManager.findById(oldChat.id)
      if (!verifyChat || !sameChatContent(verifyChat, migrationData)) {
        throw new MigrationItemError('verify_failed')
      }

      try {
        await oldChatManager.deleteChatConversation(oldChat.id)
      } catch {
        throw new MigrationItemError('delete_failed')
      }
    } catch (error) {
      failures.push({
        kind:
          error instanceof MigrationItemError ? error.kind : 'migrate_failed',
        item: `chat:${chatMeta.id}`,
        error: error instanceof MigrationItemError ? undefined : error,
      })
    }
  }

  console.debug('Chat history migration to JSON database completed')
  if (failures.length > 0) {
    throw new MigrationAggregateError(failures)
  }
}

async function transferTemplatesFromDrizzle(
  app: App,
  dbManager: DatabaseManager,
  storage: JsonStorageService,
): Promise<void> {
  const jsonTemplateManager = storage.templateManager
  const drizzleTemplateManager = dbManager.getTemplateManager()

  const templates = await drizzleTemplateManager.findAllTemplates()
  const failures: MigrationFailure[] = []

  for (const template of templates) {
    try {
      const migrationData = {
        name: template.name,
        content: template.content,
      }
      const existingTemplate = await jsonTemplateManager.findByName(
        template.name,
      )
      if (existingTemplate) {
        if (!sameTemplateContent(existingTemplate, migrationData)) {
          throw new MigrationItemError('conflict')
        }
        try {
          await drizzleTemplateManager.deleteTemplate(template.id)
        } catch {
          throw new MigrationItemError('delete_failed')
        }
        continue
      }
      await jsonTemplateManager.createTemplate(migrationData)

      const verifyTemplate = await jsonTemplateManager.findByName(template.name)
      if (
        !verifyTemplate ||
        !sameTemplateContent(verifyTemplate, migrationData)
      ) {
        throw new MigrationItemError('verify_failed')
      }

      try {
        await drizzleTemplateManager.deleteTemplate(template.id)
      } catch {
        throw new MigrationItemError('delete_failed')
      }
    } catch (error) {
      if (error instanceof DuplicateTemplateException) {
        const existingTemplate = await jsonTemplateManager.findByName(
          template.name,
        )
        const migrationData = {
          name: template.name,
          content: template.content,
        }
        if (
          existingTemplate &&
          sameTemplateContent(existingTemplate, migrationData)
        ) {
          try {
            await drizzleTemplateManager.deleteTemplate(template.id)
            continue
          } catch (deleteError) {
            failures.push({
              kind: 'delete_failed',
              item: `template:${template.name}`,
              error: deleteError,
            })
            continue
          }
        }
        failures.push({
          kind: 'conflict',
          item: `template:${template.name}`,
          error,
        })
      } else {
        failures.push({
          kind:
            error instanceof MigrationItemError ? error.kind : 'migrate_failed',
          item: `template:${template.name}`,
          error: error instanceof MigrationItemError ? undefined : error,
        })
      }
    }
  }

  console.debug('Templates migration to JSON database completed')
  if (failures.length > 0) {
    throw new MigrationAggregateError(failures)
  }
}

class MigrationItemError extends Error {
  constructor(readonly kind: Exclude<MigrationFailureKind, 'migrate_failed'>) {
    super(kind)
  }
}

function sameChatContent(
  existing: {
    id: string
    title: string
    messages: unknown
    createdAt: number
    updatedAt: number
  },
  expected: {
    id: string
    title: string
    messages: unknown
    createdAt: number
    updatedAt: number
  },
): boolean {
  return (
    existing.id === expected.id &&
    existing.title === expected.title &&
    existing.createdAt === expected.createdAt &&
    existing.updatedAt === expected.updatedAt &&
    JSON.stringify(existing.messages) === JSON.stringify(expected.messages)
  )
}

function sameTemplateContent(
  existing: { name: string; content: unknown },
  expected: { name: string; content: unknown },
): boolean {
  return (
    existing.name === expected.name &&
    JSON.stringify(existing.content) === JSON.stringify(expected.content)
  )
}

export async function migrateToJsonDatabase(
  app: App,
  getDbManager: () => Promise<DatabaseManager>,
  storage: JsonStorageService,
  onMigrationComplete?: () => void | Promise<void>,
): Promise<void> {
  const migrationCompleted = await hasMigrationCompleted(app, storage.root)
  logStartupDiagnostic({
    event: 'json-migration:marker',
    completed: migrationCompleted,
  })
  if (migrationCompleted) {
    return
  }

  // Keep the legacy ordering while the marker is absent: database startup
  // must complete before any verify-then-delete migration item is touched.
  const dbManager = await getDbManager()
  const failures: MigrationFailure[] = []
  try {
    await transferChatHistoryFromLegacy(app, storage)
  } catch (error) {
    if (error instanceof MigrationAggregateError) {
      failures.push(...error.failures)
    } else {
      throw error
    }
  }
  try {
    await transferTemplatesFromDrizzle(app, dbManager, storage)
  } catch (error) {
    if (error instanceof MigrationAggregateError) {
      failures.push(...error.failures)
    } else {
      throw error
    }
  }
  if (failures.length > 0) {
    throw new MigrationAggregateError(failures)
  }
  await markMigrationCompleted(app, storage.root)
  await onMigrationComplete?.()
}
