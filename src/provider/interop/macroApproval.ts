import { stringifyUnknown } from '../../utils/stringifyUnknown'

import { browserArgsDigest } from './browserProtocol'
import type { JsonObject, JsonValue } from './protocol'

export async function selectPreparedAction<
  T extends { args: JsonValue; toolName: string; target: JsonObject },
>(prepared: JsonObject, expected: T): Promise<T> {
  if (expected.toolName === 'macro_step')
    return {
      ...expected,
      ...(await macroPreparation(prepared, expected.args, expected.target)),
    }
  const card = prepared.approvalCard
  if (
    card &&
    typeof card === 'object' &&
    !Array.isArray(card) &&
    card.macro !== undefined
  )
    throw new Error('Unexpected macro preparation')
  return expected
}

/** macro_step prepares one ordinary action. Only these exact action shapes may be approved. */
export async function macroPreparation(
  prepared: JsonObject,
  request: JsonValue,
  target: JsonObject,
): Promise<{ args: JsonObject; toolName: string; browserAction: string }> {
  const obj = (v: JsonValue | undefined): JsonObject => {
    if (!v || typeof v !== 'object' || Array.isArray(v))
      throw new Error('Invalid macro metadata')
    return v
  }
  const args = obj(request),
    card = obj(prepared.approvalCard),
    macro = obj(card.macro)
  const action = obj(prepared.normalizedArgs)
  if (
    Object.keys(args).sort().join() !==
      'observationId,runRef,stepIndex,tabId' ||
    Object.keys(macro).sort().join() !==
      'digest,observationId,runRef,stepCount,stepIndex' ||
    typeof args.runRef !== 'string' ||
    !args.runRef.startsWith('macro_') ||
    macro.runRef !== args.runRef ||
    macro.stepIndex !== args.stepIndex ||
    !Number.isSafeInteger(macro.stepIndex) ||
    Number(macro.stepIndex) < 0 ||
    !Number.isSafeInteger(macro.stepCount) ||
    Number(macro.stepCount) > 50 ||
    Number(macro.stepCount) <= Number(macro.stepIndex) ||
    typeof macro.digest !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(macro.digest) ||
    typeof args.observationId !== 'string' ||
    !args.observationId ||
    macro.observationId !== args.observationId ||
    args.tabId !== target.tabId ||
    action.tabId !== target.tabId ||
    typeof action.ref !== 'string' ||
    !action.ref ||
    action.ref.length > 64
  )
    throw new Error('Macro step binding mismatch')
  const toolName = stringifyUnknown(prepared.toolName)
  const allowed =
    toolName === 'click'
      ? ['tabId', 'ref']
      : toolName === 'type'
        ? ['tabId', 'ref', 'text', 'clear', 'submit']
        : toolName === 'key'
          ? ['tabId', 'ref', 'key']
          : []
  if (
    !allowed.length ||
    Object.keys(action).some((k) => !allowed.includes(k)) ||
    (toolName === 'type' &&
      (typeof action.text !== 'string' ||
        Array.from(action.text).length > 500 ||
        (action.clear !== undefined && typeof action.clear !== 'boolean') ||
        (action.submit !== undefined && typeof action.submit !== 'boolean'))) ||
    (toolName === 'key' &&
      !['Enter', 'Escape', 'Tab'].includes(stringifyUnknown(action.key))) ||
    prepared.argsDigest !== (await browserArgsDigest(action))
  )
    throw new Error('Invalid macro action')
  return { args: action, toolName, browserAction: 'interact' }
}
