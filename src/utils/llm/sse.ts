import type { StreamSource } from './httpTransport'

type SseBoundary = {
  index: number
  length: number
}

export async function* parseJsonSseStream<T>(
  body: StreamSource,
  signal?: AbortSignal,
): AsyncIterable<T> {
  const decoder = new TextDecoder()
  let buffer = ''

  if (isWebReadableStream(body)) {
    const reader = body.getReader()
    const abort = () => {
      void reader.cancel().catch(() => undefined)
    }
    let completed = false
    signal?.addEventListener('abort', abort, { once: true })
    try {
      signal?.throwIfAborted()
      while (true) {
        const { value, done } = await reader.read()
        signal?.throwIfAborted()
        if (value) buffer += decoder.decode(value, { stream: true })
        yield* flushSseBuffer(buffer, (next) => {
          buffer = next
        })
        if (done) {
          completed = true
          break
        }
      }
      yield* flushSseBuffer(
        buffer,
        (next) => {
          buffer = next
        },
        true,
      )
    } finally {
      signal?.removeEventListener('abort', abort)
      if (!completed) await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
    return
  }

  const abort = () =>
    body.destroy?.(
      signal?.reason instanceof Error
        ? signal.reason
        : new Error('Request aborted'),
    )
  signal?.addEventListener('abort', abort, { once: true })
  try {
    signal?.throwIfAborted()
    for await (const chunk of body) {
      signal?.throwIfAborted()
      const chunkText =
        typeof chunk === 'string'
          ? chunk
          : decoder.decode(chunk, { stream: true })
      buffer += chunkText
      yield* flushSseBuffer(buffer, (next) => {
        buffer = next
      })
    }
    yield* flushSseBuffer(
      buffer,
      (next) => {
        buffer = next
      },
      true,
    )
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}

function isWebReadableStream(
  body: StreamSource,
): body is ReadableStream<Uint8Array> {
  return typeof (body as ReadableStream<Uint8Array>).getReader === 'function'
}

function findSseBoundary(buffer: string): SseBoundary | null {
  const candidates: SseBoundary[] = []
  const lfIndex = buffer.indexOf('\n\n')
  if (lfIndex !== -1) {
    candidates.push({ index: lfIndex, length: 2 })
  }
  const crIndex = buffer.indexOf('\r\r')
  if (crIndex !== -1) {
    candidates.push({ index: crIndex, length: 2 })
  }
  const crlfIndex = buffer.indexOf('\r\n\r\n')
  if (crlfIndex !== -1) {
    candidates.push({ index: crlfIndex, length: 4 })
  }
  if (candidates.length === 0) {
    return null
  }
  return candidates.reduce((earliest, candidate) =>
    candidate.index < earliest.index ? candidate : earliest,
  )
}

function* flushSseBuffer<T>(
  buffer: string,
  updateBuffer: (next: string) => void,
  flushPartial = false,
): Iterable<T> {
  let boundary = findSseBoundary(buffer)
  while (boundary) {
    const rawEvent = buffer.slice(0, boundary.index)
    buffer = buffer.slice(boundary.index + boundary.length)
    yield* parseSseEvent<T>(rawEvent)
    boundary = findSseBoundary(buffer)
  }
  if (flushPartial && buffer.length > 0) {
    // The final event may be truncated JSON if the connection was dropped
    // mid-stream; discard it instead of surfacing a parse error after the
    // already-received content
    try {
      yield* parseSseEvent<T>(buffer)
    } catch {
      console.warn('Discarding truncated SSE event at end of stream')
    }
    buffer = ''
  }
  updateBuffer(buffer)
}

function* parseSseEvent<T>(rawEvent: string): Iterable<T> {
  const dataLines = rawEvent
    .split(/\r\n|\n|\r/)
    .filter((line) => line.startsWith('data:'))
  if (dataLines.length === 0) {
    return
  }
  const data = dataLines.map((line) => line.replace(/^data:\s?/, '')).join('\n')
  if (data && !data.startsWith('[DONE]')) {
    yield JSON.parse(data) as T
  }
}
