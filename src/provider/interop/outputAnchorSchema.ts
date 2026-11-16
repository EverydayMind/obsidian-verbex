import { z } from 'zod'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const index = z.number().int().nonnegative()
const anchor = { blockIndex: index, section: z.literal(0), paragraph: index }
const common = {
  state: z.literal('partial'),
  scope: z.literal('rendered_export'),
  preparationId: z.string(),
  preparationDigest: hash,
  destination: z.string(),
  archiveSha256: hash,
  sectionSha256: hash,
  total: index.max(50000),
  offset: index,
  nextOffset: index.nullable(),
}
export const savedOutputAnchorPageSchema = z.discriminatedUnion('version', [
  z
    .object({
      ...common,
      version: z.literal('saved-output-anchors/0.1'),
      anchors: z.array(z.object(anchor).strict()).max(500),
    })
    .strict(),
  z
    .object({
      ...common,
      version: z.literal('saved-output-anchors/0.2'),
      anchors: z
        .array(
          z
            .object({
              ...anchor,
              appliedMarker: z.string().min(1).max(128).nullable(),
            })
            .strict(),
        )
        .max(500),
    })
    .strict(),
  z
    .object({
      ...common,
      version: z.literal('saved-output-anchors/0.3'),
      anchors: z
        .array(
          z
            .object({
              ...anchor,
              appliedMarker: z.string().min(1).max(128).nullable(),
              requestedVariant: z.string().min(1).max(12).nullable(),
              variantMissing: z.boolean(),
            })
            .strict()
            .refine(
              (item) => item.requestedVariant !== null || !item.variantMissing,
            ),
        )
        .max(500),
    })
    .strict(),
])
export type SavedOutputAnchorPage = z.infer<typeof savedOutputAnchorPageSchema>
