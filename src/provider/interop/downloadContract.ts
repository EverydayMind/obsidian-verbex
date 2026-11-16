import { z } from 'zod'

import type { JsonObject, JsonValue } from './protocol'

export const fileSaveSchema = z
  .object({
    grantRef: z.string().min(1),
    downloadId: z.string().min(1),
    nativeDownload: z.enum(['not_started', 'completed', 'unknown']),
    publication: z.enum(['not_written', 'written', 'unknown']),
    cleanupPending: z.boolean(),
  })
  .strict()

export function checkFileSaveStatus(raw: unknown): void {
  const status = object(raw)
  if (status.fileSave === undefined) return
  if (status.status !== 'completed') throw new Error('Invalid save status')
  checkFileSaveReceipt(status, 'file_save')
}

const object = (raw: unknown): JsonObject => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid download metadata')
  return raw as JsonObject
}
const exact = (value: JsonObject, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key))
const origin = (value: unknown) => {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value
  } catch {
    return false
  }
}

/** Human selection is not execution approval. Local paths must never enter this card. */
export function checkDownloadApproval(
  prepared: JsonObject,
  expected: { toolName: string; args: JsonValue },
): void {
  if (expected.toolName !== 'file_save') return
  const args = object(expected.args),
    target = object(prepared.target)
  const download = object(object(prepared.approvalCard).download)
  if (
    target.kind !== 'webhands' ||
    typeof download.grantRef !== 'string' ||
    !download.grantRef ||
    typeof download.downloadId !== 'string' ||
    !download.downloadId ||
    (args.tabId !== undefined && args.tabId !== target.tabId) ||
    download.grantRef !== args.grantRef ||
    download.downloadId !== args.downloadId ||
    !origin(download.sourceOrigin) ||
    (download.initiatorOrigin !== null && !origin(download.initiatorOrigin)) ||
    typeof download.name !== 'string' ||
    !download.name.trim() ||
    download.name.length > 200 ||
    /[\\/:*?"<>|]/.test(download.name) ||
    Array.from(download.name).some((char) => char.charCodeAt(0) < 32) ||
    /[. ]$/.test(download.name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(download.name) ||
    !Number.isSafeInteger(download.size) ||
    Number(download.size) <= 0 ||
    Number(download.size) > 200 * 1024 * 1024 ||
    typeof download.mime !== 'string' ||
    !download.mime ||
    download.mime.length > 128 ||
    typeof download.directoryLabel !== 'string' ||
    !download.directoryLabel.trim() ||
    download.directoryLabel.length > 120 ||
    /[\\/:]/.test(download.directoryLabel) ||
    Array.from(download.directoryLabel).some(
      (char) => char.charCodeAt(0) < 32,
    ) ||
    !exact(download, [
      'grantRef',
      'downloadId',
      'name',
      'size',
      'mime',
      'sourceOrigin',
      'initiatorOrigin',
      'directoryLabel',
    ])
  ) {
    throw new Error('Invalid download approval binding')
  }
}

/** A validated provider fact; never inferred from application, error text or page content. */
export function checkFileSaveReceipt(
  receipt: JsonObject,
  toolName?: string,
  selected?: JsonValue,
): JsonObject | undefined {
  if (toolName !== 'file_save') {
    if (receipt.fileSave !== undefined)
      throw new Error('Unexpected file save receipt')
    return undefined
  }
  const save = object(receipt.fileSave)
  const expected = selected === undefined ? undefined : object(selected)
  if (
    !exact(save, [
      'grantRef',
      'downloadId',
      'nativeDownload',
      'publication',
      'cleanupPending',
    ]) ||
    typeof save.grantRef !== 'string' ||
    !save.grantRef ||
    typeof save.downloadId !== 'string' ||
    !save.downloadId ||
    (expected &&
      (save.grantRef !== expected.grantRef ||
        save.downloadId !== expected.downloadId)) ||
    typeof save.nativeDownload !== 'string' ||
    !['not_started', 'completed', 'unknown'].includes(save.nativeDownload) ||
    typeof save.publication !== 'string' ||
    !['not_written', 'written', 'unknown'].includes(save.publication) ||
    typeof save.cleanupPending !== 'boolean' ||
    (save.publication === 'written' && save.nativeDownload !== 'completed') ||
    (save.publication === 'unknown' && save.nativeDownload === 'not_started') ||
    (save.publication === 'unknown' &&
      save.nativeDownload === 'unknown' &&
      (receipt.dispatched !== 'unknown' ||
        receipt.application !== 'unknown')) ||
    (receipt.application === 'applied' &&
      (save.publication !== 'written' ||
        save.nativeDownload !== 'completed')) ||
    (receipt.dispatched === 'no' &&
      (save.nativeDownload !== 'not_started' ||
        save.publication !== 'not_written')) ||
    receipt.inputsPlanned !== 1 ||
    (save.nativeDownload === 'not_started' && receipt.inputsSent !== 0) ||
    (save.nativeDownload === 'completed' && receipt.inputsSent !== 1)
  ) {
    throw new Error('Invalid file save receipt')
  }
  return save
}

export { fileSaveFacts } from './downloadFacts'
