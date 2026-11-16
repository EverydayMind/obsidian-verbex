import type { App } from 'obsidian'

import { canonicalDigest } from '../../security/promptInjectionBoundary'
import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import { sha256HexBytes } from '../../utils/hash'

import { parseAnyProfileNote } from './note'
import type { ObservedDraftResult } from './observedBlockRead'
import type { ReportStylePorts } from './ports'
import { SEMANTIC_STATS_VERSION } from './semanticStats'

const version = 'report-style-draft-inputs/0.1'
type Hashes = {
  draft: string | null
  profile: string | null
  template: string | null
  baseline: string | null
}
type BoundInput = { path: string; bytes: Uint8Array; sha256: string }
type Parsed = Awaited<ReturnType<typeof parseAnyProfileNote>>
type DraftInputs =
  | {
      state: 'available'
      inputsDigest: string
      before: Hashes
      profile: Parsed['machine']
      draftText: string
      baselineText: string | null
      observed: Extract<ObservedDraftResult, { state: 'available' }>
    }
  | { state: 'input_changed'; before: Hashes; after: Hashes | null }
  | { state: 'unavailable' | 'block_contract_violation'; before: Hashes }
export type BoundDraftInputs = Extract<DraftInputs, { state: 'available' }>

/** Revalidate the original four inputs after any additional asynchronous work. */
export async function recheckBoundDraftInputs(
  app: App,
  input: {
    draftPath: string
    profilePath: string
    baselinePath?: string
    signal?: AbortSignal
  },
  bound: BoundDraftInputs,
) {
  const hash = async (path: string, max: number): Promise<string | null> => {
    try {
      input.signal?.throwIfAborted()
      if (
        path.length > 4096 ||
        path.includes('\\') ||
        path.split('/').some((part) => !part || part.startsWith('.'))
      )
        throw new Error('Canonical user Vault path required.')
      const valid = assertUserVaultPath(app, path)
      const stat = await app.vault.adapter.stat(valid)
      input.signal?.throwIfAborted()
      if (!stat || stat.type !== 'file' || stat.size > max) return null
      const bytes = new Uint8Array(await app.vault.adapter.readBinary(valid))
      input.signal?.throwIfAborted()
      if (bytes.byteLength > max) return null
      return await sha256HexBytes(bytes)
    } catch {
      input.signal?.throwIfAborted()
      return null
    }
  }
  const [draft, profile, template, baseline] = await Promise.all([
    hash(input.draftPath, 32 * 1024 * 1024),
    hash(input.profilePath, 6 * 1024 * 1024),
    hash(bound.observed.inputDependencies[1].path, 32 * 1024 * 1024),
    input.baselinePath
      ? hash(input.baselinePath, 32 * 1024 * 1024)
      : Promise.resolve(null),
  ])
  input.signal?.throwIfAborted()
  const after: Hashes = { draft, profile, template, baseline }
  return {
    after,
    unchanged: (Object.keys(after) as (keyof Hashes)[]).every(
      (key) => after[key] === bound.before[key],
    ),
  }
}

