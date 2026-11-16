import { stringifyUnknown } from '../../utils/stringifyUnknown'

import type { JsonObject, JsonValue } from './protocol'

/** J1 card structure only; permission and provider-local history binding stay in their sinks. */
export function checkHistoryApproval(
  prepared: JsonObject,
  expected: { toolName: string; args: JsonValue },
  object: (raw: unknown) => JsonObject,
): void {
  if (expected.toolName !== 'history_go') return
  const args = object(expected.args)
  const card = object(prepared.approvalCard)
  const target = object(prepared.target)
  const nav = object(card.navigation)
  let origin: URL
  try {
    origin = new URL(stringifyUnknown(nav.destinationOrigin))
  } catch {
    throw new Error('Invalid history destination origin')
  }
  if (
    !['back', 'forward', 'reload'].includes(stringifyUnknown(args.mode)) ||
    nav.mode !== args.mode ||
    !['http:', 'https:'].includes(origin.protocol) ||
    nav.destinationOrigin !== origin.origin ||
    (nav.destinationPath !== '/' && nav.destinationPath !== '/[redacted]') ||
    (args.mode === 'reload'
      ? nav.destinationIndex !== undefined || origin.origin !== target.origin
      : !Number.isSafeInteger(nav.destinationIndex) ||
        Number(nav.destinationIndex) < 0) ||
    Object.keys(nav).some(
      (key) =>
        ![
          'mode',
          'destinationOrigin',
          'destinationPath',
          'destinationIndex',
        ].includes(key),
    )
  )
    throw new Error('Invalid history approval binding')
}
