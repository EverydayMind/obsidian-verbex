import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function partialProjection(locale: ModelLocale = getModelLocale()) {
  return L(
    {
      ko: '[추출 단계에서 원문 일부만 투영됨]\n\n',
      en: '[Only part of the source was projected during extraction]\n\n',
    },
    locale,
  )
}

export function batchTruncation(locale: ModelLocale = getModelLocale()) {
  return L(
    {
      ko: '\n\n[이 파일은 배치 읽기 예산에 맞춰 잘렸습니다. 필요한 섹션은 부분 읽기 도구로 이어서 확인하세요.]',
      en: '\n\n[This file was truncated to fit the batch read budget. Continue with a partial read tool for the sections you need.]',
    },
    locale,
  )
}

export function unreadable(
  details: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `읽지 못한 문서: ${details}`,
      en: `Unreadable documents: ${details}`,
    },
    locale,
  )
}

export function missing(
  details: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `찾을 수 없음: ${details} — 경로가 틀렸거나 이동/삭제되었을 수 있습니다. 이 자료가 작업에 필요하면 search_vault 또는 iterative_search로 다시 찾아 올바른 경로로 읽고, 누락된 채로 "모두 검토했다"고 결론짓지 마세요.`,
      en: `Not found: ${details} — The path may be incorrect, moved, or deleted. If this source is needed for the task, find it again with search_vault or iterative_search and read the correct path; do not conclude that you have "reviewed everything" while it is missing.`,
    },
    locale,
  )
}

export function budgetOmitted(
  paths: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `예산으로 생략: ${paths} — 토큰 예산을 초과해 본문을 싣지 못했습니다. 필요하면 max_tokens를 늘려 다시 호출하거나, note_outline/read_note_section으로 필요한 조각만 이어서 읽으세요.`,
      en: `Omitted due to budget: ${paths} — The body could not be included within the token budget. If needed, call again with a larger max_tokens, or continue with only the required slices using note_outline/read_note_section.`,
    },
    locale,
  )
}

export function batchSummary(
  requested: string | number,
  included: string | number,
  usedTokens: string | number,
  maxTokens: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `배치 원문 읽기 — 요청 ${requested}개, 포함 ${included}개, 토큰 약 ${usedTokens}/${maxTokens}.`,
      en: `Batch source read — requested ${requested}, included ${included}, approximately ${usedTokens}/${maxTokens} tokens.`,
    },
    locale,
  )
}
