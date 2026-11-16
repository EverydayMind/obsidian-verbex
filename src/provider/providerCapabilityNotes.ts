import { L } from '../i18n/modelText'

export function formatReuseHostNote(): string {
  return L({
    ko: '[호스트 기능 상태] 서식 재사용 턴에서는 필수·명시 도구를 보존하고 일반 내보내기·옛 서식 프로파일 도구의 노출을 제한합니다.',
    en: `[Host capability status] Format-reuse turns preserve required/explicit tools and restrict ordinary export and legacy style-profile tools.`,
  })
}

export function sessionDisabledHostNote(): string {
  return L({
    ko: '[호스트 기능 상태] 현재 호스트는 작업본 편집(session) 도구를 노출하지 않는 구성이다. 플러그인의 사용 안내에 편집 기능이 설명되어 있어도 실제 노출된 도구만 사용할 수 있다. 문서 닫기나 플러그인 승인 갱신만으로 이 호스트 제한은 해제되지 않는다.',
    en: `[Host capability status] This host is configured not to expose working-copy editing (session) tools. Only actually exposed tools can be used, even if plugin instructions describe editing capabilities. Closing the document or renewing plugin approval alone does not remove this host restriction.`,
  })
}
