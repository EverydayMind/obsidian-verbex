import type { ResolvedLinks } from '../../utils/vault-relations'
import { backlinks } from '../../utils/vault-relations'

import { extractMarkdownLinkReferences } from './linkedMarkdown'
import { type RetrievalScope, isPathWithinScope } from './retrievalScope'
import type { ChunkLocator } from './retrievalTypes'

export type GraphRelationKind =
  | 'wikilink_out'
  | 'backlink_in'
  | 'adjacent'
  | 'shared_tag'
  | 'frontmatter_ref'
  | 'folder_adjacent'

type DiscoveredGraphRelationBase = {
  seedUnitId: string
  seedScore: number
  seedPath: string
}

export type DiscoveredGraphRelation =
  | (DiscoveredGraphRelationBase & {
      relation: 'wikilink_out'
      targetRef: string
      anchor?: string
    })
  | (DiscoveredGraphRelationBase & {
      relation: 'backlink_in'
      targetPath: string
    })
  | (DiscoveredGraphRelationBase & {
      relation: 'adjacent'
      targetLocator: ChunkLocator
    })
  | (DiscoveredGraphRelationBase & {
      relation: 'shared_tag' | 'frontmatter_ref' | 'folder_adjacent'
      targetPath: string
      tag?: string
      field?: string
    })

export function discoverWikilinkOut(
  seedContent: string,
  seedPath: string,
  seedUnitId: string,
  seedScore: number,
): DiscoveredGraphRelation[] {
  return extractMarkdownLinkReferences(seedContent).map((reference) => ({
    relation: 'wikilink_out',
    seedPath,
    seedUnitId,
    seedScore,
    targetRef: reference.target,
    ...(reference.anchor ? { anchor: reference.anchor } : {}),
  }))
}

export function discoverBacklinkIn(
  resolvedLinks: ResolvedLinks,
  seedPath: string,
  seedUnitId: string,
  seedScore: number,
  scope?: RetrievalScope,
): DiscoveredGraphRelation[] {
  return backlinks(resolvedLinks, seedPath)
    .filter((link) => isPathWithinScope(link.path, scope))
    .map((link) => ({
      relation: 'backlink_in',
      seedPath,
      seedUnitId,
      seedScore,
      targetPath: link.path,
    }))
}

export function discoverAdjacentChunks(
  sameFileChunksSortedByLine: readonly ChunkLocator[],
  seedLocator: ChunkLocator,
  seedUnitId: string,
  seedScore: number,
): DiscoveredGraphRelation[] {
  const previous = sameFileChunksSortedByLine
    .filter(
      (candidate) =>
        candidate.path === seedLocator.path &&
        candidate.unitId !== seedUnitId &&
        candidate.endLine < seedLocator.startLine,
    )
    .sort(
      (left, right) =>
        right.endLine - left.endLine ||
        right.startLine - left.startLine ||
        right.unitId.localeCompare(left.unitId),
    )[0]
  const next = sameFileChunksSortedByLine
    .filter(
      (candidate) =>
        candidate.path === seedLocator.path &&
        candidate.unitId !== seedUnitId &&
        candidate.startLine > seedLocator.endLine,
    )
    .sort(
      (left, right) =>
        left.startLine - right.startLine ||
        left.endLine - right.endLine ||
        left.unitId.localeCompare(right.unitId),
    )[0]

  return [previous, next]
    .filter((candidate): candidate is ChunkLocator => candidate !== undefined)
    .map((targetLocator) => ({
      relation: 'adjacent',
      seedPath: seedLocator.path,
      seedUnitId,
      seedScore,
      targetLocator,
    }))
}

export type GraphNoteMetadata = {
  path: string
  tags?: readonly string[]
  folderPath?: string
}

export function discoverSharedTagRelations(
  seedPath: string,
  seedTags: readonly string[],
  candidates: readonly GraphNoteMetadata[],
  seedUnitId: string,
  seedScore: number,
  scope?: RetrievalScope,
  limit = 2,
): DiscoveredGraphRelation[] {
  const tags = new Set(seedTags.map((tag) => tag.toLowerCase()))
  if (tags.size === 0) return []
  return candidates
    .filter(
      (candidate) =>
        candidate.path !== seedPath &&
        isPathWithinScope(candidate.path, scope) &&
        candidate.tags?.some((tag) => tags.has(tag.toLowerCase())),
    )
    .map((candidate) => ({
      relation: 'shared_tag' as const,
      seedPath,
      seedUnitId,
      seedScore,
      targetPath: candidate.path,
      tag: candidate.tags?.find((tag) => tags.has(tag.toLowerCase())),
    }))
    .sort((left, right) => left.targetPath.localeCompare(right.targetPath))
    .slice(0, Math.max(0, limit))
}

export function discoverFrontmatterReferences(
  seedPath: string,
  references: readonly { targetPath: string; field?: string }[],
  seedUnitId: string,
  seedScore: number,
  scope?: RetrievalScope,
  limit = 2,
): DiscoveredGraphRelation[] {
  return references
    .filter(
      (reference) =>
        reference.targetPath !== seedPath &&
        isPathWithinScope(reference.targetPath, scope),
    )
    .map((reference) => ({
      relation: 'frontmatter_ref' as const,
      seedPath,
      seedUnitId,
      seedScore,
      targetPath: reference.targetPath,
      ...(reference.field ? { field: reference.field } : {}),
    }))
    .sort(
      (left, right) =>
        left.targetPath.localeCompare(right.targetPath) ||
        (left.field ?? '').localeCompare(right.field ?? ''),
    )
    .filter(
      (relation, index, relations) =>
        relations.findIndex(
          (candidate) => candidate.targetPath === relation.targetPath,
        ) === index,
    )
    .slice(0, Math.max(0, limit))
}

export function discoverFolderAdjacentRelations(
  seedPath: string,
  folderPath: string,
  candidates: readonly GraphNoteMetadata[],
  seedUnitId: string,
  seedScore: number,
  scope?: RetrievalScope,
  limit = 2,
): DiscoveredGraphRelation[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.path !== seedPath &&
        candidate.folderPath === folderPath &&
        isPathWithinScope(candidate.path, scope),
    )
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, Math.max(0, limit))
    .map((candidate) => ({
      relation: 'folder_adjacent' as const,
      seedPath,
      seedUnitId,
      seedScore,
      targetPath: candidate.path,
    }))
}
