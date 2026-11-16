import type { ModelLocale } from '../../i18n/modelLocale'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'

export function reviewCoordinatorText(locale?: ModelLocale) {
  return L(
    {
      ko: {
        quarantined: '검증 실패로 격리됨',
        reuse: '사용자가 기존 wiki 재사용을 선택했습니다. 빌드를 건너뜁니다.',
        sourceRequired:
          '(오류: source_path와 source_folder 중 정확히 하나만 지정하십시오. 둘 다 없거나 동시에 지정할 수 없습니다.)',
        cancelled:
          '(안내: 사용자가 검토 인덱스 대상 폴더 확인을 취소했습니다. 파일은 변경하지 않았습니다. 같은 빌드를 다시 시도하지 말고 진행 방식을 확인하십시오.)',
        folderRequired:
          '(오류: 검토 인덱스를 저장할 index_folder가 필요합니다.)',
        rebuild: 'rebuild: true로 전체를 결정적으로 재생성할 수 있습니다.',
        invalidChecklist: '유효한 verbex_index/build_id 체크리스트가 아닙니다.',
        noIndex: '(오류: 진행 중인 review index를 찾을 수 없습니다.)',
        unexpectedChange:
          '(오류: checklist_next가 예상하지 않은 변경 결과를 반환했습니다.)',
        submitRequired: 'index_folder, item_id, status가 필요합니다.',
        processed:
          '이미 처리된 항목입니다. checklist_next로 다음 항목을 받으십시오.',
        outputPath: 'output_path는 index_folder 하위여야 합니다.',
        indexFolder: 'index_folder가 필요합니다.',
      },
      en: {
        quarantined: 'Quarantined due to validation failure',
        reuse:
          'The user selected reuse of the existing wiki. Skipping the build.',
        sourceRequired:
          '(Error: Specify exactly one of source_path and source_folder. Neither both nor neither is allowed.)',
        cancelled:
          '(Notice: The user cancelled review index target folder confirmation. No files were changed. Do not retry the same build; confirm how to proceed.)',
        folderRequired:
          '(Error: index_folder is required to store the review index.)',
        rebuild:
          'You can deterministically regenerate everything with rebuild: true.',
        invalidChecklist:
          'This is not a valid verbex_index/build_id checklist.',
        noIndex: '(Error: No review index in progress was found.)',
        unexpectedChange:
          '(Error: checklist_next returned an unexpected change result.)',
        submitRequired: 'index_folder, item_id, and status are required.',
        processed:
          'This item has already been processed. Use checklist_next to get the next item.',
        outputPath: 'output_path must be within index_folder.',
        indexFolder: 'index_folder is required.',
      },
    },
    locale,
  )
}

