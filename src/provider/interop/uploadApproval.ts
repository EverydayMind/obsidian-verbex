import { stringifyUnknown } from '../../utils/stringifyUnknown'

import type { JsonObject, JsonValue } from './protocol'

/** File selection is metadata. A fresh per-call human decision is still required. */
export function checkUploadApproval(
  prepared: JsonObject,
  expected: { toolName: string; args: JsonValue },
  object: (raw: unknown) => JsonObject,
): void {
  if (expected.toolName !== 'file_upload') return
  const args = object(expected.args)
  const target = object(prepared.target)
  const upload = object(object(prepared.approvalCard).upload)
  let destination: URL
  try {
    destination = new URL(stringifyUnknown(upload.destinationOrigin))
  } catch {
    throw new Error('Invalid upload destination origin')
  }
  const keys = [
    'grantRef',
    'observationId',
    'elementRef',
    'name',
    'size',
    'mime',
    'destinationOrigin',
  ]
  if (
    target.kind !== 'webhands' ||
    (args.tabId !== undefined && args.tabId !== target.tabId) ||
    upload.grantRef !== args.grantRef ||
    upload.observationId !== args.observationId ||
    upload.elementRef !== args.ref ||
    upload.destinationOrigin !== target.origin ||
    !['http:', 'https:'].includes(destination.protocol) ||
    destination.origin !== upload.destinationOrigin ||
    typeof upload.name !== 'string' ||
    !upload.name.trim() ||
    upload.name.length > 200 ||
    /[\\/:*?"<>|]/.test(upload.name) ||
    Array.from(upload.name).some((char) => char.charCodeAt(0) < 32) ||
    !Number.isSafeInteger(upload.size) ||
    Number(upload.size) < 0 ||
    Number(upload.size) > 25 * 1024 * 1024 ||
    typeof upload.mime !== 'string' ||
    !upload.mime ||
    upload.mime.length > 128 ||
    Object.keys(upload).length !== keys.length ||
    Object.keys(upload).some((key) => !keys.includes(key))
  )
    throw new Error('Invalid upload approval binding')
}
