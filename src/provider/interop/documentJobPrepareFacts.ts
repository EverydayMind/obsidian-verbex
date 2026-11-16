import type { ErrorObject } from 'ajv'

import type { FormatJob } from '../../core/document-jobs/jobTypes'
import { pendingDocumentQuestions } from '../../core/document-jobs/validJobs'
import { validators as compiled } from '../../validation/validators'

import { numericPrepareProblem } from './documentJobNumericProblem'
import { outputBaseName } from './documentJobOutput'
import type { PrepareRequest } from './documentJobPrepare'
import { answerToPendingQuestion } from './documentJobPrepareAnswer'
import type { PrepareProblem } from './documentJobPrepareProblem'

export type { PrepareProblem } from './documentJobPrepareProblem'

export class InvalidDocumentJobPrepareRequest extends Error {}
const validators = [compiled.prepareForm0, compiled.prepareForm1]
const fields = [
  'sample_path',
  'output_name',
  'base_font_pt',
  'job_id',
  'choices',
]
const acceptedForms = [
  {
    use: 'new_job',
    required: ['sample_path'],
    optional: ['output_name', 'base_font_pt'],
  },
  { use: 'answer_pending_question', required: ['job_id', 'choices'] },
]

function schemaProblem(
  error: ErrorObject,
  request: Record<string, unknown>,
): PrepareProblem {
  const numeric = numericPrepareProblem(error.keyword)
  if (numeric) return { field: 'base_font_pt', problem: numeric }
  if (error.keyword === 'additionalProperties')
    return { field: '(root)', problem: 'unknown_field' }
  const path = error.dataPath.split('/').filter(Boolean)
  const missing =
    error.keyword === 'required'
      ? String((error.params as { missingProperty: string }).missingProperty)
      : undefined
  const leaf = missing ?? path.at(-1)
  const field = fields.includes(leaf ?? '')
    ? (leaf ?? '(root)')
    : path[0] === 'choices' && (leaf === 'question' || leaf === 'option')
      ? `choices.${leaf}`
      : path[0] === 'choices'
        ? 'choices'
        : '(root)'
  const codes: Record<string, PrepareProblem['problem']> = {
    required: 'missing_field',
    type: 'wrong_type',
    minLength: 'empty',
    minItems: 'empty',
    maxItems: 'too_many',
    maxLength: 'too_long',
    const: 'invalid_value',
  }
  return {
    field: field as PrepareProblem['field'],
    problem:
      error.keyword === 'pattern' &&
      field === 'output_name' &&
      typeof request.output_name === 'string' &&
      /[/\\]/.test(request.output_name)
        ? 'path_not_allowed'
        : (codes[error.keyword] ?? 'invalid_value'),
  }
}

/** Stop at the first failing stage; field names and problem identifiers are host-owned. */
export function prepareRequestProblems(value: unknown): PrepareProblem[] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return [{ field: '(root)', problem: 'wrong_type' }]
  const request = value as Record<string, unknown>
  const has = (key: string) =>
    Object.prototype.hasOwnProperty.call(request, key) === true
  const fresh = has('sample_path') || has('output_name') || has('base_font_pt')
  const answer = has('job_id') || has('choices')
  const problems: PrepareProblem[] = []
  if (Object.keys(request).some((key) => !fields.includes(key)))
    problems.push({ field: '(root)', problem: 'unknown_field' })
  if (fresh && answer)
    problems.push({ field: '(root)', problem: 'mixed_forms' })
  if (!fresh && !answer)
    problems.push({ field: '(root)', problem: 'missing_form' })
  if (problems.length) return problems
  const validate = validators[fresh ? 0 : 1]
  return validate(value)
    ? []
    : (validate.errors ?? []).map((error) => schemaProblem(error, request))
}

export function invalidPrepare(
  problems: PrepareProblem[],
  jobs: readonly FormatJob[] = [],
): never {
  const unique = new Map(
    problems.map((item) => [`${item.field}:${item.problem}`, item]),
  )
  const sorted = [...unique.values()].sort((a, b) =>
    a.field < b.field
      ? -1
      : a.field > b.field
        ? 1
        : a.problem < b.problem
          ? -1
          : a.problem > b.problem
            ? 1
            : 0,
  )
  const pending = pendingDocumentQuestions(jobs)
  throw new InvalidDocumentJobPrepareRequest(
    JSON.stringify({
      state: 'invalid_request',
      problems: sorted,
      accepted_forms: acceptedForms,
      ...(pending.length ? { pending_questions: pending } : {}),
    }),
  )
}

const validateRequest = compiled.prepare

export async function requirePrepareRequest(
  value: unknown,
  jobs: (jobId?: string) => Promise<FormatJob[]>,
): Promise<PrepareRequest> {
  value = await answerToPendingQuestion(value, jobs)
  const problems = prepareRequestProblems(value)
  const jobId =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).job_id
      : undefined
  if (problems.length || !validateRequest(value))
    invalidPrepare(
      problems,
      await jobs(typeof jobId === 'string' ? jobId : undefined),
    )
  const request = value as PrepareRequest
  if ('sample_path' in request) {
    try {
      outputBaseName(request.sample_path, request.output_name)
    } catch {
      invalidPrepare(
        [{ field: 'output_name', problem: 'name_reserved' }],
        await jobs(),
      )
    }
  }
  return request
}
