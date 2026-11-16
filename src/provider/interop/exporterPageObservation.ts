import {
  hasNonRoundTripNumber,
  sortReadValue,
} from '../../context/canonicalRead'
import type { ProviderPageVersion } from '../../context/structuredReadObservation'
import { validateObservedBlockPage } from '../../core/report-style/observedBlockSchema'
import { canonicalDigest } from '../../security/promptInjectionBoundary'
import { HWPX_EXPORTER_PROVIDER_ID } from '../contract'

import type { NativeCall } from './readExecution'

/** The provider reports these inputs; the digest verifies consistency, not disk state. */
export async function exporterPageVersion(
  call: NativeCall,
  continuation: string,
): Promise<ProviderPageVersion | undefined> {
  if (
    call.handle.pluginId !== HWPX_EXPORTER_PROVIDER_ID ||
    call.tool.name !== 'inspect_export_blocks' ||
    !continuation ||
    continuation.length > 40_000
  )
    return undefined
  try {
    const value: unknown = JSON.parse(continuation)
    if (!validateObservedBlockPage(value)) return undefined
    const page = value as {
      version: string
      inputsDigest: string
      conversionIdentity: {
        pluginVersion: string
        blockContractVersion: string
      }
      inputDependencies: { path: string; sha256: string }[]
      offset: number
      totalBlocks: number
      nextOffset: number | null
      blocks: { index: number }[]
    }
    const args = call.args
    if (hasNonRoundTripNumber(args)) return undefined
    const offset = args.offset ?? 0,
      limit = args.limit ?? 100
    if (
      typeof args.path !== 'string' ||
      typeof args.template !== 'string' ||
      typeof offset !== 'number' ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      typeof limit !== 'number' ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500
    )
      return undefined
    const paths = page.inputDependencies.map((dependency) => dependency.path)
    if (
      new Set(paths).size !== paths.length ||
      paths[0] !== args.path ||
      paths[1] !== args.template ||
      page.conversionIdentity.pluginVersion !== call.handle.pluginVersion ||
      page.conversionIdentity.blockContractVersion !== page.version ||
      page.offset !== offset ||
      page.blocks.length > limit ||
      page.offset + page.blocks.length > page.totalBlocks ||
      page.nextOffset !==
        (page.offset + page.blocks.length < page.totalBlocks
          ? page.offset + page.blocks.length
          : null) ||
      (page.nextOffset !== null && !page.blocks.length) ||
      page.blocks.some((block, index) => block.index !== page.offset + index) ||
      (args.expected_inputs_digest !== undefined &&
        args.expected_inputs_digest !== page.inputsDigest) ||
      (args.block_contract_version !== undefined &&
        args.block_contract_version !== page.version)
    )
      return undefined
    if (
      page.inputsDigest !==
      (await canonicalDigest({
        version: page.version,
        inputDependencies: page.inputDependencies,
        conversionIdentity: page.conversionIdentity,
      }))
    )
      return undefined
    const subject = Object.fromEntries(
      Object.entries(args).filter(
        ([key]) => !['offset', 'limit', 'expected_inputs_digest'].includes(key),
      ),
    )
    return {
      source: 'provider',
      key: JSON.stringify([
        call.name,
        call.digest,
        call.generation,
        sortReadValue(subject),
      ]),
      version: page.inputsDigest,
    }
  } catch {
    return undefined
  }
}