export function proposalFailed(path: string) {
  return L({
    ko: `변경안 생성 실패: ${path}`,
    en: `Failed to create a change proposal: ${path}`,
  })
}
export function missingChecklist(path: string) {
  return L({ ko: `체크리스트 없음: ${path}`, en: `Checklist missing: ${path}` })
}
export function duplicateIds(ids: string, rebuild = false) {
  return L({
    ko: `체크리스트 중복 id 감지: ${ids}${rebuild ? '. build_review_index를 다시 실행해 체크리스트를 재생성하십시오.' : ''}`,
    en: `Duplicate checklist IDs detected: ${ids}${rebuild ? '. Run build_review_index again to regenerate the checklist.' : ''}`,
  })
}
export function allQuarantined(count: number, total: number) {
  return L({
    ko: `Phase R 전 항목 격리 — 시스템적 실패 의심 (${count}/${total}). 원인 조치 후 재실행하거나 명시적 override가 필요합니다.`,
    en: `All Phase R items quarantined — suspected systemic failure (${count}/${total}). Resolve the cause and rerun, or provide an explicit override.`,
  })
}
export function phaseAttention(count: number, total: number) {
  return L({
    ko: `Phase R은 확인 필요 ${count}/${total}건을 격리한 상태로 완료되었습니다.`,
    en: `Phase R completed with ${count}/${total} items requiring attention quarantined.`,
  })
}
export function missingPhase(phase: string) {
  return L({
    ko: `Phase ${phase} 항목이 없거나 체크리스트 형식이 잘못되었습니다.`,
    en: `Phase ${phase} has no items, or the checklist format is invalid.`,
  })
}
export function reuseFailure(
  path: string,
  reason: 'missing' | 'empty' | 'provenance',
) {
  return L({
    ko:
      reason === 'missing'
        ? `(오류: ${path}이(가) 없어 기존 wiki를 재사용할 수 없습니다. build_review_index를 rebuild=true로 다시 호출해 새로 빌드하십시오.)`
        : reason === 'empty'
          ? `(오류: ${path}에서 체크리스트 항목을 찾지 못했습니다. build_review_index를 rebuild=true로 다시 호출해 새로 빌드하십시오.)`
          : `(오류: ${path}에 verbex_index/build_id provenance가 없어 기존 index를 안전하게 재사용할 수 없습니다.)`,
    en:
      reason === 'missing'
        ? `(Error: Cannot reuse the existing wiki because ${path} is missing. Call build_review_index again with rebuild=true to build it anew.)`
        : reason === 'empty'
          ? `(Error: No checklist items were found in ${path}. Call build_review_index again with rebuild=true to build it anew.)`
          : `(Error: Cannot safely reuse the existing index because ${path} lacks verbex_index/build_id provenance.)`,
  })
}
export function reuseHeader(folder: string, progress: string) {
  return L({
    ko: `[기존 wiki 재사용] ${folder} — ${progress}`,
    en: `[Reusing existing wiki] ${folder} — ${progress}`,
  })
}
export function resumeChecklist(folder: string) {
  return L({
    ko: `checklist_next(index_folder="${folder}")를 호출해 다음 검토 항목부터 이어가십시오.`,
    en: `Call checklist_next(index_folder="${folder}") to resume from the next review item.`,
  })
}
export function unsupportedReviewTool(name: string) {
  return L({
    ko: `(오류: 지원하지 않는 검토 도구: ${name})`,
    en: `(Error: Unsupported review tool: ${name})`,
  })
}
export function buildPartial(applied: number, total: number) {
  return L({
    ko: `(부분 적용: ${applied}/${total}. index_folder artifact는 기록하지 않았습니다.)`,
    en: `(Partially applied: ${applied}/${total}. The index_folder artifact was not recorded.)`,
  })
}
export function buildApplied(
  folder: string,
  profile: string,
  units: number,
  terms: number,
  checklist: number,
) {
  return L({
    ko: `적용됨: ${folder} — 프로파일 ${profile}, units ${units}개, terms ${terms}개, checklist ${checklist}개 (원본 전량 포함, 누락 0줄)`,
    en: `Applied: ${folder} — profile ${profile}, units ${units}, terms ${terms}, checklist ${checklist} (entire source included, 0 lines omitted)`,
  })
}
export function reviewError(error: unknown) {
  return `${modelMarker('toolError')} ${error instanceof Error ? error.message : String(error)})`
}
export function multipleIndexes(folders: string[]) {
  return L({
    ko: `(오류: 진행 중인 review index가 여러 개입니다: ${folders.join(', ')})`,
    en: `(Error: Multiple review indexes are in progress: ${folders.join(', ')})`,
  })
}
export function missingItem(id: string) {
  return L({
    ko: `(오류: 체크리스트에서 항목을 찾을 수 없습니다: ${id})`,
    en: `(Error: Checklist item not found: ${id})`,
  })
}
export function discoveredFolder(folder: string) {
  return L({
    ko: `\n[자동 발견: ${folder}]`,
    en: `\n[Automatically discovered: ${folder}]`,
  })
}
export function submitPartial(applied: number, total: number) {
  return L({
    ko: `부분 적용됨: ${applied}/${total}. 같은 item_id로 재호출하면 현재 상태를 재평가합니다.`,
    en: `Partially applied: ${applied}/${total}. Calling again with the same item_id reevaluates the current state.`,
  })
}
export function validationWarnings(warnings: string[]) {
  return L({
    ko: ` 표시용 검증 경고: ${warnings.join('; ')}`,
    en: ` Validation warnings for display: ${warnings.join('; ')}`,
  })
}
export function findingSubmitted(
  id: string,
  status: string,
  issues: number,
  warning: string,
  processed: number,
  total: number,
) {
  return L({
    ko: `${id} ${status} 처리 (이슈 ${issues}건).${warning} Phase ${id[0]} 진행 ${processed}/${total}. 다음: checklist_next를 호출하십시오.`,
    en: `${id} processed as ${status} (${issues} issues).${warning} Phase ${id[0]} progress ${processed}/${total}. Next: call checklist_next.`,
  })
}
export function auditPartial(applied: number, total: number) {
  return L({
    ko: `자동 일관성 감사 부분/미적용: ${applied}/${total}`,
    en: `Automatic consistency audit partially/not applied: ${applied}/${total}`,
  })
}
export function auditApplied(path: string) {
  return L({
    ko: `자동 일관성 감사 적용됨: ${path}`,
    en: `Automatic consistency audit applied: ${path}`,
  })
}
export function reportPartial(applied: number, total: number) {
  return L({
    ko: `최종 보고서 부분/미적용: ${applied}/${total}`,
    en: `Final report partially/not applied: ${applied}/${total}`,
  })
}
export function reportWarning(mismatches: string[]) {
  return L({
    ko: `\n검증 불일치 ${mismatches.length}건: ${mismatches.slice(0, 5).join('; ')}. 보고서의 검증 불일치를 확인하세요.`,
    en: `\n${mismatches.length} verification mismatches: ${mismatches.slice(0, 5).join('; ')}. Check the verification mismatches in the report.`,
  })
}
export function reportApplied(path: string, warning: string) {
  return L({
    ko: `최종 보고서 적용됨: ${path}${warning}`,
    en: `Final report applied: ${path}${warning}`,
  })
}
