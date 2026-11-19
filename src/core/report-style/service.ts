import { App } from 'obsidian'

import { copyJson } from '../../provider/interop/descriptorReader'
import { assertNotAiPrivate } from '../../security/aiPrivateRefusal'
import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import { sha256HexBytes } from '../../utils/hash'
import { validators as compiled } from '../../validation/validators'
import type { ChangeOutcome } from '../../workflow/StepExecutor'
import type { AgentToolOutcome } from '../llm/toolOutcome'
import { type ToolArgs, type ToolResult } from '../tools/localToolCommon'
import { REPORT_STYLE_TOOL_REGISTRY } from '../tools/reportStyleTools'

import { compareProfile, comparisonPage } from './compare'
import { executeDraftCheck } from './draftCheck'
import { prepareInterpretedDraft } from './draftInterpretation'
import { guardStyleApi } from './guardedStyleApi'
import { type StyleApi, getStyleApi, measureStyle } from './kordocStyleApi'
import { parseAnyProfileNote, parseProfileNoteForUpgrade } from './note'
import type { ReportStylePorts } from './ports'
import { profileNextStep } from './profileNextStep'
import { ProfileReader } from './profileRead'
import { prepareProfileSave } from './profileSave'
import { ProfileUpdater } from './profileUpdate'
import { readV2, updateV2 } from './profileV2Service'
import { needsV2Live, readV2Live } from './profileV2Views'
export type { ReportStylePorts } from './ports'
import type { ProfileMachine } from './types'

function validateArgs(tool: string, args: ToolArgs): ToolArgs {
  if (!Object.prototype.hasOwnProperty.call(REPORT_STYLE_TOOL_REGISTRY, tool))
    throw new Error('Unknown report style tool.')
  const validate = compiled[tool]
  if (!validate) throw new Error('Unknown report style tool.')
  const copy = copyJson(args, {
    maxDepth: 16,
    maxNodes: 10000,
    maxBytes: 256 * 1024,
  })
  if (!validate(copy))
    throw new Error(
      `Invalid ${tool} arguments: ${JSON.stringify(validate.errors)}`,
    )
  return copy as ToolArgs
}
const string = (args: ToolArgs, key: string) => args[key] as string

