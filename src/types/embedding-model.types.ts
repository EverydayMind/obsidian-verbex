import { z } from 'zod'

const baseEmbeddingModelSchema = z.object({
  providerId: z
    .string({
      error: 'provider ID is required',
    })
    .min(1, 'provider ID is required'),
  id: z
    .string({
      error: 'id is required',
    })
    .min(1, 'id is required'),
  model: z
    .string({
      error: 'model is required',
    })
    .min(1, 'model is required'),
  dimension: z.number(),
  // Optional: Request specific output dimensions from the API.
  outputDimension: z.number().optional(),
})

const embeddingVariant = <
  T extends
    | 'local'
    | 'openai'
    | 'gemini'
    | 'ollama'
    | 'lmstudio'
    | 'openai-compatible',
>(
  providerType: T,
) =>
  z.object({
    providerType: z.literal(providerType),
    ...baseEmbeddingModelSchema.shape,
  })

export const embeddingModelSchema = z.discriminatedUnion('providerType', [
  embeddingVariant('local'),
  embeddingVariant('openai'),
  embeddingVariant('gemini'),
  embeddingVariant('ollama'),
  embeddingVariant('lmstudio'),
  embeddingVariant('openai-compatible'),
])

export type EmbeddingModel = z.infer<typeof embeddingModelSchema>
