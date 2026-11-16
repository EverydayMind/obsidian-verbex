import {
  SQL,
  and,
  asc,
  cosineDistance,
  count,
  countDistinct,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  like,
  max,
  or,
  sql,
  sum,
} from 'drizzle-orm'
import { PgliteDatabase } from 'drizzle-orm/pglite'
import { App } from 'obsidian'

import {
  EmbeddingDbStats,
  EmbeddingModelClient,
} from '../../../types/embedding'
import { DatabaseNotInitializedException } from '../../exception'
import { InsertEmbedding, SelectEmbedding, embeddingTable } from '../../schema'

export type EmbeddingSearchScope = {
  files: string[]
  folders: string[]
}

export type IndexedChunkMetadata = Omit<
  SelectEmbedding,
  'embedding' | 'content'
> & {
  /** Present only for callers that still hold a legacy hydrated row. */
  content?: string
}

export type EmbeddingSearchMetadata = Omit<
  SelectEmbedding,
  'embedding' | 'content'
> & {
  similarity: number
}

export type EmbeddingIndexSummary = {
  rowCount: number
  indexedFilesCount: number
  totalDataBytes: number
  contentBytes: number
  embeddingBytes: number
  metadataBytes: number
  tableBytes: number
  indexBytes: number
}

export class VectorRepository {
  private app: App
  private db: PgliteDatabase | null

  constructor(app: App, db: PgliteDatabase | null) {
    this.app = app
    this.db = db
  }

