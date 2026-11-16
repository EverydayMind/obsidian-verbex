import type { RAGEngine } from './ragEngine'
import {
  RETRIEVAL_FUSION_STRATEGIES,
  type RetrievalFusionOptions,
  type RetrievalFusionStrategy,
  fuseRankedScores,
} from './retrievalFusion'
import type { RetrievalHit } from './retrievalTypes'

export type RetrievalEvaluationScope = {
  files: string[]
  folders: string[]
}

/** A stable, score-bearing candidate used by the evaluation harness. */
export type EvaluationCandidate = {
  id: string
  score: number
  tokenEstimate?: number
}

export type RetrievalEvaluationExecutionFact = {
  status: 'completed' | 'overflow' | 'aborted'
  evidenceUnitIds?: readonly string[]
}

export type RetrievalEvaluationScenario =
  | 'sample_vault'
  | 'scoped_query'
  | 'small_model'
  | 'large_document'

/** Golden labels are intentionally separate from retrieved candidates. */
export type RetrievalEvaluationCase = {
  id: string
  query: string
  relevantUnitIds: readonly string[]
  scope?: RetrievalEvaluationScope
  scenario?: RetrievalEvaluationScenario
  tokenBudget?: number
  contextK?: number
  execution?: Partial<
    Record<RetrievalFusionStrategy, RetrievalEvaluationExecutionFact>
  >
}

export type RetrievalFusionEvaluationCase = RetrievalEvaluationCase & {
  vectorCandidates: readonly EvaluationCandidate[]
  bm25Candidates: readonly EvaluationCandidate[]
}

export type RetrievalEvaluationOptions = {
  kValues?: readonly number[]
  bm25Weight?: number
  rrfK?: number
  contextK?: number
  /** Run the structural graph fusion route when the harness opts in. */
  expandGraph?: boolean
}

export type RetrievalStrategyEvaluation = {
  caseCount: number
  evaluatedCaseCount: number
  recallAtK: Record<string, number>
  ndcgAtK: Record<string, number>
  /** Alias with the contract's requirement-oriented terminology. */
  coverageRateAtK: Record<string, number>
  unnecessaryTokenRatioAtK: Record<string, number>
  overflowRate: number
  abortRate: number
  evidenceMissRate: number
  observedEvidenceCaseCount: number
}

export type RetrievalEvaluationReport = {
  caseCount: number
  kValues: number[]
  strategies: Record<RetrievalFusionStrategy, RetrievalStrategyEvaluation>
}

export type RetrievalEvaluationRetriever = (input: {
  evaluationCase: RetrievalEvaluationCase
  strategy: RetrievalFusionStrategy
}) => Promise<readonly EvaluationCandidate[]>

export type RetrievalEvaluationRagEngine = Pick<RAGEngine, 'processQueryHits'>

/**
 * Compare all fusion strategies over one recorded source-candidate set.
 * This is the offline path used when a query trace has already captured the
 * vector and BM25 candidate lists.
 */
export function compareFusionStrategies(
  cases: readonly RetrievalFusionEvaluationCase[],
  options: RetrievalEvaluationOptions = {},
): RetrievalEvaluationReport {
  const kValues = normalizeKValues(options.kValues)
  const limit = Math.max(...kValues, options.contextK ?? 0)
  const strategies = {} as Record<
    RetrievalFusionStrategy,
    RetrievalStrategyEvaluation
  >
  for (const strategy of RETRIEVAL_FUSION_STRATEGIES) {
    const results = cases.map((evaluationCase) => {
      const fused = fuseRankedScores(
        evaluationCase.vectorCandidates,
        evaluationCase.bm25Candidates,
        fusionOptions(strategy, options, limit),
      )
      const candidates = mergeCandidates(
        evaluationCase.vectorCandidates,
        evaluationCase.bm25Candidates,
      )
      const candidatesById = new Map(
        candidates.map((candidate) => [candidate.id, candidate]),
      )
      return fused.map((result) => ({
        ...result,
        tokenEstimate: candidatesById.get(result.id)?.tokenEstimate,
      }))
    })
    strategies[strategy] = evaluateResults(
      cases,
      results,
      strategy,
      kValues,
      options.contextK,
    )
  }
  return { caseCount: cases.length, kValues, strategies }
}

