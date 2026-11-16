import type { App } from 'obsidian'

import type { ProviderCheckpointStore } from '../../checkpoint/ProviderCheckpointStore'

import { guardDocumentOutput } from './documentOutputGuard'
import { probeOutputPath } from './documentOutputPath'
import type { JsonObject } from './protocol'
import * as modelText from './residualJobText'

type Result =
  | {
      state: 'blocked'
      reason: 'checkpoint_records_unreadable' | 'output_path_unreadable'
      details: JsonObject
    }
  | {
      state: 'ready'
      draftPath: string
      outputPath: string
      outputRenamed?: { requested: string; used: string }
    }

export function outputBaseName(
  samplePath: string,
  outputName?: string,
): string {
  const original =
    outputName ??
    modelText.defaultOutputName(
      samplePath
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') ?? '',
    )
  const name = original.replace(/(?:\.hwpx)+$/i, '')
  // Cross-platform file names; never let a supplied name become a path.
  if (
    !name.trim() ||
    name === '.' ||
    name === '..' ||
    name.length > 250 ||
    /[\\/:*?"<>|]/.test(name) ||
    [...name].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error('Invalid output name.')
  return name
}

/** Select an unused output and draft pair using the same persistent guard as produce. */
export async function prepareOutputPaths(input: {
  app: App
  checkpoints: Pick<ProviderCheckpointStore, 'scan'>
  vaultPath: (path: string) => string
  locks: Set<string>
  providerBusy: boolean
  conversationId: string
  samplePath: string
  outputName?: string
}): Promise<Result> {
  const name = outputBaseName(input.samplePath, input.outputName)
  const requested = input.vaultPath(`Outputs/${name}.hwpx`)
  for (let number = 1; number <= 10000; number++) {
    const base = `Outputs/${name}${number === 1 ? '' : `-${number}`}`
    if (`${name}${number === 1 ? '' : `-${number}`}.hwpx`.length > 255)
      throw new Error('Output name is too long to add a collision suffix.')
    const outputPath = input.vaultPath(`${base}.hwpx`)
    const draftPath = input.vaultPath(`${base}.md`)
    const guard = await guardDocumentOutput({ ...input, path: outputPath })
    if (guard.state === 'checkpoint_records_unreadable')
      return {
        state: 'blocked' as const,
        reason: guard.state,
        details: { records: guard.records, listingFailed: guard.listingFailed },
      }
    if (guard.state === 'output_path_unreadable')
      return {
        state: 'blocked' as const,
        reason: guard.state,
        details: { path: guard.path, pathReason: guard.reason },
      }
    if (guard.state === 'save_in_progress')
      throw new Error('Exporter is busy; retry prepare.')
    if (guard.state !== 'ready') continue
    const draft = await probeOutputPath(input.app, draftPath)
    if (draft.kind === 'unreadable')
      return {
        state: 'blocked' as const,
        reason: 'output_path_unreadable' as const,
        details: { path: draftPath, pathReason: draft.reason },
      }
    if (draft.kind === 'occupied') continue
    return {
      state: 'ready' as const,
      draftPath,
      outputPath,
      ...(requested === outputPath
        ? {}
        : { outputRenamed: { requested, used: outputPath } }),
    }
  }
  throw new Error('No available output name within the safety limit.')
}
