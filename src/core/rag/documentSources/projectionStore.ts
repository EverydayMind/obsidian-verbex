import { App } from 'obsidian'
import { z } from 'zod'

import { createHash } from '../../../platform/node/api'
import { ensureVaultDir } from '../../../verbex/vault'

import { chunkSchema, extractorSchema, qualitySchema } from './kordocIndexText'
import { relocateProjection } from './projectionReuse'
import { localizeProjectionHeaders } from './projectionText'
import { DocumentProjection } from './types'

const ROOT = '.verbex/index/documents'
/** Stored extractor ids follow the provider extractor id pattern. */
const storedExtractorSchema = extractorSchema.extend({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
})
const projectionSchema = z.object({
  schemaVersion: z.literal(2),
  path: z.string(),
  sourceStamp: z.object({
    mtime: z.number(),
    size: z.number().nonnegative(),
  }),
  status: z.enum([
    'ok',
    'encrypted',
    'drm',
    'unsupported',
    'corrupted',
    'too_large',
    'empty',
    'needs_ocr',
    'bomb',
    'timeout',
    'too_large_auto',
    'extractor_unavailable',
  ]),
  sourceSha256: z.string(),
  extractor: storedExtractorSchema.optional(),
  pluginId: z.string().min(1).max(200).optional(),
  pageMode: z.enum(['layout', 'section']).nullable(),
  quality: qualitySchema.optional(),
  segments: z.array(
    z.object({
      id: z.string(),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
    }),
  ),
  format: z.string(),
  projection: z.string().max(20000000),
  pageCount: z.number().nullable(),
  outline: z.array(z.object({ level: z.number(), text: z.string() })),
  chunks: z
    .array(
      chunkSchema.extend({
        startLine: z.number().int().positive(),
        endLine: z.number().int().positive(),
      }),
    )
    .max(100000),
  truncated: z.boolean(),
  warnings: z.array(
    z.object({ code: z.string(), count: z.number().int().positive() }),
  ),
  chunkSize: z.number().positive(),
})
export class DocumentProjectionStore {
  constructor(private app: App) {}
  key(path: string): string {
    return `${ROOT}/${createHash('sha256').update(path).digest('hex').slice(0, 32)}.json`
  }
  async read(path: string): Promise<DocumentProjection | null> {
    try {
      const raw: unknown = JSON.parse(
        await this.app.vault.adapter.read(this.key(path)),
      )
      const result = projectionSchema.safeParse(raw)
      if (!result.success || result.data.path !== path) return null
      const p = result.data
      if (
        p.status === 'ok' &&
        (!p.extractor || !/^[a-f0-9]{64}$/.test(p.sourceSha256))
      )
        return null
      const lineCount = p.projection.split('\n').length
      if (
        p.chunks.some(
          (c, index) =>
            c.endLine < c.startLine ||
            c.endLine > lineCount ||
            (index > 0 && c.startLine <= p.chunks[index - 1].endLine),
        )
      )
        return null
      return localizeProjectionHeaders(p)
    } catch {
      return null
    }
  }
  async counts(paths: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    for (const path of paths) {
      const status = (await this.read(path))?.status ?? 'pending'
      counts[status] = (counts[status] ?? 0) + 1
    }
    return counts
  }
  async write(value: DocumentProjection): Promise<void> {
    await ensureVaultDir(this.app, ROOT)
    await this.app.vault.adapter.write(
      this.key(value.path),
      JSON.stringify(value),
    )
  }
  async remove(path: string): Promise<void> {
    if (await this.app.vault.adapter.exists(this.key(path)))
      await this.app.vault.adapter.remove(this.key(path))
  }
  async rename(oldPath: string, path: string): Promise<void> {
    const previous = await this.read(oldPath)
    if (previous) {
      await this.write(relocateProjection(previous, path))
      await this.remove(oldPath)
    }
  }
}