/**
 * Evaluate results returned by a live retriever. The retriever is called once
 * per case and strategy, so an experiment can opt into RRF without changing
 * the production default or making an LLM claim about retrieval quality.
 */
export async function evaluateRetrievalSet(
  cases: readonly RetrievalEvaluationCase[],
  retrieve: RetrievalEvaluationRetriever,
  options: RetrievalEvaluationOptions = {},
): Promise<RetrievalEvaluationReport> {
  const kValues = normalizeKValues(options.kValues)
  const strategies = {} as Record<
    RetrievalFusionStrategy,
    RetrievalStrategyEvaluation
  >
  for (const strategy of RETRIEVAL_FUSION_STRATEGIES) {
    const results: EvaluationCandidate[][] = []
    for (const evaluationCase of cases) {
      results.push([...(await retrieve({ evaluationCase, strategy }))])
    }
    strategies[strategy] = evaluateResults(
      cases,
      results,
      strategy,
      kValues,
      options.contextK,
    )
  }
  return {
    caseCount: cases.length,
    kValues,
    strategies,
  }
}

/**
 * Adapt the production location-aware RAG path to the live evaluation
 * harness. The fusion override is supplied only by the evaluation call; the
 * engine's configured production strategy remains unchanged.
 */
export function createRagEngineEvaluationRetriever(
  engine: RetrievalEvaluationRagEngine,
  options: RetrievalEvaluationOptions = {},
): RetrievalEvaluationRetriever {
  const kValues = normalizeKValues(options.kValues)
  const maximumK = Math.max(...kValues)
  return async ({ evaluationCase, strategy }) => {
    const limit = Math.max(
      maximumK,
      evaluationCase.contextK ?? options.contextK ?? 0,
    )
    const hits = await engine.processQueryHits({
      query: evaluationCase.query,
      ...(evaluationCase.scope ? { scope: evaluationCase.scope } : {}),
      fusionStrategy: strategy,
      ...(options.rrfK !== undefined ? { rrfK: options.rrfK } : {}),
      hitSelection: {
        limit,
        // Adjacent chunks are an execution-context expansion, not a direct
        // fusion candidate. Excluding them keeps retrieval metrics focused on
        // the configured vector/BM25/fusion result set.
        expandAdjacent: false,
        ...(options.expandGraph !== undefined
          ? { expandGraph: options.expandGraph }
          : {}),
      },
    })
    return hits.slice(0, limit).map((hit) => ({
      id: hit.locator.unitId,
      score: scoreForEvaluation(hit),
      ...(hit.tokenEstimate !== undefined
        ? { tokenEstimate: hit.tokenEstimate }
        : {}),
    }))
  }
}

/** Run the live evaluation directly against RAGEngine's location-aware API. */
export async function evaluateRagEngineRetrievalSet(
  engine: RetrievalEvaluationRagEngine,
  cases: readonly RetrievalEvaluationCase[],
  options: RetrievalEvaluationOptions = {},
): Promise<RetrievalEvaluationReport> {
  return evaluateRetrievalSet(
    cases,
    createRagEngineEvaluationRetriever(engine, options),
    options,
  )
}

function scoreForEvaluation(hit: RetrievalHit): number {
  const scores = [
    hit.scores.final,
    hit.scores.rerank,
    hit.scores.vector,
    hit.scores.bm25,
    hit.scores.graph,
  ]
  return scores.find((score): score is number => Number.isFinite(score)) ?? 0
}

