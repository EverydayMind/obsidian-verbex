import { draftBodyMessageText } from './draftBodyMessageText'

export function draftBodyMessage(
  reason: 'no_body' | 'placeholder_only' | 'below_minimum',
  points: number,
): string {
  const text = draftBodyMessageText(points)
  return text[reason] + text.suffix
}
