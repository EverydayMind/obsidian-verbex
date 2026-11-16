import { isCompactedMessage } from '../../context/compaction'
import type { RequestMessage } from '../../types/llm/request'

/** Extract the relevant part of the last assistant message for a short reply. */
export function choiceIntent(
  request: string,
  assistant: string,
): {
  text: string
  status: 'normal' | 'choiceAmbiguous' | 'choiceUnmapped'
  kind: 'choice' | 'negative' | 'other'
} {
  const reply = request.trim().normalize('NFKC').toLowerCase()
  if (
    /^(?:nope|no thanks|no thank you|do not|don't|stop|cancel)[.!?]*$/i.test(
      reply,
    )
  )
    return { text: '', status: 'normal', kind: 'negative' }
  if (/^(?:아니오|아니요|아뇨|no|싫어|하지\s*마)[.!?]*$/i.test(reply))
    return { text: '', status: 'normal', kind: 'negative' }
  const choice = reply
    .replace(/^(?:option|choice|number)\s+/i, '')
    .match(/^(\d{1,2}|[a-z])(?:번|안)?[.!?]?$/i)
  if (!choice) return { text: assistant, status: 'normal', kind: 'other' }
  const lines = assistant.split('\n')
  const marker =
    /^\s*(?:[-*]\s*)?(?:\*\*)?((?:\d{1,2}|[a-z])[).]|[①-⑩])(?:\*\*)?\s*/i
  const lineMarkers =
    /(?:^|\s)(?:[-*]\s*)?(?:\*\*)?(?:(?:\d{1,2}|[a-z])[).]|[①-⑩])/gi
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  const starts: { index: number; key: string }[] = []
  for (let index = 0; index < lines.length; index++) {
    if ([...lines[index].matchAll(lineMarkers)].length > 1)
      return { text: '', status: 'choiceAmbiguous', kind: 'choice' }
    const match = lines[index].match(marker)
    if (!match) continue
    const key = normalize(match[1].replace(/[).]$/, ''))
    if (starts.some((s) => s.key === key))
      return { text: '', status: 'choiceAmbiguous', kind: 'choice' }
    starts.push({ index, key })
  }
  const selected = starts.find((s) => s.key === choice[1])
  if (!selected) return { text: '', status: 'choiceUnmapped', kind: 'choice' }
  const excluded = new Set<number>()
  for (const start of starts) {
    let end = start.index + 1
    while (
      end < lines.length &&
      !starts.some((s) => s.index === end) &&
      lines[end].trim() &&
      !/^\s*#/.test(lines[end])
    )
      end++
    // A differently labeled list remains part of the question body. It may
    // still be an ordinary content list rather than a set of choices.
    if (
      start !== selected &&
      /^\d+$/.test(start.key) === /^\d+$/.test(selected.key)
    )
      for (let i = start.index; i < end; i++) excluded.add(i)
  }
  return {
    text: lines.filter((_, i) => !excluded.has(i)).join('\n'),
    status: 'normal',
    kind: 'choice',
  }
}

export function assistantChoiceFromHistory(
  request: string,
  history: readonly RequestMessage[],
): string {
  const last = [...history]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' &&
        !isCompactedMessage(message) &&
        message.content.trim(),
    )
  return choiceIntent(request, (last?.content as string) ?? '').text
}