/** Parse a JSON-backed golden set and fail loudly on malformed labels. */
export function parseRetrievalEvaluationSet(
  value: unknown,
): RetrievalEvaluationCase[] {
  if (!Array.isArray(value)) {
    throw new Error('retrieval evaluation set must be an array')
  }
  const seenIds = new Set<string>()
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`evaluation case ${index} must be an object`)
    }
    const id = requiredString(entry.id, `evaluation case ${index}.id`)
    if (seenIds.has(id)) {
      throw new Error(`duplicate evaluation case id: ${id}`)
    }
    seenIds.add(id)
    const query = requiredString(entry.query, `evaluation case ${index}.query`)
    const relevantUnitIds = requiredStringArray(
      entry.relevantUnitIds,
      `evaluation case ${index}.relevantUnitIds`,
    )
    const scope = parseScope(entry.scope, index)
    const scenario = parseScenario(entry.scenario, index)
    const tokenBudget = optionalNonNegativeNumber(
      entry.tokenBudget,
      `evaluation case ${index}.tokenBudget`,
    )
    const contextK = optionalPositiveInteger(
      entry.contextK,
      `evaluation case ${index}.contextK`,
    )
    return {
      id,
      query,
      relevantUnitIds,
      ...(scope ? { scope } : {}),
      ...(scenario ? { scenario } : {}),
      ...(tokenBudget !== undefined ? { tokenBudget } : {}),
      ...(contextK !== undefined ? { contextK } : {}),
      ...(entry.execution !== undefined
        ? { execution: parseExecution(entry.execution, index) }
        : {}),
    }
  })
}

/** Parse a golden set that also carries recorded vector/BM25 candidate traces. */
export function parseRetrievalFusionEvaluationSet(
  value: unknown,
): RetrievalFusionEvaluationCase[] {
  if (!Array.isArray(value)) {
    throw new Error('retrieval evaluation set must be an array')
  }
  const cases = parseRetrievalEvaluationSet(value)
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`evaluation case ${index} must be an object`)
    }
    return {
      ...cases[index],
      vectorCandidates: parseCandidates(
        entry.vectorCandidates,
        `evaluation case ${index}.vectorCandidates`,
      ),
      bm25Candidates: parseCandidates(
        entry.bm25Candidates,
        `evaluation case ${index}.bm25Candidates`,
      ),
    }
  })
}

function evaluateResults(
  cases: readonly RetrievalEvaluationCase[],
  results: readonly (readonly EvaluationCandidate[])[],
  strategy: RetrievalFusionStrategy,
  kValues: readonly number[],
  defaultContextK: number | undefined,
): RetrievalStrategyEvaluation {
  const recallNumerators = new Map<number, number>()
  const recallDenominators = new Map<number, number>()
  const ndcgNumerators = new Map<number, number>()
  const ndcgDenominators = new Map<number, number>()
  const tokenWaste = new Map<number, number>()
  const tokenTotal = new Map<number, number>()
  let evaluatedCaseCount = 0
  let overflowCases = 0
  let overflowObservations = 0
  let abortCases = 0
  let abortObservations = 0
  let evidenceMissUnits = 0
  let evidenceUnits = 0
  let observedEvidenceCaseCount = 0

  cases.forEach((evaluationCase, index) => {
    const gold = new Set(
      evaluationCase.relevantUnitIds.filter((unitId) => unitId.trim()),
    )
    const ranked = deduplicateResults(results[index] ?? [])
    if (gold.size > 0) evaluatedCaseCount += 1
    for (const k of kValues) {
      const top = ranked.slice(0, k)
      const found = countRelevant(top, gold)
      if (gold.size > 0) {
        recallNumerators.set(k, (recallNumerators.get(k) ?? 0) + found)
        recallDenominators.set(k, (recallDenominators.get(k) ?? 0) + gold.size)
        ndcgNumerators.set(k, (ndcgNumerators.get(k) ?? 0) + ndcg(top, gold, k))
        ndcgDenominators.set(k, (ndcgDenominators.get(k) ?? 0) + 1)
      }
      const tokens = tokenStats(top, gold)
      tokenWaste.set(k, (tokenWaste.get(k) ?? 0) + tokens.unnecessary)
      tokenTotal.set(k, (tokenTotal.get(k) ?? 0) + tokens.total)
    }

    const contextK =
      evaluationCase.contextK ?? defaultContextK ?? Math.max(...kValues)
    const contextStats = tokenStats(ranked.slice(0, contextK), gold)
    const execution = evaluationCase.execution?.[strategy]
    if (
      evaluationCase.tokenBudget !== undefined ||
      execution?.status === 'overflow'
    ) {
      overflowObservations += 1
      if (
        execution?.status === 'overflow' ||
        (evaluationCase.tokenBudget !== undefined &&
          contextStats.total > evaluationCase.tokenBudget)
      ) {
        overflowCases += 1
      }
    }
    if (execution) {
      abortObservations += 1
      if (execution.status === 'aborted') abortCases += 1
      if (execution.evidenceUnitIds !== undefined && gold.size > 0) {
        observedEvidenceCaseCount += 1
        const evidence = new Set(execution.evidenceUnitIds)
        evidenceMissUnits += [...gold].filter(
          (unitId) => !evidence.has(unitId),
        ).length
        evidenceUnits += gold.size
      }
    }
  })

  const recallAtK = asRateRecord(kValues, (k) =>
    ratio(recallNumerators.get(k) ?? 0, recallDenominators.get(k) ?? 0),
  )
  const ndcgAtK = asRateRecord(kValues, (k) =>
    ratio(ndcgNumerators.get(k) ?? 0, ndcgDenominators.get(k) ?? 0),
  )
  const unnecessaryTokenRatioAtK = asRateRecord(kValues, (k) =>
    ratio(tokenWaste.get(k) ?? 0, tokenTotal.get(k) ?? 0),
  )
  return {
    caseCount: cases.length,
    evaluatedCaseCount,
    recallAtK,
    ndcgAtK,
    coverageRateAtK: { ...recallAtK },
    unnecessaryTokenRatioAtK,
    overflowRate: ratio(overflowCases, overflowObservations),
    abortRate: ratio(abortCases, abortObservations),
    evidenceMissRate: ratio(evidenceMissUnits, evidenceUnits),
    observedEvidenceCaseCount,
  }
}

