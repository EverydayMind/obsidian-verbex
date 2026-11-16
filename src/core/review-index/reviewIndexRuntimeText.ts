import { getModelLocale } from '../../i18n/modelLocale'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'

export function renderPreview(
  structure: { profile: string; units: { kind: string }[]; warnings: string[] },
  termsCount: number,
) {
  const counts = structure.units.reduce<Record<string, number>>((all, unit) => {
    all[unit.kind] = (all[unit.kind] ?? 0) + 1
    return all
  }, {})
  return [
    previewProfile(structure.profile),
    previewCounts(structure.units.length, termsCount),
    ...Object.entries(counts).map(([kind, count]) => `- ${kind}: ${count}`),
    ...structure.warnings.map((warning) => previewWarning(warning)),
    previewNext(),
  ].join('\n')
}

export function invalidChecklist() {
  return L({
    ko: `유효한 verbex_index/build_id 체크리스트가 아닙니다.`,
    en: `Invalid verbex_index/build_id checklist.`,
  })
}

export function duplicateChecklistIds(p0: string | number) {
  return L({
    ko: `체크리스트 중복 id 감지: ${p0}. build_review_index를 다시 실행해 체크리스트를 재생성하십시오.`,
    en: `Duplicate checklist ids detected: ${p0}. Run build_review_index again to regenerate the checklist.`,
  })
}

export function noSource() {
  return L({
    ko: `협정문 Markdown 원본을 찾지 못했습니다.`,
    en: `Treaty Markdown source not found.`,
  })
}

export function missingSource(p0: string | number) {
  return L({
    ko: `원본을 찾지 못했습니다: ${p0}`,
    en: `Source not found: ${p0}`,
  })
}

export function incompleteCoverage(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `${p0}: 원문 전량 포함 검증 실패 (${p1}줄 누락, 첫 누락 L${p2})`,
    en: `${p0}: full source coverage check failed (${p1} lines missing, first missing L${p2})`,
  })
}

export function previewProfile(p0: string | number) {
  return `${modelMarker('preview')} ${L({ ko: `프로파일 ${p0}`, en: `Profile ${p0}` })}`
}

export function previewCounts(p0: string | number, p1: string | number) {
  return L({
    ko: `units ${p0}개, terms ${p1}개`,
    en: `units ${p0}, terms ${p1}`,
  })
}

export function previewWarning(p0: string | number) {
  return L({ ko: `- 경고: ${p0}`, en: `- Warning: ${p0}` })
}

export function previewNext() {
  return L({
    ko: `파일 변경 없음. 구조가 타당하면 지금 preview 없이 build_review_index를 다시 호출해 실제 빌드를 실행하십시오. 구조가 어긋나면 그 사유를 사용자에게 보고하십시오.`,
    en: `No files changed. If the structure is valid, call build_review_index again now without preview to perform the actual build. If the structure is incorrect, report the reason to the user.`,
  })
}

export function definitionClause(p0: string | number) {
  return L({ ko: `정의 조항: [[${p0}]]`, en: `Defining clause: [[${p0}]]` })
}

export function xrefLimitWarning(p0: string | number, p1: string | number) {
  return L({
    ko: `> ⚠️ 교차참조 검토 대상 ${p0}건 중 우선순위 상위 ${p1}건만 체크리스트에 포함했습니다.`,
    en: `> ⚠️ Only the top ${p1} priority cross-reference review targets out of ${p0} were included in the checklist.`,
  })
}

export function unitReviewTitle() {
  return L({ ko: `조문 검토`, en: `Article review` })
}

export function consistencyTitle() {
  return L({ ko: `일관성 검토`, en: `Consistency review` })
}

export function compilationTitle() {
  return L({ ko: `취합`, en: `Compilation` })
}

export function checklistTitle(p0: string | number) {
  return L({ ko: `# 검토 체크리스트: ${p0}`, en: `# Review checklist: ${p0}` })
}

export function missingItem(p0: string | number, p1: string | number) {
  return L({
    ko: `항목 없음: ${p0}. pending: ${p1}`,
    en: `Item not found: ${p0}. pending: ${p1}`,
  })
}

export function skipNeedsNote() {
  return L({
    ko: `skipped에는 note가 필요합니다.`,
    en: `skipped requires note.`,
  })
}

export function doneNeedsFinding() {
  return L({
    ko: `done에는 findings_markdown이 필요합니다.`,
    en: `done requires findings_markdown.`,
  })
}

export function checklistUpdateFailed() {
  return L({ ko: `체크리스트 갱신 실패`, en: `Checklist update failed` })
}

