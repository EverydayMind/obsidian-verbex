export const ui8 = {
  embeddingActivity: {
    none: '임베딩 색인: 이번 실행에서 갱신 기록 없음',
    waiting: '임베딩 색인: 갱신 대기 중',
    updating: '임베딩 색인: 갱신 중 (청크 {p0}/{p1}, 파일 {p2}개)',
    hold: '임베딩 색인: 갱신 보류 ({p0})',
    runtime_missing: '로컬 런타임 없음',
    configuration: '설정 필요',
    authentication: '인증 실패',
    last: '마지막 갱신 {p0} · 파일 {p1}개',
    failed: ' · 실패 파일 {p2}개, 청크 {p3}개',
    disabled: '임베딩 색인: 사용 안 함 (키워드 검색 전용)',
    notice: '임베딩 색인을 갱신했습니다: 파일 {p0}개',
    noticeFailed: ' (실패 {p1}개)',
  },
  ChatView: {
    theVerbexChatViewIsNotReady: 'Verbex 채팅 화면이 아직 준비되지 않았습니다.',
    theVerbexChatViewIsNotReady2:
      'Verbex 채팅 화면이 아직 준비되지 않았습니다.',
  },
  skillAvailability: {
    skillExcludedFromThisRequestBecauseRequired:
      "Skill '{p0}': 필요한 플러그인({p1})이 꺼져 있어 이번 요청에서 제외했습니다.",
  },
  sessionSources: {
    invalidConversationID: '잘못된 대화 ID입니다.',
  },
  sessionBundle: {
    nNConversationIDNRunningNN: '# {p0}\n\n대화 ID: {p1}\n실행 중: {p2}\n\n',
  },
  exportSession: {
    enterAnAbsoluteFolderPath: '절대 폴더 경로를 입력하세요.',
    thisIsNotAFolder: '폴더가 아닙니다.',
    verbexImprovementAnalysisExportNIncludesConversationsTool:
      'Verbex 개선 분석용 반출 자료\n대화·도구 결과·문서 경로/인용문이 포함됩니다. 공유 전 내용을 검토하세요.\n설정 파일, 원본 첨부파일, 체크포인트 원본, 임베딩 DB는 수집하지 않습니다.\n공용 진단은 다른 대화의 익명화된 이벤트를 포함할 수 있습니다.\n감사 기록은 당시 켜져 있던 범위만 존재하며 이전 기록을 복원하지 않습니다.\nmanifest.json이 없는 폴더는 저장이 끝나지 않은 반출입니다.\n',
    invalidExportFileName: '잘못된 반출 파일 이름입니다.',
  },
  useChatHistory: {
    verbexInitializationIsNotComplete: 'Verbex 초기화가 완료되지 않았습니다.',
  },
  StatusSnapshotService: {
    requiredPluginsAreDisabled: ' (필요한 플러그인이 꺼져 있습니다: {p0})',
    inactiveSkills: '비활성 Skill: {p0}개',
  },
  sourceCitation: {
    sourceContentChangedOpeningTheNoteOnly:
      '출처 내용이 변경되어 노트만 엽니다. 다시 검색하여 위치를 확인하세요.',
  },
  useToolCatalog: {
    couldNotCheckToolStatus: '도구 상태 확인 실패',
    couldNotCheckMCPStatus: 'MCP 상태 확인 실패',
  },
  providerCatalog: {
    active: '활성',
    callInProgress: '호출 진행 중',
    active2: '활성',
    callInProgress2: '호출 진행 중',
    needsVerification: '재확인 필요',
    approvalRequired: '승인 필요',
    checkingStatus: '상태 확인 중',
    checkInstallationActivationOrReviewReapproval:
      '설치·활성화 또는 검토 / 재승인 확인',
    pluginExposed: '자체 노출 · {p0}',
    pluginExposedEditingAndSavingToolsNot:
      '자체 노출 · 편집·저장 도구는 아직 지원하지 않음',
    reviewAndApproveToolDefinitions: '도구 정의 검토·승인 필요',
    available: '사용 가능',
    externalAPICallsAreDisabled: '외부 API 호출 권한 꺼짐',
    tokenChangedOrMissingReconnect: '토큰 변경·누락: 다시 연결 필요',
    connectedApprovalPerCallByDefault: '연결됨 · 기본 호출별 승인',
    unsupportedModelToolNameFormat: '모델 도구 이름 형식 미지원',
    allowExternalAPIsInAgentPermissions: '에이전트 권한 설정에서 외부 API 허용',
    checkKeychainAndReconnectTheServer: 'Keychain 확인 후 서버 다시 연결',
    useLettersNumbersUnderscoresAndHyphensAt:
      '영문·숫자·밑줄·하이픈, 전체 64자 이하 필요',
  },
}
