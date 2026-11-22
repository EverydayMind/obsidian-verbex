import { editorStateToPlainText } from '../../components/chat-view/chat-input/utils/editor-state-to-plain-text'
import type { PriorToolResult } from '../../context/priorReads'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import { ChatMessage } from '../../types/chat'
import { RequestMessage } from '../../types/llm/request'
import { ToolCallResponseStatus } from '../../types/tool-call.types'

/** Discovery hints only; never restore an old active-file scope or edit grant. */
export function chatMessagesToPriorDocumentPaths(
  messages: ChatMessage[],
): string[] {
  const latest = messages.findLastIndex((message) => message.role === 'user')
  for (let index = latest - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'user') continue
    const paths = message.mentionables.flatMap((mention) =>
      (mention.type === 'current-file' ||
        mention.type === 'file' ||
        mention.type === 'block') &&
      mention.file
        ? [mention.file.path]
        : [],
    )
    if (paths.length) return [...new Set(paths)]
  }
  return []
}

/** Tool results and unsuccessful-call barriers, in order, for `carryPriorReads`. */
export function chatMessagesToPriorToolResults(
  messages: ChatMessage[],
): PriorToolResult[] {
  let turn = 0
  return messages.flatMap((message) => {
    if (message.role === 'user') turn++
    return message.role === 'tool'
      ? message.toolCalls.map(({ request, response }) =>
          response.status === ToolCallResponseStatus.Success
            ? {
                call: request,
                text: response.data.text,
                ...(request.name === 'read_style_profile' ||
                request.name === 'check_report_draft'
                  ? { batchId: `turn-${turn}` }
                  : {}),
                ...(response.data.disclosure
                  ? { disclosure: response.data.disclosure }
                  : {}),
              }
            : { call: request },
        )
      : []
  })
}

/**
 * Build the user/assistant request history handed to `runAgent` from the chat
 * message list.
 *
 * Tool messages and the transient one-line tool-outcome summaries
 * (`verbexToolSummary`) are display-only artifacts: they must be dropped here,
 * otherwise the summaries replay as fake assistant turns and the real tool
 * context is misrepresented, polluting the multi-turn context sent to the
 * model.
 */
export function chatMessagesToRequestHistory(
  messages: ChatMessage[],
): RequestMessage[] {
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === 'user',
  )
  return messages.flatMap((message, index): RequestMessage[] => {
    if (message.role === 'user') {
      // `promptContent` is a per-turn transport payload that may contain the
      // current-note body, RAG snippets, and the plain request at the tail. The
      // controller rebuilds grounding for every new runAgent turn; replaying
      // promptContent as conversation history duplicates large source bodies
      // and makes continuation task pinning treat the document itself as the
      // user's instruction. Keep the request and historical attachment paths,
      // never the compiled grounding or selected document text. Leave the latest
      // request unchanged so splitAgentHistory can identify it; its attachments
      // are supplied separately to runAgent for current-turn grounding.
      const content = message.content
        ? editorStateToPlainText(message.content).trim()
        : ''
      if (!content) return []
      const references =
        index < latestUserIndex
          ? message.mentionables.flatMap((mention) =>
              (mention.type === 'current-file' ||
                mention.type === 'file' ||
                mention.type === 'block') &&
              mention.file
                ? [{ type: mention.type, path: mention.file.path }]
                : [],
            )
          : []
      return [
        {
          role: 'user',
          content: references.length
            ? L({
                ko: `[이 메시지 제출 당시의 문서 참조 — 현재 열린 파일·선택 범위·편집 권한을 뜻하지 않음]\n${JSON.stringify(references)}\n\n${modelMarker('userRequest', 'ko')}${content}`,
                en: `[Document references at message submission — not the currently open file, selection or editing permission]\n${JSON.stringify(references)}\n\n${modelMarker('userRequest', 'en')}${content}`,
              })
            : content,
        },
      ]
    }
    if (message.role === 'assistant') {
      if (
        message.verbexToolSummary ||
        message.verbexCensusReport ||
        message.verbexLargeFileCard ||
        message.verbexRunState
      )
        return []
      return message.content.trim()
        ? [{ role: 'assistant', content: message.content }]
        : []
    }
    return []
  })
}
