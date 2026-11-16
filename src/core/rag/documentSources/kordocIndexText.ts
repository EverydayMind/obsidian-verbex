import { App } from 'obsidian'
import { z } from 'zod'

import { KORDOC_PROVIDER_ID } from '../../../provider/contract'

import { IndexTextResult } from './types'

export const chunkSchema = z.object({
  id: z.string().max(200),
  type: z.enum(['heading', 'text', 'table']),
  text: z.string().max(2000000),
  breadcrumb: z.array(z.string().max(2000)).max(100),
  page: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
  blockRange: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]),
})
export const qualitySchema = z.object({
  needsOcr: z.boolean().optional(),
  ocrCandidatePages: z.array(z.number().int().positive()),
  lowTextPageCount: z.number().int().nonnegative().optional(),
})
export const extractorSchema = z.object({
  id: z.literal('kordoc'),
  engineVersion: z.string(),
  chunkerVersion: z.string(),
  ocrApplied: z.boolean().default(false),
})
const resultSchema = z.object({
  status: z.literal('ok'),
  format: z.string(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceStamp: z.object({
    mtime: z.number().finite(),
    size: z.number().nonnegative(),
  }),
  extractor: extractorSchema,
  pageMode: z.enum(['layout', 'section']).nullable().default(null),
  quality: qualitySchema.optional(),
  pageCount: z.number().nullable(),
  outline: z.array(z.object({ level: z.number(), text: z.string() })),
  chunks: z.array(chunkSchema).max(100000),
  truncated: z.boolean(),
  warnings: z.array(
    z.object({ code: z.string(), count: z.number().int().positive() }),
  ),
})
const failureSchema = z.object({
  status: z.enum([
    'encrypted',
    'drm',
    'unsupported',
    'corrupted',
    'too_large',
    'empty',
    'bomb',
    'needs_ocr',
  ]),
  message: z.string().default(''),
  pageCount: z.number().optional(),
  quality: qualitySchema.optional(),
})

type IndexApi = {
  indexTextVersion: number
  indexTextExtractor?: { engineVersion: string; chunkerVersion: string }
  indexText(input: {
    path: string
    signal?: AbortSignal
    ocr?: 'off' | 'candidates'
    maxChars: number
  }): Promise<unknown>
}
export function kordocIndexApi(app: App): IndexApi | null {
  const api = (
    app as App & { plugins?: { plugins?: Record<string, { api?: IndexApi }> } }
  ).plugins?.plugins?.[KORDOC_PROVIDER_ID]?.api
  return api?.indexTextVersion === 1 && typeof api.indexText === 'function'
    ? api
    : null
}

export async function extractIndexText(
  app: App,
  path: string,
  signal: AbortSignal,
  ocr: 'off' | 'candidates' = 'off',
): Promise<IndexTextResult> {
  const api = kordocIndexApi(app)
  if (!api)
    return {
      status: 'extractor_unavailable',
      message: 'KORDOC indexText v1 unavailable',
    }
  const raw = await api.indexText({ path, signal, ocr, maxChars: 2000000 })
  const parsed = z.union([resultSchema, failureSchema]).safeParse(raw)
  if (!parsed.success)
    return { status: 'corrupted', message: 'Invalid extraction result' }
  if (
    parsed.data.status === 'ok' &&
    (parsed.data.chunks.reduce((n, c) => n + c.text.length, 0) > 2000000 ||
      parsed.data.chunks.some((c) => c.blockRange[1] < c.blockRange[0]))
  )
    return { status: 'corrupted', message: 'Invalid extraction bounds' }
  return parsed.data
}
