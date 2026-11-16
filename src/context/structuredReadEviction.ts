import type { RequestMessage } from '../types/llm/request'

import { providerPageVersion } from './structuredReadObservation'
import {
  StructuredVersionOrder,
  structuredReadVersion,
} from './structuredReadVersion'

/** Version evidence is advisory: older material can still be needed for comparison. */
export function olderStructuredPages(
  messages: readonly RequestMessage[],
): Map<number, 'local' | 'provider'> {
  const versions = new StructuredVersionOrder()
  const older = new Map<number, 'local' | 'provider'>()
  let inspected = 0,
    batch = 0
  for (
    let index = messages.length - 1;
    index >= 0 && inspected < 256;
    index--
  ) {
    const message = messages[index]
    if (message.role === 'assistant' || message.role === 'user') {
      batch++
      continue
    }
    if (
      message.role !== 'tool' ||
      !message.tool_call ||
      message.privateTranscript ||
      message.images?.length ||
      typeof message.content !== 'string'
    )
      continue
    const provider = providerPageVersion(message)
    if (
      !provider &&
      message.tool_call.name !== 'read_style_profile' &&
      message.tool_call.name !== 'check_report_draft'
    )
      continue
    inspected++
    const version =
      provider ??
      structuredReadVersion({
        call: message.tool_call,
        text: message.content,
        disclosure: message.disclosure,
      })
    if (!version) continue
    if (versions.isOlder(version, String(batch)))
      older.set(index, provider ? 'provider' : 'local')
  }
  return older
}
