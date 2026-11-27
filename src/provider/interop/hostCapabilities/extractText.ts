import { z } from 'zod'

import {
  chunkSchema,
  failureSchema,
  qualitySchema,
} from '../../../core/rag/documentSources/kordocIndexText'
import { UnsafeValueError, copyJson, readDataMember } from '../descriptorReader'

export const EXTRACT_TEXT_EXTENSIONS = ['.hwp', '.hwpx', '.pdf'] as const
export const EXTRACT_COPY_LIMITS = {
  maxDepth: 8,
  maxNodes: 1_500_000,
  maxBytes: 40 * 1024 * 1024,
}

const EXTRACTOR_ID = /^[a-z0-9-]{1,64}$/
export const MEMBER_LIMITS = { maxDepth: 3, maxNodes: 64, maxBytes: 8 * 1024 }

export type ExtractorVersionValue = {
  id: string
  engineVersion: string
  chunkerVersion: string
}
export type ExtractMemberJudgement =
  | { usable: true; extensions: string[] }
  | { usable: false }

const versionSchema = z.object({
  id: z.string().regex(EXTRACTOR_ID),
  engineVersion: z.string(),
  chunkerVersion: z.string(),
})

/**
 * Judges the data of an extractText member without running provider code:
 * fields are read as data members and copied losslessly. `extract`, when
 * present, must be a function; the caller still checks that it exists.
 */
export function parseExtractTextMember(raw: unknown): ExtractMemberJudgement {
  const unusable = { usable: false } as const
  if (!raw || typeof raw !== 'object') return unusable
  let version: unknown, extensions: unknown, extractorVersion: unknown
  try {
    version = readDataMember(raw, 'version')
    extensions = copyJson(readDataMember(raw, 'extensions'), MEMBER_LIMITS)
    extractorVersion = copyJson(
      readDataMember(raw, 'extractorVersion'),
      MEMBER_LIMITS,
    )
    const extract = readDataMember(raw, 'extract')
    if (extract !== undefined && typeof extract !== 'function') return unusable
  } catch {
    return unusable
  }
  if (version !== 1 || !Array.isArray(extensions)) return unusable
  if (
    extensions.length < 1 ||
    extensions.length > EXTRACT_TEXT_EXTENSIONS.length
  )
    return unusable
  const allowed: readonly unknown[] = EXTRACT_TEXT_EXTENSIONS
  if (!extensions.every((value) => allowed.includes(value))) return unusable
  if (new Set(extensions).size !== extensions.length) return unusable
  if (!versionSchema.safeParse(extractorVersion).success) return unusable
  return { usable: true, extensions: [...(extensions as string[])] }
}

const resultSchema = z.object({
  status: z.literal('ok'),
  format: z.string(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceStamp: z.object({ mtime: z.number(), size: z.number().nonnegative() }),
  extractor: versionSchema.extend({ ocrApplied: z.boolean().default(false) }),
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
const anyResultSchema = z.union([resultSchema, failureSchema])
export type ExtractTextData = z.infer<typeof anyResultSchema>
export type ExtractResultJudgement =
  | { ok: true; value: ExtractTextData }
  | { ok: false; reason: 'corrupted' }

/**
 * Same rules as the KorDoc index result check, with a provider-chosen
 * extractor id that must equal the declared extractorVersion.
 */
export function parseExtractTextResult(
  raw: unknown,
  extractorVersion: ExtractorVersionValue,
  maxChars: number,
): ExtractResultJudgement {
  const corrupted = { ok: false, reason: 'corrupted' } as const
  let copy
  try {
    copy = copyJson(raw, EXTRACT_COPY_LIMITS)
  } catch (error) {
    if (error instanceof UnsafeValueError) return corrupted
    throw error
  }
  const parsed = anyResultSchema.safeParse(copy)
  if (!parsed.success) return corrupted
  const data = parsed.data
  if (data.status !== 'ok') return { ok: true, value: data }
  const { extractor } = data
  if (
    extractor.id !== extractorVersion.id ||
    extractor.engineVersion !== extractorVersion.engineVersion ||
    extractor.chunkerVersion !== extractorVersion.chunkerVersion
  )
    return corrupted
  let total = 0
  for (const chunk of data.chunks) {
    total += chunk.text.length
    if (chunk.blockRange[1] < chunk.blockRange[0]) return corrupted
  }
  return total > maxChars ? corrupted : { ok: true, value: data }
}
