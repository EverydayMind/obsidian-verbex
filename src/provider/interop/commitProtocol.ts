import { z } from 'zod'

import { canonicalDigest } from '../../security/promptInjectionBoundary'

import * as wording from './commitProtocolText'
import { copyJson } from './descriptorReader'
import type { Caller, JsonObject } from './protocol'
import type { ResolvedTarget } from './sessionProtocol'

/**
 * agentinterop v1, commit effect: what a provider reports when it prepares and
 * performs a write of user files. The provider writes; the host binds the
 * write to what the user approved, checkpoints the whole write set first and
 * reads every file back afterwards (control contract v1.13).
 */
const token = z.string().min(1).max(256)
const path = z.string().min(1).max(4096)
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const json = z.record(z.string(), z.unknown())

const fileEntry = z
  .object({
    kind: z.literal('file'),
    path,
    op: z.enum(['modify', 'create']),
    role: z.enum(['primary', 'derived']),
    sha256Before: sha256.nullable(),
    sha256Expected: sha256,
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict()
const folderEntry = z
  .object({
    kind: z.literal('folder'),
    path,
    op: z.literal('create'),
    role: z.literal('folder'),
    existedBefore: z.literal(false),
  })
  .strict()
const writeSet = z
  .array(z.discriminatedUnion('kind', [fileEntry, folderEntry]))
  .max(64)
export type WriteSetEntry = z.infer<typeof writeSet>[number]
export type FileWriteEntry = z.infer<typeof fileEntry>

const source = z
  .object({
    path,
    sessionId: token,
    incarnation: token,
    documentEpoch: token,
    revision: z.number().int().nonnegative(),
    baseHash: sha256,
  })
  .strict()

const preparation = z
  .object({
    preparationId: token,
    mode: z.enum(['overwrite', 'save_as', 'create']),
    source: source.optional(),
    template: z.object({ path, sha256 }).strict().optional(),
    destination: path,
    format: z.string().min(1).max(32),
    saveOptions: json,
    writeSet,
    preparationDigest: sha256,
    providerInternalWrites: z.array(z.string().max(500)).max(16),
    report: json,
    expiresAt: z.string().max(64),
  })
  .strict()
export type CommitPreparation = z.infer<typeof preparation> & {
  saveOptions: JsonObject
  report: JsonObject
}

const receipt = z
  .object({
    preparationId: token,
    ticketId: token,
    preparationDigest: sha256,
    state: z.enum(['written', 'not_written', 'partial', 'pending', 'unknown']),
    entries: z
      .array(
        z
          .object({
            path,
            kind: z.enum(['file', 'folder']),
            state: z.enum(['written', 'unchanged', 'not_written', 'unknown']),
            sha256After: sha256.optional(),
          })
          .strict(),
      )
      .max(64),
    warnings: z.array(z.string().max(1000)).max(64),
    error: z
      .object({ code: z.string().max(64), message: z.string().max(1000) })
      .strict()
      .optional(),
  })
  .strict()
export type CommitReceipt = z.infer<typeof receipt>
export type CommitState = Exclude<CommitReceipt['state'], 'pending'>

export type CommitTicket = {
  ticketId: string
  preparationId: string
  preparationDigest: string
  providerIdentity: {
    providerId: string
    generation: string
    descriptorDigest: string
    toolSchemaDigest: string
  }
  caller: Caller
  source?: CommitPreparation['source']
  destination: string
  writeSet: WriteSetEntry[]
  approvedAt: string
  expiresAt: string
}

const LIMITS = { maxDepth: 12, maxNodes: 20_000, maxBytes: 1024 * 1024 }
export const PREPARATION_TTL_MS = 10 * 60_000
export const MAX_COMMIT_BYTES = 100 * 1024 * 1024

export function parseReceipt(raw: unknown): CommitReceipt {
  return receipt.parse(copyJson(raw, LIMITS))
}

/** The digest the provider must have bound: every field except the digest itself. */
export async function preparationDigest(
  value: CommitPreparation,
): Promise<string> {
  const { preparationDigest: _own, ...body } = value
  return canonicalDigest(body)
}

const extension = (value: string) =>
  /\.[^./]+$/.exec(value)?.[0].toLowerCase() ?? ''
const parentOf = (value: string) => value.split('/').slice(0, -1).join('/')

/**
 * Reads a provider's preparation and checks it against the target the host
 * fixed. Throws on the first defect: a preparation is approved whole or not
 * shown at all.
 */
export async function parsePreparation(
  raw: unknown,
  target: ResolvedTarget,
  vaultPath: (path: string) => string,
  now = Date.now(),
): Promise<CommitPreparation> {
  const value = preparation.parse(copyJson(raw, LIMITS)) as CommitPreparation
  if ((await preparationDigest(value)) !== value.preparationDigest)
    throw new Error(wording.digestMismatch())
  const expires = Date.parse(value.expiresAt)
  if (
    !Number.isFinite(expires) ||
    expires <= now ||
    expires > now + PREPARATION_TTL_MS + 60_000
  )
    throw new Error(wording.invalidExpiry())
  const paths = value.writeSet.map((entry) => entry.path)
  for (const item of [
    value.destination,
    ...paths,
    ...(value.source ? [value.source.path] : []),
    ...(value.template ? [value.template.path] : []),
  ])
    if (vaultPath(item) !== item) throw new Error(wording.invalidPath())
  if (new Set(paths.map((item) => item.toLowerCase())).size !== paths.length)
    throw new Error(wording.duplicatePath())

  // Mode against the target the provider itself resolved before preparing.
  if (value.mode === 'create') {
    if (target.kind !== 'new' || value.source)
      throw new Error(wording.newTargetMismatch())
    if (target.destination !== value.destination)
      throw new Error(wording.newPathMismatch())
    const expected = target.template
    if (
      (expected?.path ?? '') !== (value.template?.path ?? '') ||
      (expected?.sha256 ?? '') !== (value.template?.sha256 ?? '')
    )
      throw new Error(wording.templateMismatch())
    if (
      value.template &&
      extension(value.template.path) !== extension(value.destination)
    )
      throw new Error(wording.templateFormatMismatch())
  } else {
    const document = target.kind === 'existing' ? target.document : undefined
    const from = value.source
    if (
      !document ||
      !from ||
      value.template ||
      from.path !== document.path ||
      from.sessionId !== document.sessionId ||
      from.incarnation !== document.incarnation ||
      from.revision !== (target as { revision: number }).revision
    )
      throw new Error(wording.sourceMismatch())
    const destination =
      (target as { destination?: string }).destination ?? document.path
    if (destination !== value.destination)
      throw new Error(wording.destinationMismatch())
    if ((value.mode === 'overwrite') !== (value.destination === from.path))
      throw new Error(wording.modeMismatch())
    if (extension(from.path) !== extension(value.destination))
      throw new Error(wording.formatMismatch())
  }

  const files = value.writeSet.filter(
    (entry): entry is FileWriteEntry => entry.kind === 'file',
  )
  if (!value.writeSet.length) {
    // Nothing to write is a result only for a clean overwrite.
    if (value.mode !== 'overwrite') throw new Error(wording.emptyWriteSet())
    return value
  }
  const primaries = files.filter((entry) => entry.role === 'primary')
  if (primaries.length !== 1 || primaries[0].path !== value.destination)
    throw new Error(wording.primaryMismatch())
  if ((primaries[0].op === 'modify') !== (value.mode === 'overwrite'))
    throw new Error(wording.primaryModeMismatch())
  for (const entry of files)
    if ((entry.op === 'modify') !== (entry.sha256Before !== null))
      throw new Error(wording.beforeHashMismatch())
  if (files.reduce((sum, entry) => sum + entry.sizeBytes, 0) > MAX_COMMIT_BYTES)
    throw new Error(wording.tooLarge())
  // A folder is listed only when a file of this write set is created under it.
  for (const entry of value.writeSet)
    if (
      entry.kind === 'folder' &&
      !files.some(
        (file) =>
          file.op === 'create' &&
          `${parentOf(file.path)}/`.startsWith(`${entry.path}/`),
      )
    )
      throw new Error(wording.folderMismatch())
  return value
}

/** Overall state from what the host itself read back for each entry. */
export function overallState(
  states: readonly CommitReceipt['entries'][number]['state'][],
): CommitState {
  if (states.some((state) => state === 'unknown')) return 'unknown'
  const done = states.filter(
    (state) => state === 'written' || state === 'unchanged',
  ).length
  if (done === states.length) return 'written'
  return states.some((state) => state === 'written') ? 'partial' : 'not_written'
}
