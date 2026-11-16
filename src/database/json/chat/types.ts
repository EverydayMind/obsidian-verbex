import {
  SerializedChatMessage,
  SkillWorkflowSelectionMode,
} from '../../../types/chat'

export const CHAT_SCHEMA_VERSION = 1

export type ChatConversation = {
  id: string
  title: string
  messages: SerializedChatMessage[]
  createdAt: number
  updatedAt: number
  schemaVersion: number
  auditLog?: import('../../../types/chat').AuditTurnRecord[]
  skillWorkflowSelectionMode?: SkillWorkflowSelectionMode
  selectedSkillNames?: string[]
  selectedWorkflowIds?: string[]
}

export type ChatConversationMetadata = {
  id: string
  title: string
  updatedAt: number
  schemaVersion: number
}