function fusionOptions(
  strategy: RetrievalFusionStrategy,
  options: RetrievalEvaluationOptions,
  limit: number,
): RetrievalFusionOptions {
  return {
    strategy,
    bm25Weight: options.bm25Weight,
    rrfK: options.rrfK,
    limit,
  }
}

function mergeCandidates(
  vector: readonly EvaluationCandidate[],
  bm25: readonly EvaluationCandidate[],
): EvaluationCandidate[] {
  const byId = new Map<string, EvaluationCandidate>()
  for (const candidate of [...vector, ...bm25]) {
    const previous = byId.get(candidate.id)
    if (
      !previous ||
      (previous.tokenEstimate === undefined &&
        candidate.tokenEstimate !== undefined)
    ) {
      byId.set(candidate.id, candidate)
    }
  }
  return [...byId.values()]
}

function deduplicateResults(
  results: readonly EvaluationCandidate[],
): EvaluationCandidate[] {
  const seen = new Set<string>()
  return results.filter((result) => {
    if (seen.has(result.id)) return false
    seen.add(result.id)
    return true
  })
}

function countRelevant(
  results: readonly EvaluationCandidate[],
  gold: ReadonlySet<string>,
): number {
  const seen = new Set<string>()
  let count = 0
  for (const result of results) {
    if (!seen.has(result.id) && gold.has(result.id)) count += 1
    seen.add(result.id)
  }
  return count
}

function ndcg(
  results: readonly EvaluationCandidate[],
  gold: ReadonlySet<string>,
  k: number,
): number {
  const actual = results
    .slice(0, k)
    .reduce(
      (sum, result, index) =>
        sum + (gold.has(result.id) ? 1 / Math.log2(index + 2) : 0),
      0,
    )
  const idealRelevant = Math.min(gold.size, k)
  const ideal = Array.from(
    { length: idealRelevant },
    (_, index) => 1 / Math.log2(index + 2),
  ).reduce((sum, value) => sum + value, 0)
  return ratio(actual, ideal)
}

function tokenStats(
  results: readonly EvaluationCandidate[],
  gold: ReadonlySet<string>,
): { total: number; unnecessary: number } {
  return results.reduce(
    (stats, result) => {
      const tokens = finiteNonNegative(result.tokenEstimate)
      return {
        total: stats.total + tokens,
        unnecessary: stats.unnecessary + (gold.has(result.id) ? 0 : tokens),
      }
    },
    { total: 0, unnecessary: 0 },
  )
}

