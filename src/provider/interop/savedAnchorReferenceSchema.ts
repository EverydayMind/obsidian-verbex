import { z } from 'zod'

import type { SavedAnchorEvidence } from './savedAnchorEvidence'

export const resultSchema = z
  .object({
    status: z.literal('ok'),
    archiveSha256: z.string(),
    sectionSha256: z.string(),
    anchors: z
      .array(
        z.discriminatedUnion('state', [
          z
            .object({
              blockIndex: z.number().int().nonnegative(),
              state: z.literal('matched'),
              ref: z
                .string()
                .regex(/^s0\/p\d+$/)
                .max(64),
            })
            .strict(),
          z
            .object({
              blockIndex: z.number().int().nonnegative(),
              state: z.literal('unavailable'),
              reason: z.literal('paragraph_missing'),
            })
            .strict(),
        ]),
      )
      .max(50),
  })
  .strict()
export type SavedAnchorReference = z.infer<
  typeof resultSchema
>['anchors'][number] &
  SavedAnchorEvidence
