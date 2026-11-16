import { z } from 'zod'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const count = z.number().int().nonnegative().safe()
const boundedText = (max: number) =>
  z.string().refine((value) => [...value].length <= max)
const short = boundedText(1000).refine((value) => value.length > 0)
const rejected = z
  .object({
    derivable: z.literal(false),
    derivation_sha256: hash,
    rejections: z
      .array(z.object({ marker: short, ref: short, reason: short }).strict())
      .min(1),
  })
  .strict()
const base = {
  dialect: z.literal('hwpx-exporter-md/2').optional(),
  derivable: z.literal(true),
  rejections: z.array(z.never()).max(0),
  markers: z.array(short).max(24),
  derivedTemplateSha256: hash,
  derivation_sha256: hash,
}
const deriveOnly = z.object(base).strict()
const failed = z
  .object({
    ...base,
    converts: z.literal(false),
    failure: z.object({ code: short, message: short }).strict(),
  })
  .strict()
const converted = z
  .object({
    ...base,
    converts: z.literal(true),
    blocks: z
      .object({
        total: count,
        topLevel: count,
        byMarker: z.record(
          z.string(),
          z.object({ requested: count, applied: count }).strict(),
        ),
        substituted: z.array(
          z
            .object({
              reason: z.enum([
                'variant_unsupported',
                'variant_missing',
                'marker_missing',
              ]),
              count,
            })
            .strict(),
        ),
      })
      .strict(),
    firstBlockByMarker: z.record(z.string(), count),
    warnings: z.array(
      z
        .object({
          code: short,
          message: short,
          count,
          examples: z.array(boundedText(4096)).max(5),
        })
        .strict(),
    ),
    conversionFingerprint: hash,
  })
  .strict()
export const previewSchema = z.union([rejected, deriveOnly, failed, converted])
export type DerivedPreview = z.infer<typeof previewSchema>
const templateBase = { templateSha256: hash, derivedMode: z.boolean() }
export const templatePreviewSchema = z.union([
  failed
    .omit({
      derivable: true,
      rejections: true,
      markers: true,
      derivedTemplateSha256: true,
      derivation_sha256: true,
    })
    .extend(templateBase),
  converted
    .omit({
      derivable: true,
      rejections: true,
      markers: true,
      derivedTemplateSha256: true,
      derivation_sha256: true,
    })
    .extend(templateBase),
])
export type ConvertedPreview = Extract<
  DerivedPreview | z.infer<typeof templatePreviewSchema>,
  { converts: true }
>
