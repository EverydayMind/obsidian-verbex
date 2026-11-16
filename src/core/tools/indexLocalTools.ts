import { normalizePath } from 'obsidian'

import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import { estimateTokens } from '../../utils/llm/estimateTokens'

import { findingNoteSchema } from './findingNoteSchema'
import { findingSchemaTemplate } from './findingSchemas'
import {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
  resolveFile,
  str,
} from './localToolCommon'
import { discoverIndexFolder } from './reviewIndexDiscovery'
import { frontmatterValue } from './reviewIndexMetadata'
import {
  checklistPhaseProgress,
  duplicateChecklistIds,
  formatDuplicateChecklistIds,
  parseChecklist,
  resolveTreatyPath,
} from './treatyWiki'

export async function executeIndexTool(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const readContent = async (path: string): Promise<string | null> => {
    const file = resolveFile(path, ctx, ['md'])
    if (!file) return null
    return ctx.app.vault.cachedRead(file)
  }

  const discoverTreatyWiki = async (): Promise<
    { folder: string } | { candidates: string[] } | null
  > => {
    return discoverIndexFolder(ctx.app)
  }

  switch (tool) {
    case 'checklist_next': {
      let folder =
        (str(args, 'index_folder') ?? str(args, 'wiki_folder'))?.replace(
          /\/$/,
          '',
        ) ?? ''
      let auto = false
      if (!folder) {
        const discovered = await discoverTreatyWiki()
        if (!discovered)
          return {
            kind: 'read',
            text: L({
              ko: '[체크리스트 없음] 진행 중인 협정문 Wiki가 없습니다. build_review_index를 먼저 호출하십시오.',
              en: '[No checklist] There is no treaty Wiki in progress. Call build_review_index first.',
            }),
          }
        if ('candidates' in discovered)
          return {
            kind: 'read',
            text: L({
              ko: `[선택 필요] 진행 중인 Wiki가 여러 개입니다:\n${discovered.candidates.map((value) => `- ${value}`).join('\n')}`,
              en: `[Selection required] Multiple Wikis are in progress:\n${discovered.candidates.map((value) => `- ${value}`).join('\n')}`,
            }),
          }
        folder = discovered.folder
        auto = true
      }
      const checklistPath = normalizePath(`${folder}/_checklist.md`)
      const markdown = await readContent(checklistPath)
      if (markdown === null)
        return { kind: 'error', message: `File not found: ${checklistPath}` }
      const items = parseChecklist(markdown)
      const duplicates = duplicateChecklistIds(items)
      if (duplicates.length > 0) {
        return {
          kind: 'error',
          message: L({
            ko: `체크리스트 중복 id 감지: ${formatDuplicateChecklistIds(duplicates)}. build_review_index를 다시 실행해 체크리스트를 재생성하십시오.`,
            en: `Duplicate checklist ids detected: ${duplicates.map((entry) => `${entry.id} (${entry.lines.length} occurrences: L${entry.lines.join(', L')})`).join(', ')}. Run build_review_index again to regenerate the checklist.`,
          }),
        }
      }
      const requested = str(args, 'item_id')
      const item = requested
        ? (items.find((candidate) => candidate.id === requested) ??
          items.find(
            (candidate) => candidate.id.split(':', 2)[1] === requested,
          ))
        : items.find((candidate) => candidate.state === 'pending')

      if (requested && !item) {
        return {
          kind: 'error',
          message: L({
            ko: `체크리스트에서 항목을 찾을 수 없습니다: ${requested}`,
            en: `Checklist item not found: ${requested}`,
          }),
        }
      }

      const phases = [
        ...new Set(items.map((entry) => entry.id.split(':', 1)[0])),
      ]
      const progress = phases
        .map((phase) => {
          const value = checklistPhaseProgress(items, phase)
          return `Phase ${phase} ${value.processed}/${value.total}`
        })
        .join(' | ')

      let prefixMsg = ''
      let selectedItem = item
      if (requested && item && item.state !== 'pending') {
        const nextPending = items.find(
          (candidate) => candidate.state === 'pending',
        )
        if (!nextPending) {
          return {
            kind: 'read',
            text: L({
              ko: `[이미 처리됨] ${item.id}: ${item.state}. [완료] ${progress}. 처리할 pending 항목이 없습니다.`,
              en: `[Already processed] ${item.id}: ${item.state}. [Complete] ${progress}. There are no pending items to process.`,
            }),
          }
        }
        prefixMsg = L({
          ko: `[이미 처리됨] ${item.id}: ${item.state}. 다음 pending 항목으로 이동합니다.\n`,
          en: `[Already processed] ${item.id}: ${item.state}. Moving to the next pending item.\n`,
        })
        selectedItem = nextPending
      }

      if (!selectedItem) {
        return {
          kind: 'read',
          text: L({
            ko: `[완료] ${progress}. 처리할 pending 항목이 없습니다.`,
            en: `[Complete] ${progress}. There are no pending items to process.`,
          }),
        }
      }
      if (selectedItem.state !== 'pending') {
        return {
          kind: 'read',
          text: L({
            ko: `[이미 처리됨] ${selectedItem.id}: ${selectedItem.state}. checklist_next로 다음 항목을 받으십시오.`,
            en: `[Already processed] ${selectedItem.id}: ${selectedItem.state}. Call checklist_next to get the next item.`,
          }),
        }
      }
      const header = [
        L({
          ko: `[체크리스트] ${progress}${auto ? ` | 자동 발견: ${folder}` : ''}`,
          en: `[Checklist] ${progress}${auto ? ` | Auto-discovered: ${folder}` : ''}`,
        }),
        `${modelMarker('currentItem')} ${selectedItem.id}`,
        L({
          ko: `[검토 대상] ${selectedItem.target}`,
          en: `[Review target] ${selectedItem.target}`,
        }),
        L({
          ko: `[결과 기록 경로] ${selectedItem.artifact ?? '(없음)'}`,
          en: `[Result path] ${selectedItem.artifact ?? '(none)'}`,
        }),
      ]
      if (selectedItem.target.startsWith('units/')) {
        const unitPath = normalizePath(`${folder}/${selectedItem.target}`)
        const unit = await readContent(unitPath)
        if (unit === null)
          return { kind: 'error', message: `File not found: ${unitPath}` }
        const body = unit.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
        const bounded =
          estimateTokens(body) > 5000 ? body.slice(0, 18_000) : body
        header.push(
          '',
          L({
            ko: '----- 대상 본문 (원문, 수정 금지) -----',
            en: '----- Target body (original, do not modify) -----',
          }),
          bounded,
          L({ ko: '----- 본문 끝 -----', en: '----- End of body -----' }),
          '',
          L({
            ko: `이 항목 하나만 처리하고 submit_finding(item_id="${selectedItem.id}")을 1회 호출하십시오.`,
            en: `Process only this item and call submit_finding(item_id="${selectedItem.id}") once.`,
          }),
        )
      } else if (selectedItem.target.startsWith('terms/')) {
        const prefix = folder ? `${normalizePath(folder)}/` : ''
        const termFiles = ctx.app.vault
          .getMarkdownFiles()
          .filter((file) => file.path.startsWith(`${prefix}terms/`))

        const termDetails: {
          path: string
          basename: string
          hasVariants: boolean
        }[] = []
        for (const file of termFiles) {
          const content = await readContent(file.path)
          let hasVariants = false
          if (content !== null) {
            const frontmatterMatch = /^---\s*\n([\s\S]*?)\n---/.exec(content)
            if (frontmatterMatch) {
              const frontmatter = frontmatterMatch[1]
              const variantsMatch = /case_variants:\s*\n((?:\s+-.*\n?)*)/m.exec(
                frontmatter,
              )
              if (variantsMatch) {
                const parsed = variantsMatch[1]
                  .split('\n')
                  .map((line) =>
                    line
                      .replace(/^\s*-\s*/, '')
                      .replace(/^['"]|['"]$/g, '')
                      .trim(),
                  )
                  .filter(Boolean)
                if (parsed.length > 0) {
                  hasVariants = true
                }
              }
            }
          }
          termDetails.push({
            path: file.path,
            basename: file.basename,
            hasVariants,
          })
        }

        termDetails.sort((a, b) => {
          if (a.hasVariants && !b.hasVariants) return -1
          if (!a.hasVariants && b.hasVariants) return 1
          return a.basename.localeCompare(b.basename)
        })

        const sliced = termDetails.slice(0, 50)
        const links = sliced.map(
          (t) => `- [[${t.path.replace(/\.md$/, '')}|${t.basename}]]`,
        )
        header.push(
          '',
          L({
            ko: `지시: ${selectedItem.target}`,
            en: `Instruction: ${selectedItem.target}`,
          }),
          L({ ko: '검토 대상 정의어 목록:', en: 'Defined terms to review:' }),
          ...links,
          '',
          L({
            ko: `위 정의어 노트를 read_files로 읽고 일관성을 검토한 뒤 submit_finding(item_id="${selectedItem.id}")을 호출하십시오.`,
            en: `Read the defined-term notes above with read_files, review their consistency, then call submit_finding(item_id="${selectedItem.id}").`,
          }),
        )
      } else {
        header.push(
          '',
          L({
            ko: `지시: ${selectedItem.target}`,
            en: `Instruction: ${selectedItem.target}`,
          }),
        )
      }

      const artifactPath = selectedItem.artifact
        ? resolveTreatyPath(folder, selectedItem.artifact)
        : null
      const schema = findingNoteSchema(
        markdown,
        artifactPath ? ((await readContent(artifactPath)) ?? '') : '',
      )
      const [schemaHeader, schemaSeparator, schemaExample] =
        findingSchemaTemplate(schema)
      const enumGuides = schema.columns
        .filter((column) => column.enum)
        .map((column) =>
          L({
            ko: `- 허용 ${column.name}: ${(column.enum ?? []).join(', ')}`,
            en: `- Allowed ${column.name}: ${(column.enum ?? []).join(', ')}`,
          }),
        )
      header.push(
        '',
        L({
          ko: '※ submit_finding 작성 안내 및 표 템플릿:',
          en: '※ submit_finding instructions and table template:',
        }),
        L({
          ko: `status가 "done"일 때 findings_markdown은 ${schema.id} 스키마의 마크다운 표 형식을 사용하십시오.`,
          en: `When status is "done", findings_markdown must use the Markdown table format of the ${schema.id} schema.`,
        }),
        schemaHeader,
        schemaSeparator,
        schemaExample,
        ...enumGuides,
        L({
          ko: '- 데이터 행 개수는 도구 인자로 넘길 "issues" 값과 일치시켜 주십시오.',
          en: '- The number of data rows must match the "issues" tool argument.',
        }),
        L({
          ko: '- 경미한 제안이나 권고 사항(Suggestion)이라 하더라도 마크다운 표의 데이터 행으로 포함되었다면, 그 개수만큼 "issues" 값에 합산하여 지정해야 합니다. 표 행이 1개 존재하면 issues는 1이어야 하며, 0이 될 수 없습니다.',
          en: '- Even minor suggestions or recommendations (Suggestion) included as Markdown table data rows must be counted in "issues". If there is one data row, issues must be 1 and cannot be 0.',
        }),
      )

      return { kind: 'read', text: `${prefixMsg}${header.join('\n')}` }
    }

    case 'verify_wiki_links':
    case 'audit_index': {
      const folder = (
        str(args, 'index_folder') ?? str(args, 'wiki_folder')
      )?.replace(/\/$/, '')
      if (!folder)
        return {
          kind: 'error',
          message: 'audit_index requires "index_folder".',
        }
      const prefix = `${normalizePath(folder)}/`
      const files = ctx.app.vault
        .getMarkdownFiles()
        .filter((file) => file.path.startsWith(prefix))
      const units = files.filter((file) =>
        file.path.startsWith(`${prefix}units/`),
      )
      const terms = files.filter((file) =>
        file.path.startsWith(`${prefix}terms/`),
      )
      const checklist = await readContent(`${folder}/_checklist.md`)
      if (checklist === null)
        return {
          kind: 'error',
          message: `File not found: ${folder}/_checklist.md`,
        }
      const unresolved: string[] = []
      const external: string[] = []
      for (const file of units) {
        const markdown = await ctx.app.vault.cachedRead(file)
        const block = /^---\s*\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? ''
        const unresolvedBlock =
          /refs_unresolved:\s*\n((?:\s+-.*\n?)*)/m.exec(block)?.[1] ?? ''
        unresolvedBlock
          .split('\n')
          .map((line) => line.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean)
          .forEach((value) => unresolved.push(`${file.path}: ${value}`))
        const externalBlock =
          /refs_external:\s*\n((?:\s+-.*\n?)*)/m.exec(block)?.[1] ?? ''
        externalBlock
          .split('\n')
          .map((line) => line.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean)
          .forEach((value) => external.push(`${file.path}: ${value}`))
      }
      const unitTargets = new Set(
        units.map((file) => file.path.slice(prefix.length)),
      )
      const checklistTargets = new Set(
        parseChecklist(checklist)
          .filter((item) => item.id.startsWith('R:'))
          .map((item) => item.target),
      )
      const orphanUnits = [...unitTargets].filter(
        (value) => !checklistTargets.has(value),
      )
      const missingUnits = [...checklistTargets].filter(
        (value) => !unitTargets.has(value),
      )
      const termVariants: string[] = []
      const unusedTerms: string[] = []
      for (const file of terms) {
        const markdown = await ctx.app.vault.cachedRead(file)
        const term = frontmatterValue(markdown, 'term') ?? file.basename
        const variants =
          /case_variants:\s*\n((?:\s+-.*\n?)*)/m.exec(markdown)?.[1] ?? ''
        variants
          .split('\n')
          .map((line) =>
            line
              .replace(/^\s*-\s*/, '')
              .replace(/^['"]|['"]$/g, '')
              .trim(),
          )
          .filter(Boolean)
          .forEach((value) => termVariants.push(`${term}: ${value}`))
        if (/used_in:\s*\[\s*\]/m.test(markdown)) unusedTerms.push(term)
      }
      const report = [
        L({
          ko: '# Wiki 자동 일관성 감사',
          en: '# Automated Wiki consistency audit',
        }),
        '',
        L({
          ko: `- 내부 미해석 참조: ${unresolved.length}`,
          en: `- Unresolved internal references: ${unresolved.length}`,
        }),
        L({
          ko: `- 외부 협정 인용(정보성, 결함 제외): ${external.length}`,
          en: `- External treaty citations (informational, excluded from defects): ${external.length}`,
        }),
        L({
          ko: `- 체크리스트 없는 unit: ${orphanUnits.length}`,
          en: `- Units without checklist entries: ${orphanUnits.length}`,
        }),
        L({
          ko: `- 대상 unit 없는 체크리스트 항목: ${missingUnits.length}`,
          en: `- Checklist entries without target units: ${missingUnits.length}`,
        }),
        L({
          ko: `- 정의어 대소문자/표기 변형: ${termVariants.length}`,
          en: `- Defined-term case/spelling variants: ${termVariants.length}`,
        }),
        L({
          ko: `- 정의 후 미사용 용어: ${unusedTerms.length}`,
          en: `- Defined but unused terms: ${unusedTerms.length}`,
        }),
        '',
        L({
          ko: '## 내부 미해석 참조',
          en: '## Unresolved internal references',
        }),
        ...(unresolved.length
          ? unresolved.map((value) => `- ${value}`)
          : [L({ ko: '- 없음', en: '- None' })]),
        '',
        L({ ko: '## 외부 협정 인용', en: '## External treaty citations' }),
        ...(external.length
          ? external.map((value) => `- ${value}`)
          : [L({ ko: '- 없음', en: '- None' })]),
        '',
        L({ ko: '## 정의어 표기 감사', en: '## Defined-term spelling audit' }),
        ...(termVariants.length
          ? termVariants.map((value) =>
              L({ ko: `- 변형: ${value}`, en: `- Variant: ${value}` }),
            )
          : [L({ ko: '- 표기 변형 없음', en: '- No spelling variants' })]),
        ...(unusedTerms.length
          ? unusedTerms.map((value) =>
              L({
                ko: `- 정의 후 미사용: ${value}`,
                en: `- Defined but unused: ${value}`,
              }),
            )
          : [
              L({
                ko: '- 미사용 정의어 없음',
                en: '- No unused defined terms',
              }),
            ]),
        '',
        L({ ko: '## 커버리지 불일치', en: '## Coverage mismatches' }),
        ...orphanUnits.map((value) =>
          L({ ko: `- 고아 unit: ${value}`, en: `- Orphan unit: ${value}` }),
        ),
        ...missingUnits.map((value) =>
          L({ ko: `- 누락 unit: ${value}`, en: `- Missing unit: ${value}` }),
        ),
        ...(orphanUnits.length + missingUnits.length === 0
          ? [L({ ko: '- 없음', en: '- None' })]
          : []),
      ].join('\n')
      return { kind: 'read', text: report }
    }

    default:
      return { kind: 'error', message: `Unknown index tool: ${tool}` }
  }
}
