import type { SessionEditFact, SessionEditReceipt } from './sessionProtocol'

/** Display-only navigation after a validated, unapplied protected-content receipt. */
export function refusedEditFact(
  providerId: string,
  tool: string,
  incarnation: string,
  receipt: SessionEditReceipt,
  location: { handle?: string },
): SessionEditFact {
  return {
    refused: true,
    providerId,
    tool,
    path: receipt.path,
    sessionId: receipt.sessionId,
    incarnation,
    revisionBefore: receipt.revisionBefore,
    undoAvailable: false,
    changedPages: [],
    preview: location.handle
      ? [{ handle: location.handle, before: '', after: '' }]
      : [],
  }
}
