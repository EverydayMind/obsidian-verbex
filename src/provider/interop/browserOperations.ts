import { stringifyUnknown } from '../../utils/stringifyUnknown'

import { copyJson } from './descriptorReader'

export type BrowserOperation = {
  operationId: string
  providerId: string
  conversationId: string
  state: 'pending' | 'unknown'
}

/** Minimal crash journal. No page, arguments, digests, cards or tickets on disk. */
export class BrowserOperations {
  private records: BrowserOperation[] = []
  private queue = Promise.resolve()
  private readonly ready: Promise<void>
  constructor(
    private io: {
      read: () => Promise<unknown>
      write: (value: BrowserOperation[]) => Promise<void>
    },
  ) {
    this.ready = io.read().then((raw) => {
      const data = copyJson(raw, {
        maxDepth: 4,
        maxNodes: 20000,
        maxBytes: 512000,
      })
      if (!Array.isArray(data) || data.length > 1000)
        throw new Error('Invalid browser operation journal')
      this.records = data.map((entry) => {
        if (
          !entry ||
          typeof entry !== 'object' ||
          Array.isArray(entry) ||
          Object.keys(entry).sort().join(',') !==
            'conversationId,operationId,providerId,state' ||
          typeof entry.operationId !== 'string' ||
          typeof entry.providerId !== 'string' ||
          typeof entry.conversationId !== 'string' ||
          !['pending', 'unknown'].includes(stringifyUnknown(entry.state))
        )
          throw new Error('Invalid browser operation record')
        return { ...entry, state: 'unknown' } as BrowserOperation
      })
    })
    void this.ready.catch(() => undefined)
  }
  async unresolved(): Promise<BrowserOperation[]> {
    await this.ready
    return this.records.map((record) => ({ ...record }))
  }
  async acknowledge(operationId: string): Promise<void> {
    await this.ready
    const record = this.records.find((item) => item.operationId === operationId)
    if (!record || record.state !== 'unknown')
      throw new Error(
        'Only an unresolved unknown operation can be acknowledged',
      )
    await this.settle(operationId, true)
  }
  async assertClear(providerId: string): Promise<void> {
    await this.ready
    if (this.records.some((record) => record.providerId === providerId))
      throw new Error(
        'An earlier browser operation is unresolved. Check its status before further actions.',
      )
  }
  private update(fn: () => void): Promise<void> {
    const next = this.queue.then(async () => {
      await this.ready
      fn()
      await this.io.write(this.records.map((record) => ({ ...record })))
    })
    // A failed persistence operation poisons this instance: fail closed until reload.
    this.queue = next
    void next.catch(() => undefined)
    return next
  }
  begin(record: BrowserOperation): Promise<void> {
    return this.update(() => {
      if (
        this.records.length >= 1000 ||
        this.records.some((item) => item.providerId === record.providerId)
      )
        throw new Error('Unresolved browser operation or journal limit reached')
      this.records.push({ ...record })
    })
  }
  settle(operationId: string, known: boolean): Promise<void> {
    return this.update(() => {
      this.records = this.records.flatMap((record) =>
        record.operationId !== operationId
          ? [record]
          : known
            ? []
            : [{ ...record, state: 'unknown' as const }],
      )
    })
  }
}
