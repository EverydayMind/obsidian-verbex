import { L } from '../../i18n/modelText'

export function executorUnavailable(name: string) {
  return L({
    ko: `(오류: ${name}은(는) 채팅 에이전트에서 사용할 수 없습니다. 파일 변경은 Apply 단계에서만 수행하세요.)`,
    en: `(Error: ${name} is unavailable to the chat agent. Make file changes only in the Apply step.)`,
  })
}
export function executorMissingArtifact(argument: string) {
  return L({
    ko: `(오류: ${argument} artifact가 없습니다. build_review_index를 먼저 실행하십시오.)`,
    en: `(Error: the ${argument} artifact is missing. Run build_review_index first.)`,
  })
}
export function executorMissingTransformArgs() {
  return L({
    ko: '(오류: transform_large_file requires path and instruction.)',
    en: '(Error: transform_large_file requires path and instruction.)',
  })
}
export function executorTransformPrefix(cancelled: boolean) {
  return L({
    ko: cancelled ? '취소됨' : '오류',
    en: cancelled ? 'Cancelled' : 'Error',
  })
}
export function executorProposedError(message: string) {
  return L({ ko: `(오류: ${message})`, en: `(Error: ${message})` })
}
export function executorNoChange() {
  return L({
    ko: '(오류: transformed document did not produce a file change.)',
    en: '(Error: transformed document did not produce a file change.)',
  })
}
export function executorTransformed(summary: string, count: number) {
  return L({
    ko: `${summary} 대용량 문서 ${count}개 구간을 순서대로 변환·병합했습니다.`,
    en: `${summary} Transformed and merged ${count} large-document sections in order.`,
  })
}
