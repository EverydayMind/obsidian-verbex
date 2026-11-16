import type { VerbexSettings } from '../settings/schema/setting.types'

import type { TurnRecord } from './turnLedger'

export function storeRunBodiesEnabled(settings: VerbexSettings): boolean {
  return settings.verbex.debug.mode && settings.verbex.debug.storeRunBodies
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

function pick(value: unknown, keys: string[]): Record<string, unknown> {
  const source = object(value)
  return Object.fromEntries(
    keys.filter((key) => key in source).map((key) => [key, source[key]]),
  )
}

function projectResult(
  result: Record<string, unknown>,
): Record<string, unknown> {
  const projected = {
    ...pick(result, [
      'state',
      'job_id',
      'nextStep',
      'reason',
      'recovery',
      'outputRenamed',
    ]),
    bodyOmitted: true,
    storageFormat: 1,
  } as Record<string, unknown>
  if (result.draft_contract && typeof result.draft_contract === 'object') {
    const contract = object(result.draft_contract)
    projected.draft_contract_summary = {
      keys: Object.keys(contract),
      roleKeys: Object.keys(object(contract.roles)),
      referenceExcerptLength:
        typeof contract.reference_excerpt === 'string'
          ? contract.reference_excerpt.length
          : 0,
    }
  }
  if (typeof result.draft_rules === 'string')
    projected.draft_rules_length = result.draft_rules.length
  if (result.decomposition) {
    const decomposition = object(result.decomposition)
    // Paths are facts, not body text; they keep the record diagnosable.
    const facts = pick(decomposition, ['state', 'text_path', 'template_path'])
    if (decomposition.fitness)
      facts.fitness = pick(decomposition.fitness, [
        'grade',
        'borderline',
        'reasons',
        'recommendation',
        'editPath',
      ])
    for (const [key, countKey] of Object.entries({
      judgements: 'judgementCount',
      roundTrip: 'roundTripCount',
      spacingVariance: 'spacingVarianceCount',
      unifiedDifferences: 'unifiedDifferencesCount',
      omittedObjectSpacing: 'omittedObjectSpacingCount',
    })) {
      const value = decomposition[key]
      if (Array.isArray(value)) facts[countKey] = value.length
      else if (value && typeof value === 'object')
        facts[countKey] = Object.keys(value).length
    }
    projected.decomposition = facts
  }
  if (Array.isArray(result.questions))
    projected.questions = result.questions.map((question) => {
      const source = object(question)
      return {
        ...pick(source, ['question', 'id', 'label']),
        ...(Array.isArray(source.options)
          ? {
              options: source.options.map((option) =>
                pick(option, ['option', 'id', 'label', 'ref']),
              ),
            }
          : {}),
      }
    })
  if (result.details) {
    const details = object(result.details)
    projected.details = Object.fromEntries(
      Object.entries(details).filter(
        ([key, value]) =>
          typeof value === 'number' ||
          (typeof value === 'string' &&
            /(?:^|_)(?:path|paths)$|Path$/.test(key)),
      ),
    )
  }
  return projected
}

export function projectTurnRecord(
  record: TurnRecord,
  storeRunBodies: boolean,
): TurnRecord {
  if (storeRunBodies || !record.documentJobPreparation) return record
  return {
    ...record,
    documentJobPreparation: {
      ...record.documentJobPreparation,
      result: projectResult(record.documentJobPreparation.result),
    },
  }
}
