// Small parse/validate contract shared by the JSON repositories. The generic
// base class never knows what a Run/Chat/Template looks like; each repository
// supplies its own `validateRecord` built from these helpers.

export type JsonRecordErrorKind = 'invalid' | 'unsupported' | 'io'

// `fileName` is a repository-relative name. Parse error text and record
// content are deliberately never attached: they may contain user content.
export class JsonRecordError extends Error {
  readonly kind: JsonRecordErrorKind
  readonly fileName: string

  constructor(kind: JsonRecordErrorKind, fileName: string) {
    super(`JSON record ${kind}: ${fileName}`)
    this.name = 'JsonRecordError'
    this.kind = kind
    this.fileName = fileName
  }
}

export type RecordDiagnostic = {
  fileName: string
  kind: JsonRecordErrorKind
}

export const MAX_RECORD_DIAGNOSTICS = 50

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// Throws JsonRecordError('invalid') when the text is not a JSON object.
export function parseJsonObject(
  content: string,
  fileName: string,
): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new JsonRecordError('invalid', fileName)
  }
  if (!isPlainObject(parsed)) throw new JsonRecordError('invalid', fileName)
  return parsed
}

// Rejects records written by a newer schema instead of treating them as
// corrupt, so a downgrade never overwrites data it does not understand.
export function assertSupportedVersion(
  version: unknown,
  supported: number,
  fileName: string,
): void {
  if (isFiniteNumber(version) && version > supported) {
    throw new JsonRecordError('unsupported', fileName)
  }
}

export function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}