/** Capture bytes for interpretation and compare them again after the provider read. */
export async function bindDraftInputs(
  app: App,
  ports: ReportStylePorts,
  input: {
    draftPath: string
    profilePath: string
    templatePath?: string
    baselinePath?: string
    expectedDraftSha256?: string
    expectedInputsDigest?: string
    offset?: number
    signal?: AbortSignal
  },
): Promise<DraftInputs> {
  const { signal } = input
  signal?.throwIfAborted()
  const checked = (path: string): string => {
    if (
      path.length > 4096 ||
      path.includes('\\') ||
      path.split('/').some((part) => !part || part.startsWith('.'))
    )
      throw new Error('Canonical user Vault path required.')
    return assertUserVaultPath(app, path)
  }
  const read = async (path: string, max: number): Promise<BoundInput> => {
    signal?.throwIfAborted()
    const valid = checked(path),
      stat = await app.vault.adapter.stat(valid)
    signal?.throwIfAborted()
    if (!stat || stat.type !== 'file' || stat.size > max)
      throw new Error('Draft input missing or oversized.')
    const bytes = new Uint8Array(
      await app.vault.adapter.readBinary(valid),
    ).slice()
    signal?.throwIfAborted()
    if (bytes.byteLength > max) throw new Error('Draft input oversized.')
    return { path: valid, bytes, sha256: await sha256HexBytes(bytes) }
  }
  const afterHash = async (
    path: string,
    max: number,
  ): Promise<string | null> => {
    try {
      return (await read(path, max)).sha256
    } catch {
      signal?.throwIfAborted()
      return null
    }
  }
  if (
    !Number.isSafeInteger(input.offset ?? 0) ||
    (input.offset ?? 0) < 0 ||
    ((input.offset ?? 0) > 0 && !input.expectedInputsDigest) ||
    [input.expectedInputsDigest, input.expectedDraftSha256].some(
      (value) => value !== undefined && !/^[a-f0-9]{64}$/.test(value),
    )
  )
    throw new Error('Invalid draft check pagination or digest.')
  const profileFile = await read(input.profilePath, 6 * 1024 * 1024)
  const profile = (
    await parseAnyProfileNote(
      new TextDecoder('utf-8', { fatal: true }).decode(profileFile.bytes),
    )
  ).machine
  signal?.throwIfAborted()
  const templatePath = input.templatePath ?? profile.template?.path
  if (!templatePath) throw new Error('Draft check requires a template.')
  const [draft, template, baseline] = await Promise.all([
    read(input.draftPath, 32 * 1024 * 1024),
    read(templatePath, 32 * 1024 * 1024),
    input.baselinePath
      ? read(input.baselinePath, 32 * 1024 * 1024)
      : Promise.resolve(null),
  ])
  const before: Hashes = {
    draft: draft.sha256,
    profile: profileFile.sha256,
    template: template.sha256,
    baseline: baseline?.sha256 ?? null,
  }
  if (input.expectedDraftSha256 && input.expectedDraftSha256 !== draft.sha256)
    return { state: 'input_changed', before, after: null }
  if (!ports.inspectExportBlocks) return { state: 'unavailable', before }
  const observed = await ports.inspectExportBlocks(
    draft.path,
    template.path,
    draft.sha256,
    template.sha256,
    signal,
  )
  signal?.throwIfAborted()
  const [afterDraft, afterProfile, afterTemplate, afterBaseline] =
    await Promise.all([
      afterHash(draft.path, 32 * 1024 * 1024),
      afterHash(profileFile.path, 6 * 1024 * 1024),
      afterHash(template.path, 32 * 1024 * 1024),
      baseline
        ? afterHash(baseline.path, 32 * 1024 * 1024)
        : Promise.resolve(null),
    ])
  signal?.throwIfAborted()
  const after: Hashes = {
    draft: afterDraft,
    profile: afterProfile,
    template: afterTemplate,
    baseline: afterBaseline,
  }
  if (
    Object.keys(before).some(
      (key) => before[key as keyof Hashes] !== after[key as keyof Hashes],
    ) ||
    observed.state === 'input_changed'
  )
    return { state: 'input_changed', before, after }
  if (observed.state !== 'available') return { state: observed.state, before }
  const dependencies = observed.inputDependencies
  if (
    ![
      'observed-block-page/0.1',
      'observed-block-page/0.2',
      'observed-block-page/0.3',
      'observed-block-page/0.4',
    ].includes(String(observed.conversionIdentity.blockContractVersion)) ||
    dependencies[0]?.path !== draft.path ||
    dependencies[0]?.sha256 !== draft.sha256 ||
    dependencies[1]?.path !== template.path ||
    dependencies[1]?.sha256 !== template.sha256 ||
    observed.inputsDigest !==
      (await canonicalDigest({
        version: observed.conversionIdentity.blockContractVersion,
        inputDependencies: dependencies,
        conversionIdentity: observed.conversionIdentity,
      }))
  )
    return { state: 'block_contract_violation', before }
  const inputsDigest = await canonicalDigest({
    checkVersion: version,
    statsVersion: SEMANTIC_STATS_VERSION,
    draft: draft.sha256,
    profileNote: profileFile.sha256,
    profileRevision: profile.revision,
    template: template.sha256,
    baseline: baseline?.sha256 ?? null,
    exporterInputs: await canonicalDigest(dependencies),
    conversionIdentity: observed.conversionIdentity,
  })
  if (input.expectedInputsDigest && inputsDigest !== input.expectedInputsDigest)
    return { state: 'input_changed', before, after }
  return {
    state: 'available',
    inputsDigest,
    before,
    profile,
    draftText: new TextDecoder('utf-8', { fatal: true }).decode(draft.bytes),
    baselineText: baseline
      ? new TextDecoder('utf-8', { fatal: true }).decode(baseline.bytes)
      : null,
    observed,
  }
}
