import { sha256Hex } from '../../utils/hash'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { splitLines } from '../tools/noteSlicing'

import {
  type DiscoveredGraphRelation,
  type GraphRelationKind,
} from './graphRelationDiscovery'
import {
  resolveAnchorLineRange,
  sliceInclusiveLines,
} from './retrievalHydration'
import { type RetrievalScope, isPathWithinScope } from './retrievalScope'
import type {
  ChunkLocator,
  RetrievalHit,
  RetrievalProvenance,
} from './retrievalTypes'

export type MaterializeGraphRelationsDeps = {
  resolveLinkedFile: (
    sourcePath: string,
    targetRef: string,
  ) => { path: string } | null
  readFile: (path: string) => Promise<string | null>
  scopedBm25Search?: (
    query: string,
    path: string,
  ) => Promise<ChunkLocator | null>
  chunkSize: number
  scope?: RetrievalScope
}

const provenanceByRelation: Record<GraphRelationKind, RetrievalProvenance> = {
  wikilink_out: 'wikilink',
  backlink_in: 'backlink',
  adjacent: 'adjacent',
  shared_tag: 'shared_tag',
  frontmatter_ref: 'frontmatter_ref',
  folder_adjacent: 'folder_adjacent',
}

function firstChunk(
  content: string,
  chunkSize: number,
): {
  content: string
  startLine: number
  endLine: number
} {
  const lines = splitLines(content)
  const maxChars = Math.max(1, Math.floor(chunkSize))
  let endLine = 1
  for (let index = 0; index < lines.length; index += 1) {
    const candidate = lines.slice(0, index + 1).join('\n')
    endLine = index + 1
    if (candidate.length >= maxChars) break
  }
  return {
    content: sliceInclusiveLines(content, 1, endLine),
    startLine: 1,
    endLine,
  }
}

async function locatorForContent(
  path: string,
  content: string,
  startLine: number,
  endLine: number,
  headingPath?: string[],
): Promise<{ locator: ChunkLocator; content: string }> {
  const revisionHash = await sha256Hex(content)
  return {
    locator: {
      unitId: `${path}@${revisionHash}:${startLine}-${endLine}`,
      path,
      startLine,
      endLine,
      revisionHash,
      ...(headingPath ? { headingPath } : {}),
    },
    content,
  }
}

export async function materializeGraphRelation(
  relation: DiscoveredGraphRelation,
  seedPath: string,
  query: string,
  deps: MaterializeGraphRelationsDeps,
  relationWeight: Record<GraphRelationKind, number>,
): Promise<RetrievalHit | null> {
  let locator: ChunkLocator
  let content: string | undefined

  if (relation.relation === 'adjacent') {
    locator = relation.targetLocator
  } else {
    const targetPath =
      relation.relation === 'wikilink_out'
        ? (deps.resolveLinkedFile(seedPath, relation.targetRef)?.path ?? null)
        : relation.targetPath
    if (!targetPath || !isPathWithinScope(targetPath, deps.scope)) return null

    if (relation.relation === 'wikilink_out' && relation.anchor) {
      const source = await deps.readFile(targetPath)
      if (source === null) return null
      const range = resolveAnchorLineRange(source, relation.anchor)
      const sliced = sliceInclusiveLines(source, range.startLine, range.endLine)
      const materialized = await locatorForContent(
        targetPath,
        sliced,
        range.startLine,
        range.endLine,
        range.headingPath,
      )
      locator = materialized.locator
      content = materialized.content
    } else {
      const bm25Locator = deps.scopedBm25Search
        ? await deps.scopedBm25Search(query, targetPath)
        : null
      if (bm25Locator) {
        locator = bm25Locator
      } else {
        const source = await deps.readFile(targetPath)
        if (source === null) return null
        const chunk = firstChunk(source, deps.chunkSize)
        const materialized = await locatorForContent(
          targetPath,
          chunk.content,
          chunk.startLine,
          chunk.endLine,
        )
        locator = materialized.locator
        content = materialized.content
      }
    }
  }

  const provenance = provenanceByRelation[relation.relation]
  return {
    locator,
    ...(content !== undefined
      ? { content, tokenEstimate: estimateTokens(content) }
      : {}),
    scores: { graph: relation.seedScore * relationWeight[relation.relation] },
    provenance: [provenance],
  }
}
