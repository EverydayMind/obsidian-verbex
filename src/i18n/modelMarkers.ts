import type { ModelLocale } from './modelLocale'
import { L } from './modelText'

/** Wire markers are bilingual protocols, independent of the app locale. */
export const MODEL_MARKERS = {
  currentItem: { ko: '[현재 항목]', en: '[Current item]' },
  folderResult: { ko: '폴더 ', en: 'Folder ' },
  systemNotice: { ko: '[시스템 안내]', en: '[System notice]' },
  harnessFact: { ko: '[하네스 사실]', en: '[Harness fact]' },
  hostFact: { ko: '[호스트 사실]', en: '[Host fact]' },
  pluginGuide: { ko: '[플러그인 도구 안내:', en: '[Plugin tool guide:' },
  pluginResult: { ko: '[플러그인 도구 결과:', en: '[Plugin tool result:' },
  userRequest: { ko: '## 사용자 요청\n', en: '## User request\n' },
  context: {
    ko: 'Verbex ContextBuilder가 모은 Vault 자료입니다.',
    en: 'Vault material collected by Verbex ContextBuilder.',
  },
  summary: { ko: '[이전 대화 요약]', en: '[Earlier conversation summary]' },
  redundantRead: { ko: '(중복 호출 생략', en: '(Duplicate call omitted' },
  evictedRead: { ko: '(관련성 낮아 생략', en: '(Omitted as irrelevant' },
  preview: { ko: '[미리보기]', en: '[Preview]' },
  documentSection: { ko: '구역', en: 'Section' },
  toolError: { ko: '(오류:', en: '(Error:' },
  changeApplied: { ko: '적용됨:', en: 'Applied:' },
  changePartial: { ko: '부분 적용됨:', en: 'Partially applied:' },
  changeRejected: { ko: '거부됨:', en: 'Rejected:' },
  changeDenied: { ko: '권한 거부:', en: 'Permission denied:' },
  changeConflict: {
    ko: '수정본 충돌로 미적용:',
    en: 'Not applied due to revision conflict:',
  },
  checkpointFailed: {
    ko: '체크포인트 실패로 미적용:',
    en: 'Not applied due to checkpoint failure:',
  },
  applyFailed: { ko: '적용 실패:', en: 'Apply failed:' },
  toolCancelled: { ko: '(취소됨:', en: '(Cancelled:' },
  validationFailed: { ko: '(검증 실패:', en: '(Validation failed:' },
} as const

export type ModelMarker = keyof typeof MODEL_MARKERS
export function modelMarker(key: ModelMarker, locale?: ModelLocale): string {
  return L(MODEL_MARKERS[key], locale)
}
export function hasModelMarker(
  text: string,
  key: ModelMarker,
  position: 'start' | 'any' = 'start',
): boolean {
  return Object.values(MODEL_MARKERS[key]).some((marker) =>
    position === 'start' ? text.startsWith(marker) : text.includes(marker),
  )
}
export function lastModelMarker(
  text: string,
  key: ModelMarker,
): { index: number; length: number } {
  return Object.values(MODEL_MARKERS[key]).reduce(
    (last, marker) => {
      const index = text.lastIndexOf(marker)
      return index > last.index ? { index, length: marker.length } : last
    },
    { index: -1, length: 0 },
  )
}
export function contextBoundary(text: string): number {
  const indices = Object.values(MODEL_MARKERS.context)
    .map((marker) => text.indexOf('\n\n' + marker))
    .filter((index) => index >= 0)
  return indices.length ? Math.min(...indices) : -1
}
export function stripPluginResultBanner(text: string): string {
  const trimmed = text.trimStart()
  if (!hasModelMarker(trimmed, 'pluginResult')) return text
  const end = trimmed.indexOf(']')
  return end >= 0 ? trimmed.slice(end + 1).trimStart() : text
}
