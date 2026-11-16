import { normalizePath } from 'obsidian'

import { noteFormat, noteFormatLocale } from '../../i18n/noteFormats'
import { sha256Hex } from '../../utils/hash'
import { ProposedChange } from '../../verbex/types'
import { parseBatchLedger } from '../batch/foregroundBatchRunner'
import {
  addFindingAggregationRow,
  findingAggregation,
  renderFindingAggregations,
} from '../tools/findingAggregation'
import {
  countIssueTableRows,
  renderFindingNote,
  validateFindingBody,
} from '../tools/findingMarkdown'
import { findingNoteSchema } from '../tools/findingNoteSchema'
import { splitLines } from '../tools/noteSlicing'
import {
  frontmatterValue,
  getIndexProvenance,
} from '../tools/reviewIndexMetadata'
import { parseStructure } from '../tools/structureParser'
import {
  ChecklistItem,
  FindingValidationError,
  checklistPhaseIds,
  checklistPhaseProgress,
  duplicateChecklistIds,
  emptyChecklistPhaseError,
  extractCrossRefs,
  extractDefinedTerms,
  formatDuplicateChecklistIds,
  indexTermUsage,
  parseChecklist,
  parseChecklistLogs,
  resolveChecklistItem,
  resolveTreatyPath,
  safeUnitName,
  safeWikiName,
  selectReviewIndexXrefs,
  toggleChecklistItem,
} from '../tools/treatyWiki'

import * as text from './reviewIndexRuntimeText'
import { assignUniqueTermNames } from './termNameAllocator'
import { createTreatySourceRangeChecker } from './treatySourceRange'
import {
  checkTreatySourceSnapshot,
  treatySourceSnapshotFields,
} from './treatySourceSnapshot'

export type ReviewIndexVault = {
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  getMarkdownFiles(): { path: string }[]
}

export type ReviewIndexWriter = {
  proposedWrite(
    path: string,
    content: string,
    tool: string,
  ): Promise<ProposedChange>
}

export class ReviewIndexRuntime {
  constructor(
    private vault: ReviewIndexVault,
    private writer: ReviewIndexWriter,
  ) {}

  private treatyPath(folder: string, relative: string): string | null {
    return resolveTreatyPath(folder, relative)
  }

  private treatyBatchLedgerPath(wikiFolder: string): string {
    return normalizePath(`${wikiFolder}/_batch_ledger.json`)
  }

  private async loadTreatyChecklist(wikiFolder: string): Promise<{
    path: string
    markdown: string
    items: ChecklistItem[]
    docId: string
    buildId: string
  }> {
    const path = normalizePath(`${wikiFolder}/_checklist.md`)
    if (!(await this.vault.exists(path)))
      throw new Error(`File not found: ${path}`)
    const markdown = await this.vault.read(path)
    const docId = getIndexProvenance(markdown)
    const buildId = frontmatterValue(markdown, 'build_id')
    if (!docId || !buildId) throw new Error(text.invalidChecklist())
    const items = parseChecklist(markdown)
    const duplicates = duplicateChecklistIds(items)
    if (duplicates.length > 0) {
      throw new Error(
        text.duplicateChecklistIds(formatDuplicateChecklistIds(duplicates)),
      )
    }
    return { path, markdown, items, docId, buildId }
  }

