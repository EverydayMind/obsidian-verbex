import { type ModelLocale, getModelLocale } from './modelLocale'

/** Stored note vocabulary. Both sides are read protocols; only new notes use the app locale. */
export const NOTE_FORMATS = {
  severity: { ko: '심각도', en: 'Severity' },
  type: { ko: '유형', en: 'Type' },
  quote: { ko: '핵심 인용', en: 'Key quote' },
  issue: { ko: '문제', en: 'Issue' },
  fix: { ko: '수정안', en: 'Proposed fix' },
  confidence: { ko: '신뢰도', en: 'Confidence' },
  legal: { ko: '법률검토', en: 'Legal review' },
  number: { ko: '번호', en: 'Number' },
  violation: { ko: '위반유형', en: 'Violation type' },
  clause: { ko: '조항', en: 'Clause' },
  revision: { ko: '개정안', en: 'Proposed revision' },
  priority: { ko: '우선순위', en: 'Priority' },
  high: { ko: '높음', en: 'High' },
  medium: { ko: '중간', en: 'Medium' },
  low: { ko: '낮음', en: 'Low' },
  evidence: { ko: '근거 ID', en: 'Evidence ID' },
  crossCheck: { ko: '교차확인필요', en: 'Cross-check needed' },
  reviewStatus: { ko: '## 검토 상태', en: '## Review status' },
  log: { ko: '## 로그', en: '## Log' },
  scope: { ko: '점검 범위:', en: 'Review scope:' },
  uncertain: { ko: '불확실 항목:', en: 'Uncertain items:' },
  none: { ko: '없음', en: 'None' },
  issueTotals: { ko: '## 이슈 집계', en: '## Issue totals' },
  typeTotals: { ko: '## 유형 집계', en: '## Type totals' },
  count: { ko: '건수', en: 'Count' },
  issueLabel: { ko: '이슈', en: 'Issue' },
  total: { ko: '전체', en: 'Total' },
  purpose: { ko: '목적', en: 'Purpose' },
  insufficient: {
    ko: '기존 도구로 부족한 이유',
    en: 'Why existing tools are insufficient',
  },
  inputs: { ko: '입력', en: 'Inputs' },
  outputs: { ko: '출력', en: 'Outputs' },
  example: { ko: '예시 상황', en: 'Example scenario' },
  status: { ko: '상태', en: 'Status' },
  pending: { ko: '미구현 (검토 대기)', en: 'Not implemented (pending review)' },
  requestTitle: {
    ko: '# Verbex 도구 개발 요청',
    en: '# Verbex tool development requests',
  },
  styleSummary: { ko: '## 서식 요약', en: '## Style summary' },
  guidance: { ko: '## 작성 지침', en: '## Writing guidance' },
  relatedNotes: { ko: '## 관련 노트', en: '## Related notes' },
  termsTarget: {
    ko: 'terms/ 정의어 사용 일관성',
    en: 'terms/ defined-term usage consistency',
  },
  templateSuffix: { ko: '_템플릿', en: '_template' },
  textSuffix: { ko: '_텍스트', en: '_text' },
  defaultTemplate: { ko: '템플릿.hwpx', en: 'template.hwpx' },
} as const

export type NoteFormatKey = keyof typeof NOTE_FORMATS
export function noteFormat(
  key: NoteFormatKey,
  locale = getModelLocale(),
): string {
  return NOTE_FORMATS[key][locale]
}
export function findingColumns(
  locale = getModelLocale(),
  rule = false,
): string[] {
  return rule
    ? ['number', 'violation', 'clause', 'issue', 'revision', 'priority'].map(
        (key) => noteFormat(key as NoteFormatKey, locale),
      )
    : [
        '#',
        ...[
          'severity',
          'type',
          'quote',
          'issue',
          'fix',
          'confidence',
          'legal',
        ].map((key) => noteFormat(key as NoteFormatKey, locale)),
      ]
}
export function noteFormatMatches(value: string, key: NoteFormatKey): boolean {
  const normalized = (text: string) => text.replace(/\s+/g, '').toLowerCase()
  return Object.values(NOTE_FORMATS[key]).some(
    (text) => normalized(text) === normalized(value),
  )
}

/** Inspect structural fields only, never the language of user/model prose. */
export function noteFormatLocale(
  note: string,
  fallback: ModelLocale = getModelLocale(),
): ModelLocale {
  for (const line of note.split(/\r?\n/)) {
    const text = line.trim()
    const cells = text.includes('|')
      ? text
          .slice(text.indexOf('|'))
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim().replace(/\s*\([^)]*\)\s*$/, ''))
      : []
    for (const locale of ['ko', 'en'] as const) {
      if (
        [
          'log',
          'reviewStatus',
          'issueTotals',
          'typeTotals',
          'styleSummary',
          'guidance',
          'relatedNotes',
          'requestTitle',
        ].some((key) => text === noteFormat(key as NoteFormatKey, locale))
      )
        return locale
      if (
        text.startsWith(noteFormat('scope', locale)) ||
        text.startsWith(`- **${noteFormat('purpose', locale)}**:`) ||
        (cells[0] === '#' && cells[1] === noteFormat('severity', locale)) ||
        (cells[0] === noteFormat('number', locale) &&
          cells[1] === noteFormat('violation', locale))
      )
        return locale
    }
  }
  return fallback
}

/** Translate only built-in column/enum vocabulary; custom schemas remain user-owned. */
export function noteVocabulary(value: string, locale: ModelLocale): string {
  const pair = Object.values(NOTE_FORMATS).find((item) =>
    Object.values(item).some((text) => text === value),
  )
  return pair?.[locale] ?? value
}

export function stripTemplateSuffix(path: string): string {
  return path.replace(
    new RegExp(
      `(?:${Object.values(NOTE_FORMATS.templateSuffix).join('|')})(?:-\\d+)?(?=\\.hwpx$)`,
      'i',
    ),
    '',
  )
}
