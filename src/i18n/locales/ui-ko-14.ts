export const ui14 = {
  nativeSkills: {
    skillCount: 'Skill {count}개',
    skillOnly: 'Skill 전용 provider (도구 없음)',
    colLocale: '언어',
    colName: '이름',
    colDescription: '설명',
    colTokens: '본문 토큰',
    colExposure: '노출을 넓히는 설정',
    noExposure: '(없음)',
    extractLine: '문서 텍스트 추출: {extensions}',
    unavailableNow: '지금 쓸 수 없음: {reason}',
    unavailableNoReason: '지금 쓸 수 없음',
    viewBody: '본문 보기',
    hideBody: '본문 접기',
    bodyLoading: '본문을 읽는 중입니다.',
    bodyDisplayOnly:
      '이 화면에서만 보이며 모델 요청에는 쓰이지 않습니다. 일반 글자로 표시합니다.',
    bodyVerified: '확인됨: 본문의 해시와 토큰 수가 선언과 일치합니다.',
    bodyUnverified: '확인하지 못했습니다: {reason}',
    writeTool: '쓰기 도구',
    reason: {
      hash_mismatch: '본문의 해시가 선언과 다릅니다.',
      token_mismatch: '본문의 토큰 수가 선언과 다릅니다.',
      token_unavailable: '토큰 수를 셀 수 없었습니다.',
      invalid_body: '본문 형식이 올바르지 않습니다.',
      timeout: '시간 안에 응답하지 않았습니다.',
      read_error: '본문을 읽지 못했습니다.',
      not_current: '플러그인이 바뀌어 지금은 읽을 수 없습니다.',
    },
  },
  pluginSkills: {
    vaultGroup: '볼트 Skill',
    refreshCommand: 'Skill 목록 새로고침',
    refreshed: 'Skill 목록을 새로 불러왔습니다.',
    refreshFailed:
      '플러그인 Skill을 불러오지 못했습니다. 볼트 Skill만 보입니다.',
  },
}
