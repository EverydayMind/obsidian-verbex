import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'

// Claude Code skill layout: a folder per skill containing SKILL.md, with a
// `description` that tells the selector when to use it. Skills authored for
// Claude Code can be copied into the Skills folder verbatim.
const REPORT_SKILL = `---
name: report-writing
description: Vault 자료를 바탕으로 정책 보고서 초안을 작성한다. 보고서·정책·브리프 작성 요청에 사용한다.
---

## 역할

당신은 Obsidian Vault의 자료를 근거로 정책 보고서 초안을 작성하는 문서 업무 에이전트다.

## 지침

- 먼저 근거 자료와 현재 노트를 확인한다.
- 출처가 불분명한 내용은 추정이라고 표시한다.
- 최종 산출물은 Markdown 보고서 형식으로 작성한다.
- 사용자가 Vault 상대 Markdown 저장 경로를 지정하면 그대로 사용한다. 지정하지 않았다면 write_file 호출 전에 원하는 경로를 질문하고 Outputs/ 아래에 제목 기반 파일명을 예시로 제안한다.
- 특정 보고서 파일명으로 임의 저장하지 않으며, 선택한 경로가 이미 존재하면 교체 전에 확인한다.
- 파일을 변경할 때는 반드시 Diff 승인 절차를 따른다.
`

const REPORT_WORKFLOW = `id: report
name: 정책 보고서 작성
description: 자료 수집, 핵심 메시지 추출, 초안 작성을 순서대로 수행한다.
steps:
  - id: collect
    title: 자료 수집
    description: 현재 요청과 관련된 Vault 문서, 요약 위키, 링크 문맥을 수집한다.
    tool: search_vault
  - id: extract
    title: 핵심 메시지 추출
    description: 수집된 자료에서 쟁점, 근거, 출처를 정리한다.
    depends_on:
      - collect
    prompt_template: collect.md
  - id: choose_output
    title: 저장 파일 선택
    description: 사용자가 지정한 Vault 상대 Markdown 경로를 사용한다. 경로가 없으면 쓰기 전에 질문하고 Outputs/ 아래 제목 기반 경로를 예시로 제안한다. 고정 파일명으로 임의 저장하지 않으며 기존 파일 교체는 먼저 확인한다.
    tool: llm
    depends_on:
      - extract
  - id: draft
    title: 보고서 초안 작성
    description: 보고서 전문을 사용자가 선택한 경로로 write_file 호출하여 Diff 검토를 연다.
    tool: write_file
    depends_on:
      - choose_output
    prompt_template: draft.md
    requires_approval: true
`

const COLLECT_PROMPT = `사용자 요청:
{{user_request}}

검색 결과:
{{search_results}}

위 자료에서 보고서에 필요한 핵심 근거, 쟁점, 누락된 정보를 Markdown으로 정리하세요.
`

const DRAFT_PROMPT = `사용자 요청:
{{user_request}}

이전 단계 산출물:
{{prev_step_output}}

보고서 초안을 Markdown으로 작성하세요. 출처가 필요한 문장은 Vault 경로를 함께 표시하세요.

사용자가 명시적으로 선택한 Vault 상대 .md 경로에만 write_file을 호출하세요. 저장 경로가 아직 없으면 파일을 쓰지 말고 원하는 경로를 질문하며 Outputs/ 아래 제목 기반 경로를 예시로 제안하세요. 특정 파일명으로 임의 저장하지 말고, 선택한 경로가 이미 존재하면 교체 전에 확인하세요. 경로가 확정되면 보고서 전문과 정확한 경로로 write_file을 호출하세요.
`

/** Seed content is selected only when creating a new workspace. */
export function seedReportWorkspace(locale: ModelLocale = getModelLocale()) {
  if (locale === 'ko') {
    return {
      skill: REPORT_SKILL,
      workflow: REPORT_WORKFLOW,
      collect: COLLECT_PROMPT,
      draft: DRAFT_PROMPT,
    }
  }
  return {
    skill: `---
name: report-writing
description: Write evidence-based reports, policy briefs, and business briefings from Vault sources. Use for requests to draft a report, brief, or recommendation.
---

## Role

You help the user turn Vault research into a clear, decision-ready report.

## Guidelines

- Review the current note and relevant source material before drafting.
- Lead with the conclusion or recommendation, then explain the evidence and implications.
- Use descriptive headings and concise paragraphs. Use lists when they make information easier to scan.
- Cite Vault paths for factual claims and figures. Include dates, units, and source context for numbers.
- Distinguish sourced facts from assumptions, and flag gaps or uncertainty.
- Deliver the report in Markdown.
- Use the Vault-relative Markdown path the user explicitly selects. If no path is selected, ask before calling write_file and suggest a title-based filename under Outputs/.
- Do not choose a fixed report filename on the user's behalf. If the selected file already exists, confirm before replacing it.
- Follow the Diff review and approval process for every file change.
`,
    workflow: `id: report
name: Report writing
description: Gather sources, identify the key findings, and draft an evidence-based report.
steps:
  - id: collect
    title: Gather sources
    description: Find relevant Vault notes, summary wikis, and linked context for the current request.
    tool: search_vault
  - id: extract
    title: Identify key findings
    description: Organize the issues, supporting evidence, figures, and source paths from the collected material.
    depends_on:
      - collect
    prompt_template: collect.md
  - id: choose_output
    title: Choose the output file
    description: Use the Vault-relative Markdown path selected by the user. If none is selected, ask before writing and suggest a title-based path under Outputs/. Do not choose a fixed filename; confirm before replacing an existing file.
    tool: llm
    depends_on:
      - extract
  - id: draft
    title: Draft the report
    description: Lead with the conclusion, support claims with source paths, and call write_file with the full report at the user's selected path to open Diff review.
    tool: write_file
    depends_on:
      - choose_output
    prompt_template: draft.md
    requires_approval: true
`,
    collect: `User request:
{{user_request}}

Search results:
{{search_results}}

Organize the material needed for the report in Markdown. Identify the main findings, supporting evidence, competing interpretations, and missing information. Include Vault source paths for claims and figures, retaining dates, units, and relevant context. Separate facts from assumptions and flag uncertainty.
`,
    draft: `User request:
{{user_request}}

Previous step output:
{{prev_step_output}}

Write a Markdown report for a professional audience. Lead with the conclusion or recommendation, then explain the evidence and implications. Use descriptive headings and concise paragraphs. Cite Vault paths for factual claims and figures, including dates and units where relevant. Clearly identify assumptions, uncertainty, and missing evidence.

Call write_file only for a Vault-relative .md path explicitly selected by the user. If no path has been selected, ask for one before writing and suggest a title-based path under Outputs/. Do not choose a fixed filename on the user's behalf. Confirm before replacing an existing file. Once the path is settled, call write_file with the full report and the exact path for Diff review and approval.
`,
  }
}
