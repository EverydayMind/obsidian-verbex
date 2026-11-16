import { canonicalDigest } from '../../security/promptInjectionBoundary'
import type { ToolArgs } from '../tools/localToolCommon'

import type { ReportStylePorts } from './ports'
import { type ProfileV2, derivationDigestV2, styleSources } from './profileV2'
import { validateStyleJson } from './schema'

export async function linkV2(
  machine: ProfileV2,
  args: ToolArgs,
  byteHash: (path: string) => Promise<string>,
  ports: ReportStylePorts,
  signal?: AbortSignal,
): Promise<ProfileV2> {
  const path = args.template_path as string
  const hash = await byteHash(path)
  const digest = await derivationDigestV2(machine)
  if (signal?.aborted) throw new Error('Report style operation cancelled.')
  if (
    hash !== args.expected_template_sha256 ||
    digest !== args.expected_derivation_sha256 ||
    !ports.readDerivationReport
  )
    throw new Error(
      'Template hash/derivation mismatch or Exporter unavailable.',
    )
  const report = validateStyleJson<{
    outputHash: string
    sourceSha256: string
    derivationSha256: string
    provenance: { state: string }
    markerInventory: { marker: string; count: number }[]
  }>('report', await ports.readDerivationReport(path, hash, signal))
  if (signal?.aborted) throw new Error('Report style operation cancelled.')
  const sources = styleSources(machine.roleStyleMap)
  if (
    report.outputHash !== hash ||
    report.sourceSha256 !== machine.snapshot.source.sha256 ||
    report.derivationSha256 !== digest ||
    report.provenance.state !== 'verified' ||
    sources.some(
      (source) =>
        !report.markerInventory.some(
          (item) => item.marker === source.marker && item.count > 0,
        ),
    )
  )
    throw new Error(
      'Exporter derivation report does not match the current profile/template.',
    )
  return {
    ...machine,
    template: {
      path,
      sha256: hash,
      derivedFromSourceSha256: machine.snapshot.source.sha256,
      derivationSha256: digest,
      derivationSchema: 'report-style-derivation/2',
      styleSourcesSha256: await canonicalDigest(sources),
    },
  }
}
