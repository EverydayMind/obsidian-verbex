import { validateBaseDefinition } from './baseValidation'
import { validateCanvasDocument } from './canvasValidation'

export type StructuredValidationResult = {
  errors: string[]
  warnings: string[]
}

export function isStructuredFilePath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith('.base') || lower.endsWith('.canvas')
}

export function validateStructuredFile(
  path: string,
  after: string,
  before?: string | null,
): StructuredValidationResult | null {
  const lower = path.toLowerCase()
  let validate: (text: string) => { errors: string[] }
  if (lower.endsWith('.base')) {
    validate = validateBaseDefinition
  } else if (lower.endsWith('.canvas')) {
    validate = validateCanvasDocument
  } else {
    return null
  }

  const afterErrors = validate(after).errors
  if (afterErrors.length === 0) return { errors: [], warnings: [] }

  const beforeErrors =
    typeof before === 'string' ? new Set(validate(before).errors) : null
  const errors: string[] = []
  const warnings: string[] = []
  for (const message of afterErrors) {
    if (beforeErrors?.has(message)) warnings.push(message)
    else errors.push(message)
  }
  return { errors, warnings }
}

export function structuredValidationError(
  path: string,
  after: string,
  before?: string | null,
): string | null {
  const result = validateStructuredFile(path, after, before)
  return result && result.errors.length > 0 ? result.errors.join('\n') : null
}

export function prepareStructuredFields<
  T extends {
    path: string
    before: string | null
    after: string | null
    approvalMode?: 'whole_change'
  },
>(fields: T): { ok: true; fields: T } | { ok: false; message: string } {
  if (typeof fields.after !== 'string' || !isStructuredFilePath(fields.path)) {
    return { ok: true, fields }
  }
  const error = structuredValidationError(
    fields.path,
    fields.after,
    fields.before,
  )
  if (error) return { ok: false, message: error }
  return {
    ok: true,
    fields: fields.approvalMode
      ? fields
      : { ...fields, approvalMode: 'whole_change' },
  }
}
