import { t } from '../i18n'
import type { AuditTurnRecord, SerializedChatMessage } from '../types/chat'

export type SessionSnapshot = {
  conversationId: string
  title: string
  messages: SerializedChatMessage[]
  auditLog: AuditTurnRecord[]
  inProgress: boolean
  capturedAt?: string
}

/** Settings are used only to identify secrets; they are never exported. */
export function exportSecrets(settings: unknown): string[] {
  const values = new Set<string>()
  const visit = (value: unknown, sensitive = false): void => {
    if (typeof value === 'string' && sensitive && value) values.add(value)
    else if (Array.isArray(value)) value.forEach((v) => visit(v, sensitive))
    else if (value && typeof value === 'object')
      Object.entries(value).forEach(([key, v]) =>
        visit(
          v,
          sensitive ||
            /api.?key|token|password|secret|authorization|headers|^env$/i.test(
              key,
            ),
        ),
      )
  }
  visit(settings)
  return [...values].sort((a, b) => b.length - a.length)
}

export function scrubExport(value: unknown, secrets: string[]): unknown {
  if (typeof value === 'string') {
    let text = value
    for (const secret of secrets) {
      if (!secret) continue
      text = text.split(secret).join('[REDACTED]')
      const escaped = JSON.stringify(secret).slice(1, -1)
      if (escaped !== secret) text = text.split(escaped).join('[REDACTED]')
    }
    return text.replace(
      /data:[\w/+.-]+;base64,[A-Za-z0-9+/=\r\n]+/g,
      '[BINARY OMITTED]',
    )
  }
  if (Array.isArray(value))
    return value.map((item) => scrubExport(item, secrets))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'hostBlock')
        .map(([key, item]) => [
          key,
          /^(api.?key|access.?token|refresh.?token|password|client.?secret|authorization)$/i.test(
            key,
          )
            ? '[REDACTED]'
            : /^(base64|embedding|embeddings|promptContent)$/i.test(key) ||
                (key === 'data' &&
                  ('mimeType' in value ||
                    ('type' in value && value.type === 'image')))
              ? '[OMITTED]'
              : scrubExport(item, secrets),
        ]),
    )
  return value
}

function editorText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const node = value as { text?: string; children?: unknown[]; root?: unknown }
  if (node.root) return editorText(node.root)
  if (typeof node.text === 'string') return node.text
  return (
    node.children
      ?.map(editorText)
      .join(
        node.children.some(
          (child) =>
            !!child && typeof child === 'object' && 'children' in child,
        )
          ? '\n'
          : '',
      ) ?? ''
  )
}

export function sessionMarkdown(snapshot: SessionSnapshot): string {
  return (
    t('ui.sessionBundle.nNConversationIDNRunningNN', {
      p0: snapshot.title,
      p1: snapshot.conversationId,
      p2: String(snapshot.inProgress),
    }) +
    snapshot.messages
      .map((message) => {
        const content =
          message.role === 'user'
            ? editorText(message.content)
            : message.role === 'assistant'
              ? message.content
              : JSON.stringify(message.toolCalls, null, 2)
        return `## ${message.role} (${message.id})\n\n${content}\n`
      })
      .join('\n')
  )
}
