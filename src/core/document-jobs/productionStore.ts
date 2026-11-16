import type { JsonObject } from '../../provider/interop/protocol'

import { type FormatJob, type ProductionKey, SHA, copy } from './jobTypes'

type Production = { key: ProductionKey; sha256: string; receipt: JsonObject }
const idOf = (key: ProductionKey) =>
  JSON.stringify([
    key.jobId,
    key.draftPath,
    key.draftSha256,
    ...(key.templateSha256
      ? ['template', key.templateSha256]
      : [key.derivationSha256]),
    key.outputPath,
  ])

/** Only confirmed writes are remembered; persistent checkpoints guard unknown writes. */
export class ProductionStore {
  private readonly entries = new Map<string, Production>()
  hasJob(id: string): boolean {
    return [...this.entries.values()].some((entry) => entry.key.jobId === id)
  }
  deleteJob(id: string): void {
    for (const [key, item] of this.entries)
      if (item.key.jobId === id) this.entries.delete(key)
  }
  record(
    job: FormatJob,
    key: ProductionKey,
    sha256: string,
    receipt: JsonObject,
  ): void {
    if (
      job.status.state !== 'ready' ||
      (job.kind === 'template'
        ? !key.templateSha256 ||
          key.derivationSha256 !== undefined ||
          !SHA.test(key.templateSha256)
        : job.status.data.bundle.derivation_sha256 !== key.derivationSha256 ||
          !key.derivationSha256 ||
          !SHA.test(key.derivationSha256)) ||
      !key.draftPath ||
      !key.outputPath ||
      !SHA.test(key.draftSha256) ||
      !SHA.test(sha256) ||
      receipt.state !== 'produced' ||
      receipt.written !== key.outputPath ||
      receipt.sha256 !== sha256
    )
      throw new Error('Invalid production record.')
    this.entries.set(idOf(key), copy({ key, sha256, receipt }))
  }
  async previous(
    key: ProductionKey,
    readHash: (path: string) => Promise<string | null>,
    assertCurrent: () => void,
  ) {
    const entry = this.entries.get(idOf(key))
    if (!entry) return { state: 'none' as const }
    const current = await readHash(key.outputPath)
    assertCurrent()
    if (this.entries.get(idOf(key)) !== entry)
      throw new Error('Production changed during readback.')
    if (current === null)
      return { state: 'output_missing' as const, sha256: entry.sha256 }
    if (!SHA.test(current)) throw new Error('Output readback unavailable.')
    if (current !== entry.sha256)
      return { state: 'output_changed' as const, sha256: entry.sha256 }
    return { state: 'same' as const, receipt: copy(entry.receipt) }
  }
}