function normalizeKValues(values: readonly number[] = [1, 3, 5, 10]): number[] {
  const normalized = [...new Set(values)]
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right)
  if (normalized.length === 0) {
    throw new Error('retrieval evaluation requires at least one positive k')
  }
  return normalized
}

function asRateRecord(
  values: readonly number[],
  getRate: (value: number) => number,
): Record<string, number> {
  return Object.fromEntries(
    values.map((value) => [String(value), getRate(value)]),
  )
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

function finiteNonNegative(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0
}

function parseScope(
  value: unknown,
  index: number,
): RetrievalEvaluationScope | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error(`evaluation case ${index}.scope must be an object`)
  }
  const files = requiredStringArray(
    value.files,
    `evaluation case ${index}.scope.files`,
  )
  const folders = requiredStringArray(
    value.folders,
    `evaluation case ${index}.scope.folders`,
  )
  return { files, folders }
}

function parseScenario(
  value: unknown,
  index: number,
): RetrievalEvaluationScenario | undefined {
  if (value === undefined) return undefined
  const scenarios: RetrievalEvaluationScenario[] = [
    'sample_vault',
    'scoped_query',
    'small_model',
    'large_document',
  ]
  if (
    typeof value !== 'string' ||
    !scenarios.includes(value as RetrievalEvaluationScenario)
  ) {
    throw new Error(
      `evaluation case ${index}.scenario must be one of: ${scenarios.join(', ')}`,
    )
  }
  return value as RetrievalEvaluationScenario
}

function parseExecution(
  value: unknown,
  index: number,
): Partial<Record<RetrievalFusionStrategy, RetrievalEvaluationExecutionFact>> {
  if (!isRecord(value)) {
    throw new Error(`evaluation case ${index}.execution must be an object`)
  }
  const result: Partial<
    Record<RetrievalFusionStrategy, RetrievalEvaluationExecutionFact>
  > = {}
  for (const [strategy, rawFact] of Object.entries(value)) {
    if (
      !RETRIEVAL_FUSION_STRATEGIES.includes(strategy as RetrievalFusionStrategy)
    ) {
      throw new Error(
        `evaluation case ${index}.execution has unknown strategy: ${strategy}`,
      )
    }
    if (!isRecord(rawFact)) {
      throw new Error(
        `evaluation case ${index}.execution.${strategy} must be an object`,
      )
    }
    const status = rawFact.status
    if (
      status !== 'completed' &&
      status !== 'overflow' &&
      status !== 'aborted'
    ) {
      throw new Error(
        `evaluation case ${index}.execution.${strategy}.status is invalid`,
      )
    }
    const evidenceUnitIds =
      rawFact.evidenceUnitIds === undefined
        ? undefined
        : requiredStringArray(
            rawFact.evidenceUnitIds,
            `evaluation case ${index}.execution.${strategy}.evidenceUnitIds`,
          )
    result[strategy as RetrievalFusionStrategy] = {
      status,
      ...(evidenceUnitIds ? { evidenceUnitIds } : {}),
    }
  }
  return result
}

function parseCandidates(value: unknown, field: string): EvaluationCandidate[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`)
  }
  return value.map((rawCandidate, index) => {
    if (!isRecord(rawCandidate)) {
      throw new Error(`${field}[${index}] must be an object`)
    }
    const id = requiredString(rawCandidate.id, `${field}[${index}].id`)
    const score = rawCandidate.score
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      throw new Error(`${field}[${index}].score must be a finite number`)
    }
    const tokenEstimate = optionalNonNegativeNumber(
      rawCandidate.tokenEstimate,
      `${field}[${index}].tokenEstimate`,
    )
    return {
      id,
      score,
      ...(tokenEstimate !== undefined ? { tokenEstimate } : {}),
    }
  })
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value.trim()
}

function requiredStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`)
  }
  const values = value.map((item, index) =>
    requiredString(item, `${field}[${index}]`),
  )
  return [...new Set(values)]
}

function optionalNonNegativeNumber(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number`)
  }
  return value
}

function optionalPositiveInteger(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
