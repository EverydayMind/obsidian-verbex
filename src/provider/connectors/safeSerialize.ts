import { TAbstractFile } from 'obsidian'

import { estimateTokens } from '../../utils/llm/estimateTokens'

import { ConnectorTool } from './manifestSchema'

export function safeSerialize(
  value: unknown,
  limits: ConnectorTool['result'],
): { text: string; value: unknown; truncated: boolean } {
  let truncated = false
  let nodes = 0
  let characters = 0
  const seen = new WeakSet()
  const visit = (input: unknown, depth: number, project = false): unknown => {
    if (++nodes > 2000 || depth > 6 || characters >= limits.maxChars) {
      truncated = true
      return '[bounded]'
    }
    if (typeof input === 'string') {
      const text = input.slice(0, Math.max(0, limits.maxChars - characters))
      characters += text.length
      truncated ||= text.length !== input.length
      return text
    }
    if (input === null || typeof input === 'boolean') return input
    if (typeof input === 'number')
      return Number.isFinite(input) ? input : '[unserializable]'
    if (typeof input !== 'object') return '[unserializable]'
    if (seen.has(input)) return '[circular]'
    seen.add(input)
    try {
      if (typeof Node !== 'undefined' && input instanceof Node)
        return '[unserializable]'
      if (typeof Window !== 'undefined' && input instanceof Window)
        return '[unserializable]'
      if (typeof TAbstractFile === 'function' && input instanceof TAbstractFile)
        return visit(
          Object.getOwnPropertyDescriptor(input, 'path')?.value ??
            '[unserializable]',
          depth + 1,
        )
      if (input instanceof Date) return Date.prototype.toISOString.call(input)
      if (input instanceof Map || input instanceof Set) {
        const result: unknown[] = []
        const iterator = (
          input instanceof Map
            ? Map.prototype.entries.call(input)
            : Set.prototype.values.call(input)
        ) as IterableIterator<unknown>
        for (const entry of iterator) {
          if (
            result.length >= limits.maxItems ||
            nodes >= 2000 ||
            characters >= limits.maxChars
          ) {
            truncated = true
            break
          }
          result.push(visit(entry, depth + 1))
        }
        return result
      }
      if (Array.isArray(input)) {
        const result: unknown[] = []
        for (let i = 0; i < Math.min(input.length, limits.maxItems); i++) {
          if (nodes >= 2000 || characters >= limits.maxChars) {
            truncated = true
            break
          }
          const descriptor = Object.getOwnPropertyDescriptor(input, String(i))
          result.push(
            descriptor && 'value' in descriptor
              ? visit(descriptor.value, depth + 1, depth === 0)
              : '[unserializable]',
          )
        }
        truncated ||= result.length < input.length
        return result
      }
      const result = Object.create(null) as Record<string, unknown>
      const keys = project && limits.pick ? limits.pick : Object.keys(input)
      truncated ||= keys.length > 200
      for (const key of keys.slice(0, 200)) {
        if (nodes >= 2000 || characters >= limits.maxChars) {
          truncated = true
          break
        }
        if (['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key))
          continue
        const descriptor = Object.getOwnPropertyDescriptor(input, key)
        if (!descriptor?.enumerable) continue
        result[key] =
          'value' in descriptor
            ? visit(descriptor.value, depth + 1)
            : '[unserializable]'
      }
      return result
    } catch {
      return '[unserializable]'
    }
  }
  const serialized = visit(value, 0, !Array.isArray(value))
  let text =
    limits.format === 'text' && typeof serialized === 'string'
      ? serialized
      : JSON.stringify(serialized)
  truncated ||= text.length > limits.maxChars
  text = text.slice(0, limits.maxChars)
  while (estimateTokens(text) > 8000) {
    text = text.slice(0, Math.floor(text.length * 0.8))
    truncated = true
  }
  return { text, value: serialized, truncated }
}
