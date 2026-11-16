import { canonicalDigest } from '../../security/promptInjectionBoundary'

import { checkReceiptObserved } from './browserObserved'
import type { ReceiptClass } from './browserOutcome'
export { receiptOutcome, unknownOutcome } from './browserOutcome'
import { browserArgsDigest } from './browserProtocol'
import { copyJson, readDataMember } from './descriptorReader'
import { checkDownloadApproval, checkFileSaveReceipt } from './downloadContract'
import { checkHistoryApproval } from './historyApproval'
import { selectPreparedAction } from './macroApproval'
import type { JsonObject, JsonValue } from './protocol'
import { checkUploadApproval } from './uploadApproval'

/**
 * Pure checks of the v2 browser core profile. contracts/agentinterop/v2
 * fixtures run against these functions, so the frozen wire values and the
 * host's runtime behavior cannot drift apart.
 */
const BROWSER_LIMITS = { maxDepth: 12, maxNodes: 5000, maxBytes: 65536 }
export const PREPARED_TARGET_KEYS = [
  'tabId',
  'kind',
  'incarnation',
  'origin',
  'navigationEpoch',
  'documentId',
  'contentEpoch',
] as const
export const RECEIPT_TARGET_KEYS = [
  'tabId',
  'kind',
  'incarnation',
  'origin',
  'navigationEpoch',
] as const

/**
 * Text for a resolveTarget/prepare rejection, carrying the provider's typed
 * `code` when it is a plain data property. Informational only: it never changes
 * the outcome or retry policy, and execute rejections stay unknown.
 */
export function browserRejectionText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback
  let code: unknown
  try {
    code = error instanceof Object ? readDataMember(error, 'code') : undefined
  } catch {
    // An accessor is not a typed code.
  }
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)
    ? `${message} (${code})`
    : message
}

export function browserObject(raw: unknown): JsonObject {
  const value = copyJson(raw, BROWSER_LIMITS)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid browser response')
  return value
}

/** resolveTarget result. Identity fields are required; the rest stays opaque. */
export function readBrowserTarget(raw: unknown): JsonObject {
  const target = browserObject(raw)
  if (
    typeof target.tabId !== 'string' ||
    typeof target.incarnation !== 'string' ||
    typeof target.navigationEpoch !== 'number'
  )
    throw new Error('Invalid browser target')
  return target
}

/** Returns the prepared target after binding it to the request the host made. */
export async function checkPrepared(
  prepared: JsonObject,
  expected: {
    args: JsonValue
    requestId: string
    toolName: string
    browserAction?: string
    providerIdentity: unknown
    target: JsonObject
    now: number
  },
): Promise<JsonObject> {
  expected = await selectPreparedAction(prepared, expected)
  if (
    prepared.argsDigest !== (await browserArgsDigest(expected.args)) ||
    prepared.requestId !== expected.requestId ||
    prepared.toolName !== expected.toolName ||
    prepared.browserAction !== expected.browserAction ||
    typeof prepared.prepareId !== 'string' ||
    !prepared.prepareId ||
    typeof prepared.targetDigest !== 'string' ||
    !prepared.targetDigest ||
    typeof prepared.policyEpoch !== 'number' ||
    !Number.isSafeInteger(prepared.policyEpoch) ||
    (await canonicalDigest(prepared.providerIdentity)) !==
      (await canonicalDigest(expected.providerIdentity)) ||
    typeof prepared.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(prepared.expiresAt)) ||
    Date.parse(prepared.expiresAt) <= expected.now
  )
    throw new Error('Preparation identity or argument digest mismatch')
  const actual = browserObject(prepared.target)
  if (expected.toolName === 'tabs_create') {
    if (
      actual.tabId !== 'new_tab' ||
      actual.incarnation !== 'new' ||
      actual.kind !== 'webhands' ||
      actual.navigationEpoch !== 0
    )
      throw new Error('Invalid new tab intent')
  } else if (actual.tabId === 'new_tab' || actual.incarnation === 'new')
    throw new Error('Creation intent is not a live target')
  for (const key of PREPARED_TARGET_KEYS)
    if (
      expected.target[key] !== undefined &&
      actual[key] !== expected.target[key]
    )
      throw new Error('Preparation target mismatch')
  checkHistoryApproval(prepared, expected, browserObject)
  checkUploadApproval(prepared, expected, browserObject)
  checkDownloadApproval(prepared, expected)
  return actual
}

export type { ReceiptClass } from './browserOutcome'

/** Any throw means the application is unknown: the caller pauses and never retries. */
export function classifyReceipt(
  receipt: JsonObject,
  expected: {
    operationId: string
    requestId: string
    prepareId: JsonValue
    target: JsonObject
    toolName?: string
    selectedDownload?: JsonValue
  },
): ReceiptClass {
  if (
    receipt.operationId !== expected.operationId ||
    receipt.requestId !== expected.requestId ||
    receipt.prepareId !== expected.prepareId ||
    receipt.externalOutcome !== 'unknown'
  )
    throw new Error('Invalid receipt identity')
  checkReceiptObserved(receipt.observed)
  checkFileSaveReceipt(receipt, expected.toolName, expected.selectedDownload)
  const before = browserObject(receipt.targetBefore)
  for (const key of RECEIPT_TARGET_KEYS)
    if (before[key] !== expected.target[key])
      throw new Error('Receipt target mismatch')
  if (
    !Number.isSafeInteger(receipt.inputsSent) ||
    !Number.isSafeInteger(receipt.inputsPlanned) ||
    Number(receipt.inputsSent) < 0 ||
    Number(receipt.inputsSent) > Number(receipt.inputsPlanned)
  )
    throw new Error('Invalid input counts')
  if (
    receipt.dispatched === 'yes' &&
    receipt.application === 'applied' &&
    !receipt.error
  ) {
    if (
      expected.toolName === 'macro_step' &&
      (receipt.inputsSent !== receipt.inputsPlanned ||
        Number(receipt.inputsSent) <= 0)
    )
      throw new Error('Incomplete macro input receipt')
    if (expected.toolName === 'tabs_create') {
      const after = readBrowserTarget(receipt.targetAfter)
      if (
        !after.tabId ||
        !after.incarnation ||
        after.tabId === 'new_tab' ||
        after.incarnation === 'new' ||
        after.kind !== 'webhands' ||
        !Number.isSafeInteger(after.navigationEpoch) ||
        Number(after.navigationEpoch) < 0
      )
        throw new Error('Missing real created target')
    }
    return 'applied'
  }
  if (
    receipt.dispatched === 'no' &&
    receipt.application === 'not_applied' &&
    receipt.inputsSent === 0
  )
    return 'not_dispatched'
  if (receipt.dispatched === 'yes' && receipt.application === 'not_applied')
    return 'not_applied'
  throw new Error('Uncertain browser application')
}
