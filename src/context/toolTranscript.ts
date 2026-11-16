import { protectedResponsesStart } from '../core/llm/responsesReplay'
import {
  ToolMetadataSource,
  resolveToolMetadata,
} from '../core/tools/toolMetadata'
import {
  MODEL_MARKERS,
  hasModelMarker,
  modelMarker,
} from '../i18n/modelMarkers'
import { L } from '../i18n/modelText'
import { RequestMessage } from '../types/llm/request'

import { canonicalReadArgs, sortReadValue } from './canonicalRead'

/**
 * Post-hoc redundancy pruning for the agent transcript (the "discard" side of
 * context management).
 *
 * The agentic loop accumulates every tool result verbatim, so an agent that
 * reads the *same* note (same read tool, same arguments) more than once leaves
 * several identical bodies in the context — pure waste that crowds out room for
 * material the request actually needs. This collapses such exact-duplicate read
 * results to a single copy: the most recent occurrence is kept verbatim (it is
 * the one the model just asked for) and each earlier identical result is
 * replaced by a short stub pointing at it.
 *
 * Deliberately conservative: it only touches *read* tools (writes are never
 * de-duplicated) and only collapses byte-for-byte identical calls, so it can
 * never drop information the model has not already seen elsewhere in the
 * transcript. The message objects are left in place (role, tool_call id, and
 * ordering preserved) so provider tool-call/tool-response pairing stays intact —
 * only the `content` string of a superseded result is shortened.
 */

export const REDUNDANT_READ_STUB_PREFIX = MODEL_MARKERS.redundantRead.ko

type ReadInfo = { key: string; name: string }

/** Identify a de-duplicable read-tool result and its dedupe key, else null. */
function readInfo(
  message: RequestMessage,
  source?: ToolMetadataSource,
): ReadInfo | null {
  if (message.role !== 'tool') return null
  const call = message.tool_call
  if (
    !call ||
    typeof message.content !== 'string' ||
    message.images?.length ||
    hasModelMarker(message.content, 'redundantRead') ||
    resolveToolMetadata(call.name, source)?.category !== 'read' ||
    resolveToolMetadata(call.name, source)?.evictable === false
  )
    return null
  return {
    key: JSON.stringify([
      call.name,
      canonicalReadArgs(call.arguments),
      message.repeatOriginalText ?? message.content,
      sortReadValue(message.disclosure ?? null),
      message.privateTranscript === true,
    ]),
    name: call.name,
  }
}

function stubFor(name: string): string {
  return L({
    ko: `${modelMarker('redundantRead')}: 동일한 ${name} 호출의 최신 결과가 이 대화 뒤쪽에 그대로 있습니다. 다시 읽을 필요는 없습니다.)`,
    en: `${modelMarker('redundantRead', 'en')}: The latest result of the identical ${name} call remains unchanged later in this conversation. No need to reread it.)`,
  })
}

/**
 * Replace every superseded exact-duplicate read result with a stub, keeping only
 * the latest copy of each distinct read. Returns the original array reference
 * unchanged when there was nothing to collapse, so callers can cheaply detect a
 * no-op by identity.
 */
export function collapseRedundantToolReads(
  messages: RequestMessage[],
  source?: ToolMetadataSource,
): RequestMessage[] {
  const lastIndexByKey = new Map<string, number>()
  messages.forEach((message, index) => {
    const info = readInfo(message, source)
    if (info) lastIndexByKey.set(info.key, index)
  })

  let changed = false
  const protectedStart = protectedResponsesStart(messages)
  const collapsed = messages.map((message, index) => {
    if (index >= protectedStart) return message
    const info = readInfo(message, source)
    if (
      !info ||
      message.role !== 'tool' ||
      lastIndexByKey.get(info.key) === index
    )
      return message
    if (
      typeof message.content === 'string' &&
      hasModelMarker(message.content, 'redundantRead')
    ) {
      return message
    }
    changed = true
    const { repeatOriginalText: _original, ...rest } = message
    return { ...rest, content: stubFor(info.name) }
  })

  return changed ? collapsed : messages
}
