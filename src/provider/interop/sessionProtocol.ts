import { z } from 'zod'

import { copyJson } from './descriptorReader'
import type { JsonObject } from './protocol'

/**
 * agentinterop v1, session effect: what a provider reports about an edit of
 * its unsaved working copy. These `_meta` fields are host-only. The host reads
 * status from them and never from the wording of the result text.
 */
export const META_SESSION_EDIT = 'dev.agentinterop/sessionEdit'
export const META_OBSERVATIONS = 'dev.agentinterop/observations'
export const META_CHANGE_PREVIEW = 'dev.agentinterop/changePreview'

const token = z.string().min(1).max(256)
const path = z.string().min(1).max(4096)
const revision = z.number().int().nonnegative()

const documentRef = z
  .object({
    path,
    sessionId: token,
    incarnation: token,
    documentEpoch: token,
  })
  .strict()
export type DocumentRef = z.infer<typeof documentRef>

const resolvedTarget = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('existing'),
      document: documentRef,
      revision,
      destination: path.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('new'),
      destination: path,
      template: z.object({ path, sha256: token }).strict().optional(),
    })
    .strict(),
])
export type ResolvedTarget = z.infer<typeof resolvedTarget>

const receipt = z
  .object({
    applied: z.enum(['yes', 'no', 'unknown']),
    path,
    sessionId: token,
    documentEpoch: token,
    revisionBefore: revision,
    revisionAfter: revision.optional(),
    undo: z
      .object({ available: z.boolean(), revision: revision.optional() })
      .strict()
      .optional(),
    changedHandles: z.array(token).max(1000),
    changedPages: z.array(z.number().int().positive()).max(5000),
    /**
     * Stable identity of the requested operation across narrowed retries
     * (the same find/replace tried again with a narrower scope).
     */
    operationId: z.string().min(1).max(128).optional(),
  })
  .strict()
export type SessionEditReceipt = z.infer<typeof receipt>

const observations = z
  .array(
    z
      .object({
        token,
        handles: z.array(token).max(2000),
        complete: z.boolean(),
      })
      .strict(),
  )
  .max(64)
const preview = z
  .array(
    z
      .object({
        handle: token,
        before: z.string().max(12000),
        after: z.string().max(12000),
      })
      .strict(),
  )
  .max(50)
  .refine(
    (items) =>
      items.reduce(
        (sum, item) => sum + item.before.length + item.after.length,
        0,
      ) <= 12000,
    'change preview exceeds total display limit',
  )
const openDocuments = z
  .array(
    documentRef
      .extend({
        hasView: z.boolean(),
        dirty: z.boolean(),
        heldForAgent: z.array(token).max(64),
      })
      .strict(),
  )
  .max(256)
export type OpenDocumentRef = z.infer<typeof openDocuments>[number]

const TARGET_LIMITS = { maxDepth: 6, maxNodes: 200, maxBytes: 32 * 1024 }
const LIST_LIMITS = { maxDepth: 6, maxNodes: 8000, maxBytes: 1024 * 1024 }

export function parseResolvedTarget(raw: unknown): ResolvedTarget {
  return resolvedTarget.parse(copyJson(raw, TARGET_LIMITS))
}
export function parseDocumentRef(raw: unknown): DocumentRef {
  return documentRef.parse(copyJson(raw, TARGET_LIMITS))
}
export function parseOpenDocuments(raw: unknown): OpenDocumentRef[] {
  return openDocuments.parse(copyJson(raw, LIST_LIMITS))
}

/** Observation tokens of a complete result. An incomplete one is no basis for an edit. */
export function observationTokens(meta: JsonObject): string[] {
  const raw = meta[META_OBSERVATIONS]
  if (raw === undefined) return []
  return observations
    .parse(raw)
    .filter((item) => item.complete)
    .map((item) => item.token)
}

export function readSessionMeta(meta: JsonObject): {
  receipt: SessionEditReceipt
  preview: { handle: string; before: string; after: string }[]
  location?: { handle?: string }
} {
  return {
    receipt: receipt.parse(meta[META_SESSION_EDIT]),
    location: z
      .object({ handle: token.optional() })
      .strict()
      .optional()
      .parse(meta['dev.agentinterop/reveal']),
    preview:
      meta[META_CHANGE_PREVIEW] === undefined
        ? []
        : preview.parse(meta[META_CHANGE_PREVIEW]),
  }
}

/** What the chat change card shows about one session edit. */
export type SessionEditFact = {
  /** A refused edit offers navigation only, never a claim that the working copy changed. */
  refused?: true
  providerId: string
  tool: string
  path: string
  sessionId: string
  /** Optional on older persisted cards; never use their handles without it. */
  incarnation?: string
  revisionBefore: number
  revisionAfter?: number
  undoAvailable: boolean
  changedPages: number[]
  preview: { handle: string; before: string; after: string }[]
  /** Whether a person could see the document when it was edited. Absent when unknown. */
  visible?: boolean
}
