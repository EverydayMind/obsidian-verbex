import {
  JOB_TTL,
  type Measurement,
  type MeasurementKey,
  SHA,
  copy,
} from './jobTypes'

type Cached = { key: MeasurementKey; expiresAt: number; value: Measurement }
const cacheKey = (key: MeasurementKey) =>
  JSON.stringify([key.conversationId, key.sampleSha256, key.apiVersion])

export class MeasurementCache {
  private readonly entries = new Map<string, Cached>()
  constructor(private readonly now: () => number) {}

  private expire(): void {
    for (const [key, entry] of this.entries)
      if (entry.expiresAt <= this.now()) this.entries.delete(key)
  }
  find(key: MeasurementKey): Measurement | undefined {
    this.expire()
    const id = cacheKey(key),
      entry = this.entries.get(id)
    if (!entry) return undefined
    this.entries.delete(id)
    this.entries.set(id, entry)
    return copy(entry.value)
  }
  put(key: MeasurementKey, value: Measurement): void {
    this.expire()
    if (
      !key.conversationId ||
      !SHA.test(key.sampleSha256) ||
      !Number.isSafeInteger(key.apiVersion) ||
      key.apiVersion < 0 ||
      value.snapshot.source.sha256 !== key.sampleSha256 ||
      !SHA.test(value.measurementSha256)
    )
      throw new Error('Invalid measurement binding.')
    const id = cacheKey(key)
    this.entries.delete(id)
    this.entries.set(id, {
      key: copy(key),
      value: copy(value),
      expiresAt: this.now() + JOB_TTL,
    })
    const own = [...this.entries].filter(
      ([, item]) => item.key.conversationId === key.conversationId,
    )
    while (own.length > 4) {
      const oldest = own.shift()
      if (oldest) this.entries.delete(oldest[0])
    }
  }
}
