import { noteFormatLocale } from '../../i18n/noteFormats'
import {
  type ToolArgs,
  type ToolResult,
  changeHelper,
} from '../tools/localToolCommon'

import { renderCompactProfileNote } from './compactProfileNote'
import { refreshCompactStyle } from './compactStyleApi'
import { validateExpandedProfile } from './expandedProfile'
import { type StyleApi, measureStyle } from './kordocStyleApi'
import { type ParsedProfileNote, renderProfileNote } from './note'
import {
  PROFILE_V1_OPERATION_FIELDS,
  operationArgumentProblem,
} from './operationArgs'
import { profileOverlapNotes } from './overlapAdvisory'
import type { ReportStylePorts } from './ports'
import { derivationDigest, validateProfile, validateStyleJson } from './schema'
import type { Binding, FixedRegion, ProfileMachine } from './types'
import { parseVariantMarker } from './variantMarkers'
const string = (args: ToolArgs, key: string) => args[key] as string
export class ProfileUpdater {
  constructor(
    private path: (path: string) => string,
    private api: () => StyleApi,
    private byteHash: (path: string) => Promise<string>,
    private ports: ReportStylePorts,
  ) {}
  async update(
    args: ToolArgs,
    note: ParsedProfileNote & { text: string; noteSha256: string },
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    if (
      note.noteSha256 !== args.expected_note_sha256 ||
      note.machine.revision !== args.expected_revision
    )
      throw new Error('Profile note/revision changed.')
    const operation = string(args, 'operation')
    const problem = operationArgumentProblem(
      operation,
      args,
      PROFILE_V1_OPERATION_FIELDS[operation],
    )
    if (problem) throw new Error(problem)
    let machine = {
        ...note.machine,
        revision: note.machine.revision + 1,
        updated: new Date().toISOString(),
      },
      guidance = note.guidance
    if (operation === 'set_guidance') guidance = string(args, 'guidance')
    if (operation === 'set_bindings') {
      const bindings = (args.bindings as Binding[]).map((binding) => ({
        ...binding,
        assignedBy: 'model' as const,
      }))
      if (bindings.some((binding) => parseVariantMarker(binding.marker)))
        throw new Error('Named variant bindings require profile v2.')
      if (!this.ports.validateMarkers)
        throw new Error('Exporter marker catalog validation unavailable.')
      if (signal?.aborted) throw new Error('Report style operation cancelled.')
      await this.ports.validateMarkers(
        bindings.map((binding) => binding.marker),
        signal,
      )
      if (signal?.aborted) throw new Error('Report style operation cancelled.')
      machine = {
        ...machine,
        bindings,
        fixedRegions: args.fixed_regions as FixedRegion[],
        template: null,
      }
    }
    if (operation === 'refresh_measurement')
      machine = {
        ...machine,
        ...(await (note.compact
          ? refreshCompactStyle(
              this.api(),
              this.path(machine.sourcePath),
              this.byteHash,
              signal,
            )
          : measureStyle(
              this.api(),
              this.path(machine.sourcePath),
              undefined,
              signal,
            ))),
        bindings: [],
        fixedRegions: [],
        template: null,
      }
    if (operation === 'link_template')
      machine = await this.link(machine, args, signal)
    machine = await (note.compact
      ? validateExpandedProfile(machine)
      : validateProfile(machine))
    const dependencies =
      operation === 'refresh_measurement'
        ? [
            {
              path: this.path(machine.sourcePath),
              sha256Before: machine.snapshot.source.sha256,
            },
          ]
        : operation === 'link_template' && machine.template
          ? [
              {
                path: this.path(machine.template.path),
                sha256Before: machine.template.sha256,
              },
            ]
          : []
    const after = await (note.compact
      ? renderCompactProfileNote(
          machine,
          guidance,
          note.newline,
          noteFormatLocale(note.text),
        )
      : renderProfileNote(
          machine,
          guidance,
          note.newline,
          noteFormatLocale(note.text),
        ))
    const approvalNotes = await profileOverlapNotes({
      args,
      machine,
      api: this.api,
      path: this.path,
      signal,
    })
    if (signal?.aborted) throw new Error('Report style operation cancelled.')
    return changeHelper('update_style_profile', {
      op: 'modify',
      kind: 'body',
      path: string(args, 'profile_path'),
      before: note.text,
      after,
      approvalMode: 'whole_change',
      approvalNotes,
      binarySourceDependencies: dependencies,
    })
  }
  private async link(
    machine: ProfileMachine,
    args: ToolArgs,
    signal?: AbortSignal,
  ): Promise<ProfileMachine> {
    const path = string(args, 'template_path'),
      hash = await this.byteHash(path),
      digest = await derivationDigest(machine)
    if (
      hash !== args.expected_template_sha256 ||
      digest !== args.expected_derivation_sha256 ||
      !this.ports.readDerivationReport
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
    }>('report', await this.ports.readDerivationReport(path, hash, signal))
    if (
      report.outputHash !== hash ||
      report.sourceSha256 !== machine.snapshot.source.sha256 ||
      report.derivationSha256 !== digest ||
      report.provenance.state !== 'verified' ||
      machine.bindings.some(
        (binding) =>
          !report.markerInventory.some(
            (item) => item.marker === binding.marker && item.count > 0,
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
      },
    }
  }
}