  async buildReviewIndex(input: {
    sourcePath: string
    sourceFolder: string
    wikiFolder: string
    rebuild: boolean
    preview: boolean
    maxUnitTokens?: number
    structureProfile?: string
    structureBoundaries?: any[]
    findingSchema?: string
    findingSchemaColumns?: any[]
    checklistPhases?: string[]
    // Internal-only channel (not an LLM tool arg): phase titles/order declared
    // via workflow `checklist.phases`. Item-generation per phase id stays a
    // dedicated builder (see phaseBuilders below); only title/order is
    // declarative here.
    checklistPhaseDefinitions?: { id: string; title?: string }[]
  }): Promise<{
    previewResult?: string
    changes?: ProposedChange[]
    buildId?: string
    docId?: string
    unitsCount?: number
    termsCount?: number
    checklistCount?: number
  }> {
    const {
      sourcePath,
      sourceFolder,
      wikiFolder,
      preview,
      maxUnitTokens = 4000,
      structureProfile = 'legal-numbered',
      structureBoundaries,
      findingSchema = 'issue_table_v1',
      findingSchemaColumns,
      // R/F were previously unconditional regardless of checklistPhases; keep
      // both in the default so callers that omit checklistPhases (e.g. direct
      // buildReviewIndex callers/tests) still get identical output.
      checklistPhases = ['R', 'C', 'F'],
      checklistPhaseDefinitions,
    } = input

    const sourceFiles = sourcePath
      ? this.vault.getMarkdownFiles().filter((file) => file.path === sourcePath)
      : this.vault
          .getMarkdownFiles()
          .filter((file) => file.path.startsWith(`${sourceFolder}/`))

    if (sourceFiles.length === 0) throw new Error(text.noSource())

    const sources = await Promise.all(
      sourceFiles.map(async (file) => ({
        path: file.path,
        lines: splitLines(await this.vault.read(file.path)),
      })),
    )

    const structure = parseStructure(
      sources,
      maxUnitTokens,
      'none',
      structureProfile,
      structureBoundaries,
    )

    const bodies = new Map<string, string>()
    for (const unit of structure.units) {
      const source = sources.find((entry) => entry.path === unit.sourcePath)
      if (!source) throw new Error(text.missingSource(unit.sourcePath))
      bodies.set(
        unit.orderKey,
        source.lines.slice(unit.startLine - 1, unit.endLine).join('\n'),
      )
    }

    // 전량 포함 검증
    for (const source of sources) {
      const frontmatterEnd =
        source.lines[0]?.trim() === '---'
          ? source.lines.slice(1).findIndex((line) => line.trim() === '---') + 2
          : 0
      const firstBodyLine = frontmatterEnd > 1 ? frontmatterEnd + 1 : 1
      const covered = new Set<number>()
      structure.units
        .filter((unit) => unit.sourcePath === source.path)
        .forEach((unit) => {
          for (let line = unit.startLine; line <= unit.endLine; line += 1)
            covered.add(line)
        })
      const missing: number[] = []
      for (let line = firstBodyLine; line <= source.lines.length; line += 1)
        if (!covered.has(line)) missing.push(line)
      if (missing.length > 0)
        throw new Error(
          text.incompleteCoverage(source.path, missing.length, missing[0]),
        )
    }

    const terms = extractDefinedTerms(structure.units, bodies)

    if (preview) {
      return { previewResult: text.renderPreview(structure, terms.length) }
    }

    const termNames = await assignUniqueTermNames(terms)

    const docId = safeWikiName(
      (sourceFolder || sourcePath).split('/').pop() ?? 'treaty',
    )
    const sourceDigest = await sha256Hex(
      sources
        .map((source) => `${source.path}\n${source.lines.join('\n')}`)
        .join('\n'),
    )
    const buildId = `b-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${sourceDigest.slice(0, 6)}`
    const usage = indexTermUsage(terms, structure.units, bodies)
    const unitNames = new Map<string, string>()
    structure.units.forEach((unit) => {
      const unitTitle = safeUnitName(unit.title)
      unitNames.set(
        unit.orderKey,
        unitTitle ? `${unit.orderKey} ${unitTitle}` : unit.orderKey,
      )
    })

    const changes: ProposedChange[] = []
    for (const unit of structure.units) {
      const body = bodies.get(unit.orderKey) ?? ''
      const refs = extractCrossRefs(body, structure.units)
      const unitHash = (await sha256Hex(body)).slice(0, 8)
      const yamlList = (values: string[]) =>
        values.length
          ? `\n${values.map((value) => `  - "${value.replace(/"/g, '\\"')}"`).join('\n')}`
          : ' []'
      const internal = refs
        .filter((ref) => ref.kind === 'internal' && ref.resolvedOrderKey)
        .map((ref) => {
          const key = ref.resolvedOrderKey
          return key ? `[[${unitNames.get(key) ?? key}]]` : ''
        })
      const external = refs
        .filter((ref) => ref.kind === 'external')
        .map((ref) => ref.raw)
      const unresolved = refs
        .filter((ref) => ref.kind === 'unresolved')
        .map((ref) => ref.raw)
      const unitTerms = terms
        .filter((term) =>
          new RegExp(
            term.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'i',
          ).test(body),
        )
        .map((term) => `[[terms/${termNames.get(term.term)!}|${term.term}]]`)
      const content = [
        '---',
        `verbex_index: "${docId}"`,
        `kind: ${unit.kind}`,
        `order: "${unit.orderKey}"`,
        `title: "${unit.title.replace(/"/g, '\\"')}"`,
        `source: "${unit.sourcePath.replace(/"/g, '\\"')}"`,
        `source_lines: "${unit.startLine}-${unit.endLine}"`,
        `part: "${unit.part ? `${unit.part.index}/${unit.part.total}` : ''}"`,
        `build_id: "${buildId}"`,
        `unit_hash: "${unitHash}"`,
        `refs:${yamlList(internal)}`,
        `refs_external:${yamlList(external)}`,
        `refs_unresolved:${yamlList(unresolved)}`,
        `terms:${yamlList(unitTerms)}`,
        '---',
        body,
      ].join('\n')
      const name = unitNames.get(unit.orderKey) ?? unit.orderKey
      changes.push(
        await this.writer.proposedWrite(
          `${wikiFolder}/units/${name}.md`,
          content,
          'build_treaty_wiki',
        ),
      )
    }

    for (const term of terms) {
      const data = usage.get(term.term) ?? { usedIn: [], caseVariants: [] }
      const content = [
        '---',
        `verbex_index: "${docId}"`,
        'kind: term',
        `term: "${term.term.replace(/"/g, '\\"')}"`,
        `defined_in: "[[${unitNames.get(term.definedInOrderKey) ?? term.definedInOrderKey}]]"`,
        `definition_verb: ${term.verb}`,
        `scope: ${term.scope}`,
        `used_in:${data.usedIn.length ? `\n${data.usedIn.map((key) => `  - "[[${unitNames.get(key) ?? key}]]"`).join('\n')}` : ' []'}`,
        `case_variants:${data.caseVariants.length ? `\n${data.caseVariants.map((value) => `  - "${value}"`).join('\n')}` : ' []'}`,
        '---',
        `> ${term.definitionLine}`,
        '',
        text.definitionClause(
          unitNames.get(term.definedInOrderKey) ?? term.definedInOrderKey,
        ),
      ].join('\n')
      changes.push(
        await this.writer.proposedWrite(
          `${wikiFolder}/terms/${termNames.get(term.term)!}.md`,
          content,
          'build_treaty_wiki',
        ),
      )
    }

    const unitLines = structure.units.map((unit) => {
      const name = unitNames.get(unit.orderKey) ?? unit.orderKey
      return `- [[units/${name}|${unit.title}]]`
    })
    const termLines = terms.map(
      (term) => `- [[terms/${termNames.get(term.term)!}|${term.term}]]`,
    )
    changes.push(
      await this.writer.proposedWrite(
        `${wikiFolder}/_wiki.md`,
        `---\nverbex_index: "${docId}"\nverbex_wiki: "${docId}"\nkind: index\nbuild_id: "${buildId}"\n---\n# ${docId} Wiki\n\n## Units\n${unitLines.join('\n')}\n\n## Terms\n${termLines.join('\n')}\n`,
        'build_review_index',
      ),
    )

    const rItems = structure.units.map((unit) => {
      const name = unitNames.get(unit.orderKey) ?? unit.orderKey
      return `- [ ] R:${unit.orderKey} :: units/${name}.md :: findings/${unit.orderKey}.md`
    })

    const selectedXrefs =
      structure.profile === 'chunks'
        ? { selected: [], matchedCount: 0 }
        : selectReviewIndexXrefs(structure.units, bodies)
    const xrefs = selectedXrefs.selected.map(
      ({ unit }) =>
        `- [ ] C:xref-${unit.orderKey} :: units/${unitNames.get(unit.orderKey) ?? unit.orderKey}.md :: findings/C-xref-${unit.orderKey}.md`,
    )
    const xrefLimitWarning =
      selectedXrefs.matchedCount > selectedXrefs.selected.length
        ? text.xrefLimitWarning(
            selectedXrefs.matchedCount,
            selectedXrefs.selected.length,
          )
        : ''

    // Phase id -> item-generation rule stays a dedicated builder (R=units,
    // C=fixed audit/terms/xref items, F=fixed report line); only the phase
    // title and the order they're rendered in is declarative (from
    // checklistPhaseDefinitions when the workflow declares checklist.phases).
    const phaseBuilders: Record<string, () => string[]> = {
      R: () => rItems,
      C: () => [
        '- [ ] C:auto :: (audit_index) :: findings/_auto-consistency.md',
        `- [ ] C:terms :: ${noteFormat('termsTarget')} :: findings/C-terms.md`,
        ...xrefs,
      ],
      F: () => ['- [ ] F:report :: (compile_report) :: _report.md'],
    }
    const defaultPhaseTitles: Record<string, string> = {
      R: text.unitReviewTitle(),
      C: text.consistencyTitle(),
      F: text.compilationTitle(),
    }
    const phaseOrder = (
      checklistPhaseDefinitions?.length
        ? checklistPhaseDefinitions
        : checklistPhases.map((id) => ({ id, title: undefined }))
    ).filter((phase) => phase.id in phaseBuilders)
    // Legacy Runtime API contract (pre-A2): R and F were rendered
    // unconditionally regardless of what checklistPhases contained - only
    // C's presence was conditional. Preserve that for direct callers that
    // pass a checklistPhases/checklistPhaseDefinitions list without R and/or
    // F (the Coordinator always includes both, so this only matters for
    // callers that bypass it).
    if (!phaseOrder.some((phase) => phase.id === 'R'))
      phaseOrder.unshift({ id: 'R', title: undefined })
    if (!phaseOrder.some((phase) => phase.id === 'F'))
      phaseOrder.push({ id: 'F', title: undefined })
    const phaseItems = phaseOrder.map(({ id, title }) => ({
      id,
      title,
      items: phaseBuilders[id](),
    }))
    const phaseSections = phaseItems.flatMap(({ id, title, items }) => [
      '',
      `## Phase ${id} — ${title ?? defaultPhaseTitles[id] ?? id}`,
      ...items,
    ])

    const checklist = [
      '---',
      `verbex_index: "${docId}"`,
      `source: "${sourceFolder || sourcePath}"`,
      ...(await treatySourceSnapshotFields(
        sources,
        sourcePath,
        sourceFolder,
        wikiFolder,
      )),
      `profile: "${structure.profile}"`,
      `schema: "${findingSchema.replace(/"/g, '')}"`,
      ...(Array.isArray(findingSchemaColumns)
        ? [
            `schema_columns: '${JSON.stringify(findingSchemaColumns).replace(/'/g, "''")}'`,
          ]
        : []),
      `build_id: "${buildId}"`,
      `created: "${new Date().toISOString()}"`,
      '---',
      text.checklistTitle(docId),
      ...(xrefLimitWarning ? ['', xrefLimitWarning] : []),
      ...phaseSections,
      '',
      noteFormat('log'),
    ].join('\n')

    changes.push(
      await this.writer.proposedWrite(
        `${wikiFolder}/_checklist.md`,
        checklist,
        'build_review_index',
      ),
    )

    const checklistCount = phaseItems.reduce(
      (total, { items }) => total + items.length,
      0,
    )

    return {
      changes,
      buildId,
      docId,
      unitsCount: structure.units.length,
      termsCount: terms.length,
      checklistCount,
    }
  }

  async submitFinding(input: {
    wikiFolder: string
    itemId: string
    status: 'skipped' | 'done'
    note?: string
    issues?: number
    findingsMarkdown: string
  }): Promise<{
    changes: ProposedChange[]
    progress: { processed: number; total: number }
    issues: number
    canonicalItemId: string
    buildId: string
    indexFolder: string
    validationWarnings?: string[]
  }> {
    const { wikiFolder, status, note, issues = 0, findingsMarkdown } = input

    const checklist = await this.loadTreatyChecklist(wikiFolder)
    const item = resolveChecklistItem(checklist.markdown, input.itemId)
    if (!item) {
      throw new Error(
        text.missingItem(
          input.itemId,
          checklist.items
            .filter((value) => value.state === 'pending')
            .slice(0, 3)
            .map((value) => value.id)
            .join(', '),
        ),
      )
    }
    const itemId = item.id

    if (item.state !== 'pending') {
      return {
        changes: [],
        progress: checklistPhaseProgress(checklist.items, itemId[0]),
        issues: 0,
        canonicalItemId: itemId,
        buildId: checklist.buildId,
        indexFolder: wikiFolder,
      }
    }

    if (status === 'skipped' && (!note || !note.trim())) {
      throw new FindingValidationError(
        [text.skipNeedsNote()],
        itemId,
        checklist.buildId,
        wikiFolder,
      )
    }

    if (status === 'done') {
      if (!findingsMarkdown.trim()) {
        throw new FindingValidationError(
          [text.doneNeedsFinding()],
          itemId,
          checklist.buildId,
          wikiFolder,
        )
      }
    }

    const validationWarnings =
      status === 'done'
        ? validateFindingBody(
            findingsMarkdown,
            issues,
            findingNoteSchema(checklist.markdown, findingsMarkdown),
          )
        : []

    const toggled = toggleChecklistItem(
      checklist.markdown,
      itemId,
      status,
      status === 'skipped' ? String(note) : `issues=${issues}`,
    )
    if (!toggled.markdown)
      throw new Error(toggled.error ?? text.checklistUpdateFailed())

    const changes: ProposedChange[] = []
    if (status === 'done') {
      if (!item.artifact) throw new Error(text.missingArtifact())
      const artifactPath = this.treatyPath(wikiFolder, item.artifact)
      if (!artifactPath) throw new Error(text.unsafeArtifact())

      let unitHash = (await sha256Hex(item.target)).slice(0, 8)
      if (item.target.startsWith('units/')) {
        const targetPath = this.treatyPath(wikiFolder, item.target)
        if (!targetPath) throw new Error(text.unsafeTarget(item.target))
        if (!(await this.vault.exists(targetPath)))
          throw new Error(text.missingUnit(targetPath))
        const unit = await this.vault.read(targetPath)
        unitHash =
          frontmatterValue(unit, 'unit_hash') ??
          (
            await sha256Hex(unit.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, ''))
          ).slice(0, 8)
      }
      changes.push(
        await this.writer.proposedWrite(
          artifactPath,
          renderFindingNote({
            docId: checklist.docId,
            unitOrderKey: itemId.replace(/^[RCF]:/, ''),
            buildId: checklist.buildId,
            unitHash,
            issues,
            body: findingsMarkdown,
          }),
          'submit_wiki_finding',
        ),
      )
    }

    changes.push(
      await this.writer.proposedWrite(
        checklist.path,
        toggled.markdown,
        'submit_wiki_finding',
      ),
    )

    const nextChecklist = parseChecklist(toggled.markdown)
    const progress = checklistPhaseProgress(nextChecklist, itemId[0])

    return {
      changes,
      progress,
      issues,
      canonicalItemId: itemId,
      buildId: checklist.buildId,
      indexFolder: wikiFolder,
      ...(validationWarnings.length > 0 ? { validationWarnings } : {}),
    }
  }

  async auditIndex(input: {
    wikiFolder: string
    outputPath: string
    runVerifyWikiLinks: (
      folder: string,
    ) => Promise<{ kind: string; text: string; message?: string }>
  }): Promise<{
    changes: ProposedChange[]
  }> {
    const { wikiFolder, outputPath, runVerifyWikiLinks } = input

    const audit = await runVerifyWikiLinks(wikiFolder)
    if (audit.kind !== 'read') {
      throw new Error(
        audit.kind === 'error' ? audit.message : text.auditFailed(),
      )
    }

    const checklist = await this.loadTreatyChecklist(wikiFolder)
    const item = checklist.items.find((value) => value.id === 'C:auto')
    const auditFinding = renderFindingNote({
      docId: checklist.docId,
      unitOrderKey: 'auto',
      buildId: checklist.buildId,
      unitHash: (await sha256Hex(audit.text)).slice(0, 8),
      issues: 0,
      body: audit.text,
    })

    const changes = [
      await this.writer.proposedWrite(
        outputPath,
        auditFinding,
        'verify_wiki_links',
      ),
    ]

    if (item?.state === 'pending') {
      const toggled = toggleChecklistItem(
        checklist.markdown,
        'C:auto',
        'done',
        'deterministic audit',
      )
      if (!toggled.markdown)
        throw new Error(toggled.error ?? text.autoUpdateFailed())
      changes.push(
        await this.writer.proposedWrite(
          checklist.path,
          toggled.markdown,
          'verify_wiki_links',
        ),
      )
    }

    return { changes }
  }

  async compileReport(input: {
    wikiFolder: string
    outputPath: string
    summary?: string
  }): Promise<{
    changes: ProposedChange[]
    mismatches: string[]
  }> {
    const { wikiFolder, outputPath, summary = '' } = input

    const checklist = await this.loadTreatyChecklist(wikiFolder)
    for (const phase of checklistPhaseIds(
      checklist.markdown,
      checklist.items,
    )) {
      const progress = checklistPhaseProgress(checklist.items, phase)
      if (!progress.total) throw emptyChecklistPhaseError(phase)
      if (!progress.complete) {
        throw new Error(
          text.incompletePhase(
            phase,
            progress.processed,
            progress.total,
            checklist.items
              .filter(
                (item) =>
                  item.id.startsWith(`${phase}:`) && item.state === 'pending',
              )
              .slice(0, 5)
              .map((item) => item.id)
              .join(', '),
          ),
        )
      }
    }

    const reportSummary = summary.trim().split('\n').slice(0, 15).join('\n')
    const sections: string[] = []
    const mismatches: string[] = []
    const sourceSnapshot = await checkTreatySourceSnapshot(
      this.vault,
      checklist.markdown,
      wikiFolder,
    )
    if (sourceSnapshot === 'changed') mismatches.push(text.sourceChanged())
    if (sourceSnapshot === 'unavailable')
      mismatches.push(text.sourceUnavailable())
    const checkSourceRange = createTreatySourceRangeChecker(
      this.vault,
      checklist.markdown,
    )
    const reportLocale = noteFormatLocale(
      (await this.vault.exists(outputPath))
        ? await this.vault.read(outputPath)
        : '',
    )
    const aggregation = findingAggregation(
      frontmatterValue(checklist.markdown, 'schema_columns'),
      reportLocale,
    )
    const severity = new Map<string, number>()
    const issueTypes = new Map<string, number>()

    const batchLedgerPath = this.treatyBatchLedgerPath(wikiFolder)
    const batchLedgerExists = await this.vault.exists(batchLedgerPath)
    const batchLedger = batchLedgerExists
      ? parseBatchLedger(await this.vault.read(batchLedgerPath))
      : null

    const ledgerAttentionEntries =
      batchLedger?.buildId === checklist.buildId
        ? batchLedger.entries.filter(
            (entry) => entry.status === 'needs_attention',
          )
        : []
    const ledgerStatusCounts =
      batchLedger?.buildId === checklist.buildId
        ? batchLedger.entries.reduce<Record<string, number>>((acc, entry) => {
            acc[entry.status] = (acc[entry.status] ?? 0) + 1
            return acc
          }, {})
        : {}
    const checklistLogs = parseChecklistLogs(checklist.markdown)
    const attentionNotes = new Map<string, string>()
    for (const entry of ledgerAttentionEntries) {
      attentionNotes.set(entry.id, entry.note ?? text.validationFailed())
    }
    for (const [itemId, log] of checklistLogs) {
      if (
        log.status === 'needs_attention' ||
        log.note?.startsWith('needs_attention')
      ) {
        const note = log.note?.replace(/^needs_attention\s*:?\s*/, '')
        attentionNotes.set(
          itemId,
          note?.length ? note : text.validationFailed(),
        )
      }
    }

    for (const item of checklist.items.filter(
      (value) =>
        value.state === 'done' && value.artifact && value.id !== 'F:report',
    )) {
      const artifactPath = this.treatyPath(wikiFolder, item.artifact ?? '')
      if (!artifactPath || !(await this.vault.exists(artifactPath))) {
        mismatches.push(text.findingMissing(item.id))
        continue
      }

      const finding = await this.vault.read(artifactPath)
      if (frontmatterValue(finding, 'build_id') !== checklist.buildId) {
        mismatches.push(text.buildMismatch(item.id))
        continue
      }

      if (item.id.startsWith('R:')) {
        const targetPath = this.treatyPath(wikiFolder, item.target)
        const unitExists = targetPath
          ? await this.vault.exists(targetPath)
          : false
        const unit =
          unitExists && targetPath ? await this.vault.read(targetPath) : ''
        const expectedHash = frontmatterValue(unit, 'unit_hash')
        if (
          !unit ||
          !expectedHash ||
          frontmatterValue(finding, 'unit_hash') !== expectedHash
        ) {
          mismatches.push(text.hashMismatch(item.id))
          continue
        }
        const body = unit
          .replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '')
          .replace(/\r\n/g, '\n')
        if (
          !/^[0-9a-f]{8}$/i.test(expectedHash) ||
          !(await sha256Hex(body)).startsWith(expectedHash.toLowerCase())
        ) {
          mismatches.push(text.bodyHashMismatch(item.id))
          continue
        }
        const sourceRange = await checkSourceRange(unit, body)
        if (sourceRange === 'changed') {
          mismatches.push(text.rangeMismatch(item.id))
          continue
        }
        if (sourceRange === 'unavailable')
          mismatches.push(text.rangeUnavailable(item.id))
      }

      if (
        Number(frontmatterValue(finding, 'issues') ?? 0) !==
        countIssueTableRows(finding)
      ) {
        mismatches.push(text.issuesMismatch(item.id))
      }

      for (const line of finding
        .split('\n')
        .filter((value) => /^\s*\|\s*\d+\s*\|/.test(value))) {
        addFindingAggregationRow(line, aggregation, severity, issueTypes)
      }

      sections.push(
        `## ${item.id}\n\n${finding.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')}`,
      )
    }

    const skipped = checklist.items.filter(
      (item) => item.state === 'skipped' && !attentionNotes.has(item.id),
    )
    const report = [
      '---',
      `verbex_wiki: "${checklist.docId}"`,
      'kind: report',
      `build_id: "${checklist.buildId}"`,
      '---',
      text.reportTitle(checklist.docId, reportLocale),
      '',
      text.summaryHeading(reportLocale),
      reportSummary || text.noSummary(reportLocale),
      '',
      ...renderFindingAggregations(
        aggregation,
        severity,
        issueTypes,
        reportLocale,
      ),
      text.scopeHeading(reportLocale),
      text.scopeNotice(reportLocale),
      text.processedCount(
        checklist.items.filter((item) => item.state !== 'pending').length,
        reportLocale,
      ),
      `- batch done: ${ledgerStatusCounts.done ?? 0}`,
      `- batch input_empty: ${ledgerStatusCounts.input_empty ?? 0}`,
      `- batch output_empty: ${ledgerStatusCounts.output_empty ?? 0}`,
      `- batch truncated: ${ledgerStatusCounts.truncated ?? 0}`,
      `- batch stale_input: ${ledgerStatusCounts.stale_input ?? 0}`,
      `- batch apply_error: ${ledgerStatusCounts.apply_error ?? 0}`,
      `- batch protocol_error: ${ledgerStatusCounts.protocol_error ?? 0}`,
      `- skipped: ${skipped.length}`,
      `- needs_attention: ${attentionNotes.size}`,
      ...skipped.map((item) => {
        const log = checklistLogs.get(item.id)
        return `- ${item.id}: ${log?.note ?? item.target}`
      }),
      ...[...attentionNotes].map(([itemId, note]) => `- ${itemId}: ${note}`),
      '',
      text.mismatchesHeading(reportLocale),
      ...(mismatches.length
        ? mismatches.map((value) => `- ${value}`)
        : [text.noMismatches(reportLocale)]),
      '',
      ...sections,
    ].join('\n')

    const toggled = toggleChecklistItem(
      checklist.markdown,
      'F:report',
      'done',
      `compiled ${outputPath}`,
    )
    if (!toggled.markdown && !toggled.alreadyState) {
      throw new Error(toggled.error ?? text.reportUpdateFailed())
    }

    const changes = [
      await this.writer.proposedWrite(
        outputPath,
        report,
        'compile_wiki_report',
      ),
    ]
    if (toggled.markdown) {
      changes.push(
        await this.writer.proposedWrite(
          checklist.path,
          toggled.markdown,
          'compile_wiki_report',
        ),
      )
    }

    return { changes, mismatches }
  }
}
