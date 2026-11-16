import type { App } from 'obsidian'

import { RETRIEVAL_EVALUATION_DIR } from '../../constants'
import { t } from '../../i18n'
import { ensureVaultDir } from '../../verbex/vault'

import {
  type RetrievalEvaluationCase,
  parseRetrievalEvaluationSet,
} from './retrievalEvaluation'

/** Visible because these are user-maintained gold labels, not internal state. */
export const RETRIEVAL_EVALUATION_PATH = `${RETRIEVAL_EVALUATION_DIR}/retrieval-golden.json`

export function upsertRetrievalEvaluationCase(
  cases: readonly RetrievalEvaluationCase[],
  nextCase: RetrievalEvaluationCase,
): RetrievalEvaluationCase[] {
  const existingIndex = cases.findIndex((item) => item.id === nextCase.id)
  if (existingIndex < 0) return [...cases, nextCase]

  return cases.map((item, index) => (index === existingIndex ? nextCase : item))
}

export function serializeRetrievalEvaluationSet(
  cases: readonly RetrievalEvaluationCase[],
): string {
  return `${JSON.stringify(cases, null, 2)}\n`
}

export async function loadRetrievalEvaluationSet(
  app: App,
): Promise<RetrievalEvaluationCase[]> {
  if (!(await app.vault.adapter.exists(RETRIEVAL_EVALUATION_PATH))) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(
      await app.vault.adapter.read(RETRIEVAL_EVALUATION_PATH),
    ) as unknown
  } catch (error) {
    throw new Error(
      t('runtimeR5.evaluationJson', {
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }

  try {
    return parseRetrievalEvaluationSet(parsed)
  } catch (error) {
    throw new Error(
      t('runtimeR5.evaluationFormat', {
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

export async function saveRetrievalEvaluationSet(
  app: App,
  cases: readonly RetrievalEvaluationCase[],
): Promise<void> {
  await ensureVaultDir(app, RETRIEVAL_EVALUATION_DIR)
  await app.vault.adapter.write(
    RETRIEVAL_EVALUATION_PATH,
    serializeRetrievalEvaluationSet(cases),
  )
}
