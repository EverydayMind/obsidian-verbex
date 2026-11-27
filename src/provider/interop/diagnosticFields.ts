export type DiagnosticFields = {
  providerId?: string
  tool?: string
  conversationId?: string
  runId?: string
  turnId?: string
  path?: string
  sessionId?: string
  incarnation?: string
  generation?: number
  revisionBefore?: number
  revisionAfter?: number
  durationMs?: number
  timeoutMs?: number
  vaultEvents?: number
  count?: number
  visible?: boolean
  busy?: boolean
  aborted?: boolean
  located?: boolean
  late?: boolean
  retryable?: boolean
  truncated?: boolean
  errorCode?: string
  proposalId?: string
  mutation?: string
  mutationScope?: string
  applied?: string
  failureCategory?: string
}
export type DiagnosticOperation =
  | 'tool'
  | 'reveal'
  | 'undo'
  | 'discovery'
  | 'discovery.submission'
  | 'grant'
  | 'ownership'
  | 'ownership.query'
  | 'runtime'
  | 'card'
  | 'binary.commit'
  | 'binary.restore'
export type DiagnosticStage =
  | 'start'
  | 'succeeded'
  | 'failed'
  | 'paused'
  | 'rejected'
  | 'cancelled'
  | 'resolve.start'
  | 'resolve.end'
  | 'approval.start'
  | 'approval.allow'
  | 'approval.reject'
  | 'permit'
  | 'provider.start'
  | 'provider.settled'
  | 'provider.failed'
  | 'ownership.unverifiable_new_output'
  | 'timeout'
  | 'abort'
  | 'busy'
  | 'receipt'
  | 'target.mismatch'
  | 'receipt.invalid'
  | 'visibility.start'
  | 'visibility.end'
  | 'visibility.failed'
  | 'identity.invalid'
  | 'grant.invalid'
  | 'snapshot.invalid'
  | 'arguments.invalid'
  | 'checkpoint.start'
  | 'checkpoint.end'
  | 'commit.unexpected'
  | 'source.conflict'
  | 'apply.start'
  | 'apply.end'
  | 'grant.add'
  | 'grant.revoke'
  | 'grant.invalidate'
  | 'unload'
  | 'frame'
  | 'lag'
export type DiagnosticSpan = {
  mark: (stage: DiagnosticStage, fields?: DiagnosticFields) => void
  finish: (stage: DiagnosticStage, fields?: DiagnosticFields) => void
}
export const aliases = new Set([
  'conversationId',
  'runId',
  'turnId',
  'path',
  'sessionId',
  'incarnation',
  'proposalId',
])
export const numbers = new Set([
  'generation',
  'revisionBefore',
  'revisionAfter',
  'durationMs',
  'timeoutMs',
  'vaultEvents',
  'count',
])
export const booleans = new Set([
  'visible',
  'busy',
  'aborted',
  'located',
  'late',
  'retryable',
  'truncated',
])
export const errorCodes = new Set([
  'READ_PROGRESS_INVALID',
  'STALE_HANDLE',
  'HANDLE_EXPIRED',
  'OUTSIDE_SELECTION',
  'SELECTION_STALE',
  'HOLD_LIMIT',
  'USER_EDITING',
  'CONFLICT',
  'DOCUMENT_BUSY',
  'OBSERVATION_REQUIRED',
  'OBSERVATION_STALE',
  'OWNER_CONFLICT',
  'FORMAT_PRESERVATION_REQUIRED',
])
export const states: Record<string, readonly string[]> = {
  mutation: ['none', 'applied', 'partial'],
  mutationScope: ['none', 'vault', 'provider_session'],
  applied: ['yes', 'no', 'unknown'],
  failureCategory: [
    'approval_unavailable',
    'pending',
    'reapproval',
    'disabled',
    'artifact_unverified',
    'status_error',
    'instance_changed',
    'provider_busy',
    'timeout',
    'invocation_failed',
    'invalid_response',
    'invalid_path',
    'unknown',
  ],
}
export type DiagnosticEvent = {
  seq: number
  at: string
  elapsedMs: number
  span: number
  operation: DiagnosticOperation
  stage: DiagnosticStage
  fields: Record<string, string | number | boolean>
}
