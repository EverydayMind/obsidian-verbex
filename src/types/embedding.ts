export type EmbeddingModelClient = {
  id: string
  dimension: number
  getEmbedding: (
    text: string,
    options?: { signal?: AbortSignal },
  ) => Promise<number[]>
  // Batch embedding: embeds multiple texts in fewer API calls when supported
  getEmbeddings: (
    texts: string[],
    options?: { signal?: AbortSignal },
  ) => Promise<number[][]>
}

export type EmbeddingDbStats = {
  model: string
  rowCount: number
  totalDataBytes: number
  /** Sum of the physically stored content values for this model. */
  contentBytes?: number
  /** Sum of the physically stored vector values for this model. */
  embeddingBytes?: number
  /** Sum of the physically stored metadata values for this model. */
  metadataBytes?: number
  /** Relation size, repeated for each model because indexes are shared. */
  tableBytes?: number
  /** All index sizes, including HNSW indexes shared by the table. */
  indexBytes?: number
}
