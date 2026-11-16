import type { ResponseUsage } from '../../types/llm/response'

export type ChatCallUsage = { usage: ResponseUsage; estimated: boolean }

export function emptyAggregateUsage() {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    completion_calls: 0,
    estimated: false,
  }
}

const observers = new WeakMap<AbortSignal, (usage: ChatCallUsage) => void>()

export function observeChatUsage(
  signal: AbortSignal,
  observer: (usage: ChatCallUsage) => void,
): () => void {
  observers.set(signal, observer)
  return () => observers.delete(signal)
}

export function reportChatUsage(
  signal: AbortSignal | undefined,
  usage: ChatCallUsage,
): void {
  if (signal) observers.get(signal)?.(usage)
}