export function missingArtifact() {
  return L({
    ko: `체크리스트 artifact 경로가 없습니다.`,
    en: `Checklist artifact path is missing.`,
  })
}

export function unsafeArtifact() {
  return L({
    ko: `artifact는 wiki_folder 하위여야 합니다.`,
    en: `artifact must be under wiki_folder.`,
  })
}

export function unsafeTarget(p0: string | number) {
  return L({
    ko: `target 경로가 wiki_folder 경로 규칙을 위반합니다: ${p0}`,
    en: `target path violates wiki_folder path rules: ${p0}`,
  })
}

export function missingUnit(p0: string | number) {
  return L({
    ko: `target unit 파일이 없습니다: ${p0}`,
    en: `target unit file not found: ${p0}`,
  })
}

export function auditFailed() {
  return L({ ko: `감사 실패`, en: `Audit failed` })
}

export function autoUpdateFailed() {
  return L({ ko: `C:auto 갱신 실패`, en: `C:auto update failed` })
}

export function incompletePhase(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  p3: string | number,
) {
  return L({
    ko: `Phase ${p0} 미완료: ${p1}/${p2}. 남은 항목: ${p3}`,
    en: `Phase ${p0} incomplete: ${p1}/${p2}. Remaining items: ${p3}`,
  })
}

export function sourceChanged() {
  return L({
    ko: `원본 파일 집합 또는 내용이 인덱스 생성 이후 변경됨`,
    en: `Source file set or content changed since the index was built`,
  })
}

export function sourceUnavailable() {
  return L({
    ko: `원본 전체 스냅샷을 확인할 수 없음`,
    en: `Full source snapshot could not be verified`,
  })
}

export function validationFailed() {
  return L({ ko: `검증 실패`, en: `Validation failed` })
}

export function findingMissing(p0: string | number) {
  return L({
    ko: `${p0}: findings 파일 없음`,
    en: `${p0}: findings file missing`,
  })
}

export function buildMismatch(p0: string | number) {
  return L({ ko: `${p0}: build_id 불일치`, en: `${p0}: build_id mismatch` })
}

export function hashMismatch(p0: string | number) {
  return L({ ko: `${p0}: unit_hash 불일치`, en: `${p0}: unit_hash mismatch` })
}

export function bodyHashMismatch(p0: string | number) {
  return L({
    ko: `${p0}: 조문 본문과 unit_hash 불일치`,
    en: `${p0}: article body and unit_hash mismatch`,
  })
}

export function rangeMismatch(p0: string | number) {
  return L({
    ko: `${p0}: 원본 조문 범위가 위키 조문과 불일치`,
    en: `${p0}: source article range does not match the wiki article`,
  })
}

export function rangeUnavailable(p0: string | number) {
  return L({
    ko: `${p0}: 원본 조문 범위를 확인할 수 없음`,
    en: `${p0}: source article range could not be verified`,
  })
}

export function issuesMismatch(p0: string | number) {
  return L({
    ko: `${p0}: issues 수 불일치`,
    en: `${p0}: issues count mismatch`,
  })
}

export function reportTitle(p0: string | number, locale = getModelLocale()) {
  return L({ ko: `# ${p0} 검토 보고서`, en: `# ${p0} Review report` }, locale)
}

export function summaryHeading(locale = getModelLocale()) {
  return L({ ko: `## 총평`, en: `## Overall assessment` }, locale)
}

export function noSummary(locale = getModelLocale()) {
  return L({ ko: `(총평 없음)`, en: `(No overall assessment)` }, locale)
}

export function scopeHeading(locale = getModelLocale()) {
  return L({ ko: `## 점검 범위`, en: `## Verification scope` }, locale)
}

export function scopeNotice(locale = getModelLocale()) {
  return L(
    {
      ko: `- 원본 대조는 완료 조문에 기록된 줄 범위에 한정됩니다. 새로 추가된 조항이나 그 밖의 미검토 범위는 확인하지 않습니다.`,
      en: `- Source comparison is limited to the line ranges recorded for completed articles. Newly added provisions and other unreviewed ranges are not checked.`,
    },
    locale,
  )
}

export function processedCount(p0: string | number, locale = getModelLocale()) {
  return L({ ko: `- 처리 항목: ${p0}`, en: `- Processed items: ${p0}` }, locale)
}

export function mismatchesHeading(locale = getModelLocale()) {
  return L({ ko: `## 검증 불일치`, en: `## Verification mismatches` }, locale)
}

export function noMismatches(locale = getModelLocale()) {
  return L({ ko: `- 없음`, en: `- None` }, locale)
}

export function reportUpdateFailed() {
  return L({ ko: `F:report 갱신 실패`, en: `F:report update failed` })
}
