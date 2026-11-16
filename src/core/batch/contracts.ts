export type BatchInputContract =
  | { kind: 'artifact'; key: string }
  | { kind: 'sources' }

export type BatchSinkContract =
  | 'findings'
  | 'chat'
  | { kind: 'file'; path: string }

export type BatchPackingContract = {
  boundary: 'chapter' | 'parent_heading' | 'source_file' | 'none'
  fill_ratio: number
  max_atoms_per_slice: number
}

export type BatchOutputContract = {
  kind: 'finding' | 'notes' | 'summary' | 'rewrite'
  schema?: string
}

export type BatchSegmenter = { profile: string }

export type BatchRetryContract = {
  max_attempts: number
}

/**
 * Declarative contract shared by workflow steps and standalone skills.
 * Parsing and runtime dispatch are intentionally added later in M6; M1 fixes
 * the shape first so the routing, engine, and loaders can converge on one API.
 */
export type BatchContract = {
  input: BatchInputContract
  state_authority: 'checklist' | 'jobstore'
  sink: BatchSinkContract
  segmenter: BatchSegmenter
  packing: BatchPackingContract
  context?: 'refs_terms' | 'neighbors' | 'none'
  slice_prompt: string
  output: BatchOutputContract
  retry: BatchRetryContract
  reduce: 'cross_check_2pass' | 'hierarchical' | 'concat_validate' | 'stitch'
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(', ')}`)
  }
  return value as T
}

export function parseBatchContract(
  value: unknown,
  label = 'batch',
): BatchContract | undefined {
  if (value === undefined || value === null) return undefined
  const raw = object(value, label)
  const rawInput = object(raw.input, `${label}.input`)
  const inputKind = enumValue(
    rawInput.kind,
    ['artifact', 'sources'] as const,
    `${label}.input.kind`,
  )
  const input: BatchInputContract =
    inputKind === 'artifact'
      ? {
          kind: 'artifact',
          key:
            typeof rawInput.key === 'string' && rawInput.key.trim()
              ? rawInput.key.trim()
              : (() => {
                  throw new Error(`${label}.input.key is required`)
                })(),
        }
      : { kind: 'sources' }
  const rawPacking = object(raw.packing, `${label}.packing`)
  const rawOutput = object(raw.output, `${label}.output`)
  const rawRetry = object(raw.retry, `${label}.retry`)
  let sink: BatchSinkContract
  if (raw.sink === 'chat' || raw.sink === 'findings') sink = raw.sink
  else if (raw.sink === 'treaty_findings') sink = 'findings'
  else {
    const fileSink = object(raw.sink, `${label}.sink`)
    if (
      fileSink.kind !== 'file' ||
      typeof fileSink.path !== 'string' ||
      !fileSink.path.trim()
    ) {
      throw new Error(`${label}.sink must be chat, findings, or file(path)`)
    }
    sink = { kind: 'file', path: fileSink.path.trim() }
  }
  const fillRatio = Number(rawPacking.fill_ratio)
  const maxAtoms = Number(rawPacking.max_atoms_per_slice)
  const attempts = Number(rawRetry.max_attempts)
  if (!(fillRatio > 0 && fillRatio <= 1)) {
    throw new Error(`${label}.packing.fill_ratio must be > 0 and <= 1`)
  }
  if (!Number.isInteger(maxAtoms) || maxAtoms < 1) {
    throw new Error(
      `${label}.packing.max_atoms_per_slice must be a positive integer`,
    )
  }
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error(`${label}.retry.max_attempts must be a positive integer`)
  }
  if (typeof raw.slice_prompt !== 'string' || !raw.slice_prompt.trim()) {
    throw new Error(`${label}.slice_prompt is required`)
  }
  return {
    input,
    state_authority: enumValue(
      raw.state_authority,
      ['checklist', 'jobstore'] as const,
      `${label}.state_authority`,
    ),
    sink,
    segmenter: (() => {
      const value =
        typeof raw.segmenter === 'string'
          ? raw.segmenter
          : object(raw.segmenter, `${label}.segmenter`).profile
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${label}.segmenter.profile is required`)
      }
      return { profile: value === 'treaty' ? 'legal-numbered' : value.trim() }
    })(),
    packing: {
      boundary: enumValue(
        rawPacking.boundary,
        ['chapter', 'parent_heading', 'source_file', 'none'] as const,
        `${label}.packing.boundary`,
      ),
      fill_ratio: fillRatio,
      max_atoms_per_slice: maxAtoms,
    },
    ...(raw.context
      ? {
          context: enumValue(
            raw.context,
            ['refs_terms', 'neighbors', 'none'] as const,
            `${label}.context`,
          ),
        }
      : {}),
    slice_prompt: raw.slice_prompt.trim(),
    output: {
      kind: enumValue(
        rawOutput.kind,
        ['finding', 'notes', 'summary', 'rewrite'] as const,
        `${label}.output.kind`,
      ),
      ...(typeof rawOutput.schema === 'string'
        ? { schema: rawOutput.schema }
        : {}),
    },
    retry: {
      max_attempts: attempts,
    },
    reduce: enumValue(
      raw.reduce,
      [
        'cross_check_2pass',
        'hierarchical',
        'concat_validate',
        'stitch',
      ] as const,
      `${label}.reduce`,
    ),
  }
}