  async getIndexedFileMtimes(
    embeddingModel: EmbeddingModelClient,
  ): Promise<Map<string, number>> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    const rows = await this.db
      .select({
        path: embeddingTable.path,
        mtime: max(embeddingTable.mtime),
      })
      .from(embeddingTable)
      .where(eq(embeddingTable.model, embeddingModel.id))
      .groupBy(embeddingTable.path)
    const map = new Map<string, number>()
    for (const row of rows) {
      if (row.mtime !== null) {
        map.set(row.path, row.mtime)
      }
    }
    return map
  }

  async getIndexedDocumentVersions(
    embeddingModel: EmbeddingModelClient,
  ): Promise<Map<string, string>> {
    if (!this.db) throw new DatabaseNotInitializedException()
    const rows = await this.db
      .select({
        path: embeddingTable.path,
        version: sql<string>`min(${embeddingTable.metadata}->>'extractorVersion')`,
        maxVersion: sql<string>`max(${embeddingTable.metadata}->>'extractorVersion')`,
        revision: sql<string>`min(${embeddingTable.metadata}->>'revisionHash')`,
        maxRevision: sql<string>`max(${embeddingTable.metadata}->>'revisionHash')`,
      })
      .from(embeddingTable)
      .where(
        and(
          eq(embeddingTable.model, embeddingModel.id),
          or(
            like(embeddingTable.path, '%.hwp'),
            like(embeddingTable.path, '%.hwpx'),
            like(embeddingTable.path, '%.pdf'),
          ),
        ),
      )
      .groupBy(embeddingTable.path)
    return new Map(
      rows.map((row) => [
        row.path,
        row.version === row.maxVersion && row.revision === row.maxRevision
          ? `${row.version}:${row.revision}`
          : '',
      ]),
    )
  }

  async getIndexedFilePaths(
    embeddingModel: EmbeddingModelClient,
  ): Promise<string[]> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    const indexedFiles = await this.db
      .select({
        path: embeddingTable.path,
      })
      .from(embeddingTable)
      .where(eq(embeddingTable.model, embeddingModel.id))
    return [...new Set(indexedFiles.map((row) => row.path))]
  }

  async getVectorsByFilePath(
    filePath: string,
    embeddingModel: EmbeddingModelClient,
  ): Promise<SelectEmbedding[]> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    const fileVectors = await this.db
      .select()
      .from(embeddingTable)
      .where(
        and(
          eq(embeddingTable.path, filePath),
          eq(embeddingTable.model, embeddingModel.id),
        ),
      )
    return fileVectors
  }

  async deleteVectorsForSingleFile(
    filePath: string,
    embeddingModel: EmbeddingModelClient,
  ): Promise<void> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    await this.db
      .delete(embeddingTable)
      .where(
        and(
          eq(embeddingTable.path, filePath),
          eq(embeddingTable.model, embeddingModel.id),
        ),
      )
  }

  async deleteVectorsForMultipleFiles(
    filePaths: string[],
    embeddingModel: EmbeddingModelClient,
  ): Promise<void> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    if (filePaths.length === 0) {
      return
    }
    await this.db
      .delete(embeddingTable)
      .where(
        and(
          inArray(embeddingTable.path, filePaths),
          eq(embeddingTable.model, embeddingModel.id),
        ),
      )
  }

  async clearAllVectors(embeddingModel: EmbeddingModelClient): Promise<void> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    await this.db
      .delete(embeddingTable)
      .where(eq(embeddingTable.model, embeddingModel.id))
  }

  async insertVectors(data: InsertEmbedding[]): Promise<void> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    await this.db.insert(embeddingTable).values(data)
  }

  async getAllIndexedChunks(
    embeddingModel: EmbeddingModelClient,
  ): Promise<Omit<SelectEmbedding, 'embedding'>[]> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    const { embedding, ...columnsWithoutEmbedding } =
      getTableColumns(embeddingTable)
    return await this.db.transaction(
      async (tx) => {
        const result: Omit<SelectEmbedding, 'embedding'>[] = []
        let lastId: number | undefined
        for (;;) {
          const page = await tx
            .select(columnsWithoutEmbedding)
            .from(embeddingTable)
            .where(
              and(
                eq(embeddingTable.model, embeddingModel.id),
                eq(embeddingTable.dimension, embeddingModel.dimension),
                lastId === undefined
                  ? undefined
                  : gt(embeddingTable.id, lastId),
              ),
            )
            .orderBy(asc(embeddingTable.id))
            .limit(500)
          result.push(...page)
          if (page.length < 500) return result
          lastId = page[page.length - 1].id
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }

  /** Read only chunks belonging to the requested paths, in one snapshot. */
  async getIndexedChunksByPaths(
    paths: readonly string[],
    embeddingModel: EmbeddingModelClient,
  ): Promise<Omit<SelectEmbedding, 'embedding'>[]> {
    if (!this.db) throw new DatabaseNotInitializedException()
    const uniquePaths = [...new Set(paths)]
    if (uniquePaths.length === 0) return []
    const { embedding, ...columnsWithoutEmbedding } =
      getTableColumns(embeddingTable)
    return await this.db.transaction(
      async (tx) => {
        const result: Omit<SelectEmbedding, 'embedding'>[] = []
        for (let offset = 0; offset < uniquePaths.length; offset += 500) {
          const pagePaths = uniquePaths.slice(offset, offset + 500)
          let lastId: number | undefined
          for (;;) {
            const page = await tx
              .select(columnsWithoutEmbedding)
              .from(embeddingTable)
              .where(
                and(
                  inArray(embeddingTable.path, pagePaths),
                  eq(embeddingTable.model, embeddingModel.id),
                  eq(embeddingTable.dimension, embeddingModel.dimension),
                  lastId === undefined
                    ? undefined
                    : gt(embeddingTable.id, lastId),
                ),
              )
              .orderBy(asc(embeddingTable.id))
              .limit(500)
            result.push(...page)
            if (page.length < 500) break
            lastId = page[page.length - 1].id
          }
        }
        return result.sort((a, b) => a.id - b.id)
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }

  async getEmbeddingIndexSummary(
    embeddingModel: EmbeddingModelClient,
  ): Promise<EmbeddingIndexSummary> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    const [row] = await this.db
      .select({
        rowCount: count(),
        indexedFilesCount: countDistinct(embeddingTable.path),
        totalDataBytes:
          sql<number>`coalesce(sum(pg_column_size(${embeddingTable}.*)), 0)`.mapWith(
            Number,
          ),
        contentBytes:
          sql<number>`coalesce(sum(pg_column_size(${embeddingTable.content})), 0)`.mapWith(
            Number,
          ),
        embeddingBytes:
          sql<number>`coalesce(sum(pg_column_size(${embeddingTable.embedding})), 0)`.mapWith(
            Number,
          ),
        metadataBytes:
          sql<number>`coalesce(sum(pg_column_size(${embeddingTable.metadata})), 0)`.mapWith(
            Number,
          ),
        tableBytes: sql<number>`pg_relation_size('embeddings')`.mapWith(Number),
        indexBytes: sql<number>`pg_indexes_size('embeddings')`.mapWith(Number),
      })
      .from(embeddingTable)
      .where(
        and(
          eq(embeddingTable.model, embeddingModel.id),
          eq(embeddingTable.dimension, embeddingModel.dimension),
        ),
      )

    return {
      rowCount: Number(row?.rowCount ?? 0),
      indexedFilesCount: Number(row?.indexedFilesCount ?? 0),
      totalDataBytes: Number(row?.totalDataBytes ?? 0),
      contentBytes: Number(row?.contentBytes ?? 0),
      embeddingBytes: Number(row?.embeddingBytes ?? 0),
      metadataBytes: Number(row?.metadataBytes ?? 0),
      tableBytes: Number(row?.tableBytes ?? 0),
      indexBytes: Number(row?.indexBytes ?? 0),
    }
  }

  /** Returns chunk metadata and stored BM25 statistics without chunk bodies. */
  async getAllIndexedChunkMetadata(
    embeddingModel: EmbeddingModelClient,
  ): Promise<IndexedChunkMetadata[]> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    const { embedding, content, ...columnsWithoutBody } =
      getTableColumns(embeddingTable)
    // A single large Worker response can exhaust BroadcastChannel cloning.
    // Keep one repeatable-read snapshot while bounding each transferred page.
    return await this.db.transaction(
      async (tx) => {
        const result: IndexedChunkMetadata[] = []
        let lastId: number | undefined
        for (;;) {
          const page = await tx
            .select(columnsWithoutBody)
            .from(embeddingTable)
            .where(
              and(
                eq(embeddingTable.model, embeddingModel.id),
                eq(embeddingTable.dimension, embeddingModel.dimension),
                lastId === undefined
                  ? undefined
                  : gt(embeddingTable.id, lastId),
              ),
            )
            .orderBy(asc(embeddingTable.id))
            .limit(500)
          result.push(...page)
          if (page.length < 500) return result
          lastId = page[page.length - 1].id
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }

  async performSimilaritySearch(
    queryVector: number[],
    embeddingModel: EmbeddingModelClient,
    options: {
      minSimilarity: number
      limit: number
      scope?: EmbeddingSearchScope
    },
  ): Promise<
    (Omit<SelectEmbedding, 'embedding'> & {
      similarity: number
    })[]
  > {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    const similarity = sql<number>`1 - (${cosineDistance(embeddingTable.embedding, queryVector)})`
    const similarityCondition = gt(similarity, options.minSimilarity)

    const scopeCondition = this.getScopeCondition(options.scope)

    const similaritySearchResults = await this.db
      .select({
        ...(() => {
          const { embedding, ...rest } = getTableColumns(embeddingTable)
          return rest
        })(),
        similarity,
      })
      .from(embeddingTable)
      .where(
        and(
          similarityCondition,
          scopeCondition,
          eq(embeddingTable.model, embeddingModel.id),
          eq(embeddingTable.dimension, embeddingModel.dimension), // include this to fully utilize partial index
        ),
      )
      .orderBy((t) => desc(t.similarity))
      .limit(options.limit)

    return similaritySearchResults
  }

  /**
   * Performs the vector ranking phase without transferring chunk bodies.
   * Call getIndexedChunksByIds for the small set of candidates that survive
   * ranking or need to be sent to a reranker.
   */
  async performSimilaritySearchMetadata(
    queryVector: number[],
    embeddingModel: EmbeddingModelClient,
    options: {
      minSimilarity: number
      limit: number
      scope?: EmbeddingSearchScope
    },
  ): Promise<EmbeddingSearchMetadata[]> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    const similarity = sql<number>`1 - (${cosineDistance(embeddingTable.embedding, queryVector)})`
    const similarityCondition = gt(similarity, options.minSimilarity)
    const scopeCondition = this.getScopeCondition(options.scope)

    return await this.db
      .select({
        id: embeddingTable.id,
        path: embeddingTable.path,
        mtime: embeddingTable.mtime,
        model: embeddingTable.model,
        dimension: embeddingTable.dimension,
        metadata: embeddingTable.metadata,
        similarity,
      })
      .from(embeddingTable)
      .where(
        and(
          similarityCondition,
          scopeCondition,
          eq(embeddingTable.model, embeddingModel.id),
          eq(embeddingTable.dimension, embeddingModel.dimension),
        ),
      )
      .orderBy((t) => desc(t.similarity))
      .limit(options.limit)
  }

  /** Hydrates only the requested vector rows, including their stored bodies. */
  async getIndexedChunksByIds(
    ids: readonly number[],
    embeddingModel: EmbeddingModelClient,
  ): Promise<Omit<SelectEmbedding, 'embedding'>[]> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    if (ids.length === 0) {
      return []
    }
    const { embedding, ...columnsWithoutEmbedding } =
      getTableColumns(embeddingTable)
    const uniqueIds = [...new Set(ids)]
    const pageSize = 500
    if (uniqueIds.length <= pageSize) {
      return await this.db
        .select(columnsWithoutEmbedding)
        .from(embeddingTable)
        .where(
          and(
            inArray(embeddingTable.id, uniqueIds),
            eq(embeddingTable.model, embeddingModel.id),
            eq(embeddingTable.dimension, embeddingModel.dimension),
          ),
        )
    }
    return await this.db.transaction(
      async (tx) => {
        const result: Omit<SelectEmbedding, 'embedding'>[] = []
        for (let offset = 0; offset < uniqueIds.length; offset += pageSize) {
          const page = await tx
            .select(columnsWithoutEmbedding)
            .from(embeddingTable)
            .where(
              and(
                inArray(
                  embeddingTable.id,
                  uniqueIds.slice(offset, offset + pageSize),
                ),
                eq(embeddingTable.model, embeddingModel.id),
                eq(embeddingTable.dimension, embeddingModel.dimension),
              ),
            )
          result.push(...page)
        }
        return result
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }

  /**
   * Bounded metadata-only pagination for a single file path (no content or
   * embedding columns). Used by ContextForestService to select up to 3
   * evenly distributed valid-revision chunk IDs per note without OOM.
   */
  async getVectorChunkMetadataPageByPath(
    filePath: string,
    embeddingModel: EmbeddingModelClient,
    options: {
      afterId?: number
      limit?: number
    } = {},
  ): Promise<IndexedChunkMetadata[]> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    const pageLimit = Math.min(128, Math.max(1, options.limit ?? 128))
    const afterCondition =
      typeof options.afterId === 'number'
        ? gt(embeddingTable.id, options.afterId)
        : undefined
    return await this.db
      .select({
        id: embeddingTable.id,
        path: embeddingTable.path,
        mtime: embeddingTable.mtime,
        model: embeddingTable.model,
        dimension: embeddingTable.dimension,
        metadata: embeddingTable.metadata,
      })
      .from(embeddingTable)
      .where(
        and(
          eq(embeddingTable.path, filePath),
          eq(embeddingTable.model, embeddingModel.id),
          eq(embeddingTable.dimension, embeddingModel.dimension),
          afterCondition,
        ),
      )
      .orderBy(asc(embeddingTable.id))
      .limit(pageLimit)
  }

  /**
   * Hydrates only stored embedding vectors (and locator metadata, without chunk
   * body content) for selected representative chunk IDs.
   */
  async getVectorEmbeddingsByIds(
    ids: readonly number[],
    embeddingModel: EmbeddingModelClient,
  ): Promise<Omit<SelectEmbedding, 'content'>[]> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }
    if (ids.length === 0) {
      return []
    }
    return await this.db
      .select({
        id: embeddingTable.id,
        path: embeddingTable.path,
        mtime: embeddingTable.mtime,
        model: embeddingTable.model,
        dimension: embeddingTable.dimension,
        embedding: embeddingTable.embedding,
        metadata: embeddingTable.metadata,
      })
      .from(embeddingTable)
      .where(
        and(
          inArray(embeddingTable.id, [...ids]),
          eq(embeddingTable.model, embeddingModel.id),
          eq(embeddingTable.dimension, embeddingModel.dimension),
        ),
      )
      .orderBy(asc(embeddingTable.id))
  }

  private getScopeCondition(scope?: EmbeddingSearchScope): SQL | undefined {
    if (!scope) {
      return undefined
    }
    const conditions: (SQL | undefined)[] = []
    if (scope.files.length > 0) {
      conditions.push(inArray(embeddingTable.path, scope.files))
    }
    if (scope.folders.length > 0) {
      conditions.push(
        or(
          ...scope.folders.map((folder) =>
            like(embeddingTable.path, `${folder}/%`),
          ),
        ),
      )
    }
    if (conditions.length === 0) {
      return undefined
    }
    return or(...conditions)
  }

  async getEmbeddingStats(): Promise<EmbeddingDbStats[]> {
    if (!this.db) {
      throw new DatabaseNotInitializedException()
    }

    const stats = await this.db
      .select({
        model: embeddingTable.model,
        rowCount: count(),
        totalDataBytes: sum(sql`pg_column_size(${embeddingTable}.*)`).mapWith(
          Number,
        ),
        contentBytes:
          sql<number>`coalesce(sum(pg_column_size(${embeddingTable.content})), 0)`.mapWith(
            Number,
          ),
        embeddingBytes:
          sql<number>`coalesce(sum(pg_column_size(${embeddingTable.embedding})), 0)`.mapWith(
            Number,
          ),
        metadataBytes:
          sql<number>`coalesce(sum(pg_column_size(${embeddingTable.metadata})), 0)`.mapWith(
            Number,
          ),
        tableBytes: sql<number>`pg_relation_size('embeddings')`.mapWith(Number),
        indexBytes: sql<number>`pg_indexes_size('embeddings')`.mapWith(Number),
      })
      .from(embeddingTable)
      .groupBy(embeddingTable.model)
      .orderBy(embeddingTable.model)

    return stats
  }
}