export class ReportStyleService {
  constructor(
    private app: App,
    private ports: ReportStylePorts = {},
  ) {}
  setPorts(ports: ReportStylePorts): void {
    this.ports = ports
  }
  prepareDraftInputs(input: Parameters<typeof prepareInterpretedDraft>[2]) {
    return prepareInterpretedDraft(this.app, this.ports, input)
  }
  private path(path: string): string {
    if (
      path.length > 4096 ||
      path.includes('\\') ||
      path.split('/').some((part) => !part || part.startsWith('.'))
    )
      throw new Error('Canonical user Vault POSIX path required.')
    return assertUserVaultPath(this.app, path)
  }
  private api(): StyleApi {
    return guardStyleApi(this.ports.styleApi?.() ?? getStyleApi(this.app))
  }
  private async read(path: string, forUpgrade = false) {
    const valid = this.path(path),
      stat = await this.app.vault.adapter.stat(valid)
    if (!stat || stat.type !== 'file' || stat.size > 6 * 1024 * 1024)
      throw new Error('Profile note missing or exceeds 6 MiB.')
    const bytes = await this.app.vault.adapter.readBinary(valid)
    if (bytes.byteLength > 6 * 1024 * 1024)
      throw new Error('Profile note exceeds 6 MiB.')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return {
      text,
      noteSha256: await sha256HexBytes(bytes),
      ...(await (forUpgrade
        ? parseProfileNoteForUpgrade(text)
        : parseAnyProfileNote(text))),
    }
  }
  private async byteHash(path: string): Promise<string> {
    const valid = this.path(path),
      stat = await this.app.vault.adapter.stat(valid)
    if (!stat || stat.type !== 'file' || stat.size > 32 * 1024 * 1024)
      throw new Error('Style source/template missing or exceeds 32 MiB.')
    const bytes = await this.app.vault.adapter.readBinary(valid)
    if (bytes.byteLength > 32 * 1024 * 1024)
      throw new Error('Style source/template exceeds 32 MiB.')
    return sha256HexBytes(bytes)
  }
  async execute(
    tool: string,
    input: ToolArgs,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    const args = validateArgs(tool, input)
    if (signal?.aborted) throw new Error('Report style operation cancelled.')
    for (const key of [
      'source_path',
      'profile_path',
      'template_path',
      'output_path',
    ])
      if (typeof args[key] === 'string') this.path(string(args, key))
    if (tool === 'save_style_profile')
      return prepareProfileSave({
        app: this.app,
        args,
        path: (value) => this.path(value),
        byteHash: (value) => this.byteHash(value),
        api: () => this.api(),
        signal,
      })
    if (tool === 'check_report_draft')
      return executeDraftCheck(this.app, this.ports, args, signal)
    const profilePath = string(args, 'profile_path'),
      loaded = await this.read(
        profilePath,
        tool === 'update_style_profile' && args.operation === 'upgrade_schema',
      )
    // The preview catch below keeps a failed preview quiet; a private source
    // is a refusal, not a missing preview.
    if (tool === 'read_style_profile' && args.include_source_previews === true)
      assertNotAiPrivate(loaded.machine.sourcePath)
    if (
      tool === 'read_style_profile' &&
      args.view !== 'structure' &&
      (args.semantic_assignments !== undefined ||
        args.expected_structure_sha256 !== undefined)
    )
      throw new Error('Semantic corrections require the structure view.')
    if (
      tool === 'update_style_profile' &&
      (args.operation === 'upgrade_schema' ||
        args.operation === 'set_semantics' ||
        args.operation === 'set_role_styles' ||
        loaded.machine.schema === 'report-style-profile/2')
    )
      return updateV2(
        args,
        loaded,
        (path) => this.byteHash(path),
        this.ports,
        () => this.api(),
        (path) => this.path(path),
        signal,
      )
    if (loaded.machine.schema === 'report-style-profile/2') {
      if (
        tool === 'read_style_profile' &&
        needsV2Live(args.view, !!loaded.machine.semanticReplay)
      ) {
        return readV2Live(
          args,
          { ...loaded, machine: loaded.machine },
          () => this.api(),
          this.path(loaded.machine.sourcePath),
          signal,
        )
      }
      if (
        tool === 'read_style_profile' &&
        ['semantic', 'ambiguous', 'source_text', 'candidates'].includes(
          args.view as string,
        )
      ) {
        return new ProfileReader(
          (path) => this.path(path),
          () => this.api(),
          (value, paths) => this.result(value, paths),
        ).readView(
          args,
          { ...loaded, machine: loaded.machine as unknown as ProfileMachine },
          signal,
        )
      }
      if (tool === 'read_style_profile')
        return readV2(args, { ...loaded, machine: loaded.machine })
      throw new Error('This operation is not yet available for a v2 profile.')
    }
    const note = { ...loaded, machine: loaded.machine }
    if (tool === 'read_style_profile')
      return new ProfileReader(
        (path) => this.path(path),
        () => this.api(),
        (value, paths) => this.result(value, paths),
      ).readView(args, note, signal)
    if (tool === 'compare_style_profile') {
      const offset = (args.offset as number) ?? 0
      if (offset > 0 && !args.expected_output_sha256)
        throw new Error('Pagination requires expected_output_sha256.')
      const output = await measureStyle(
        this.api(),
        string(args, 'output_path'),
        args.expected_output_sha256 as string | undefined,
        signal,
      )
      return this.result(
        comparisonPage(
          compareProfile(
            note.machine,
            output.snapshot,
            args.output_bindings as
              | { key: string; representativeRef: string }[]
              | undefined,
          ),
          offset,
          (args.limit as number) ?? 100,
        ),
        [profilePath, string(args, 'output_path')],
      )
    }
    return new ProfileUpdater(
      (path) => this.path(path),
      () => this.api(),
      (path) => this.byteHash(path),
      this.ports,
    ).update(args, note, signal)
  }
  private result(value: unknown, evidencePaths: string[]): ToolResult {
    const text = JSON.stringify(value)
    if (new TextEncoder().encode(text).byteLength > 128 * 1024)
      throw new Error(
        'Report style result exceeds 128 KiB; request a smaller page.',
      )
    return { kind: 'read', text, evidencePaths }
  }
  async finalizeOutcome(
    outcome: ChangeOutcome,
    base: AgentToolOutcome,
  ): Promise<AgentToolOutcome> {
    if (
      !['save_style_profile', 'update_style_profile'].includes(
        outcome.change.tool,
      ) ||
      outcome.status !== 'applied'
    )
      return base
    try {
      const note = await this.read(outcome.change.path)
      if (note.text !== outcome.appliedContent)
        throw new Error('Readback differs from applied profile.')
      const previous = outcome.change.before
        ? (
            await parseAnyProfileNote(outcome.change.before).catch(() =>
              parseProfileNoteForUpgrade(outcome.change.before!),
            )
          ).machine
        : null
      const invalidatedTemplate =
        previous?.template && !note.machine.template
          ? { path: previous.template.path, sha256: previous.template.sha256 }
          : undefined
      const clearedSemanticsCount =
        previous?.schema === 'report-style-profile/2' &&
        note.machine.schema === 'report-style-profile/2' &&
        previous.measurementSha256 !== note.machine.measurementSha256
          ? previous.semantics.length
          : undefined
      const receipt = {
        path: outcome.change.path,
        noteSha256: note.noteSha256,
        revision: note.machine.revision,
        readback: 'verified' as const,
        ...(invalidatedTemplate ? { invalidatedTemplate } : {}),
        ...(clearedSemanticsCount !== undefined
          ? { clearedSemanticsCount }
          : {}),
      }
      // The next tool on the derivation path rides on the receipt, so the
      // model continues from this result instead of re-reading the summary
      // (2026-11-03: after set_bindings it guessed derive_template's paths).
      const nextStep =
        note.machine.schema === 'report-style-profile/1'
          ? await profileNextStep(
              note.machine,
              outcome.change.path,
              note.noteSha256,
            )
          : undefined
      return {
        ...base,
        displayText: `${base.displayText}\n${JSON.stringify({ reportStyleReceipt: receipt, ...(nextStep ? { nextStep } : {}) })}`,
        reportStyleReceipt: receipt,
      }
    } catch {
      return {
        ...base,
        displayText: `${base.displayText}\nProfile saved; readback unverified. Do not automatically save again.`,
        reportStyleReceipt: {
          path: outcome.change.path,
          noteSha256: '',
          revision: 0,
          readback: 'unverified',
        },
      }
    }
  }
}
