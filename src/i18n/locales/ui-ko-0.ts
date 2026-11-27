export const ui0 = {
  checkpointRuns: {
    title: '되돌리기 지점',
    description:
      '대화나 실행에서 바뀐 파일을 바뀌기 전 상태로 되돌립니다. 되돌릴 것이 남은 최근 {p0}개만 보입니다.',
    summary: '되돌리기 지점 {p0}개 · 파일 {p1}개',
    more: '외 {p0}개',
    confirm:
      '이 대화(실행)에 남아 있는 되돌리기 지점 전체를 최신순으로 되돌립니다. 그 뒤에 직접 고친 파일은 파일마다 다시 묻습니다. 일부 파일은 변경 감지·잠금·거절로 건너뛸 수 있습니다.',
    result: '되돌림: {p0}개, 건너뜀: {p1}개, 실패: {p2}개',
    busy: '에이전트 실행이나 변경 적용이 끝난 뒤에 되돌릴 수 있습니다.',
    empty: '되돌릴 지점이 없습니다.',
    restore: '되돌리기',
    cancel: '취소',
    loading: '불러오는 중...',
    error: '되돌리기 지점을 불러오거나 되돌리지 못했습니다: {p0}',
  },
  main: {
    autoModeOn: 'Verbex 자동 모드 켜짐 (카운트다운 {p0}초, 제외: {p1})',
    autoModeOff: 'Verbex 자동 모드 꺼짐',
    invalidSettings: '설정이 올바르지 않습니다:\n{p0}',
    embeddingIndexReady:
      '{p0} 임베딩 색인이 준비되었습니다. 데이터베이스 관리자에서 보관된 모델 색인을 확인하세요.',
    reloadingForMigration: '마이그레이션을 위해 Verbex를 다시 불러옵니다',
    reviewUnresolvedBrowserOperations: '미해결 브라우저 작업 검토',
    embeddingRuntimeMissing:
      '의미 검색용 로컬 임베딩 런타임이 설치되어 있지 않습니다. 키워드 검색은 그대로 동작합니다.',
    embeddingGetOfflinePack: '오프라인 팩 받기',
    embeddingSwitchToKeyword: '키워드 검색으로 전환',
    vectorSaveTitle: '오류: 저장 실패',
    vectorSaveMessage:
      '벡터 데이터베이스 변경 사항을 저장하지 못했습니다. 개발자에게 이 문제를 알려 주세요.',
    vectorChunkTitle: '오류: 청크 임베딩 실패',
    vectorChunkMessage:
      '일부 파일을 처리하지 못했습니다. 문제가 계속되면 개발자에게 알려 주세요.',
    vectorEmbeddingTitle: '오류: 임베딩 실패',
    vectorEmbeddingMessage:
      '여러 파일을 처리하지 못해 색인이 중단되었습니다.\n문제가 계속되면 개발자에게 알려 주세요.',
    contextPreview: '컨텍스트 미리보기',
    verbexOpenChat: 'Verbex: 채팅 열기',
    verbexAddSelectionToChat: 'Verbex: 선택 영역을 채팅에 추가',
    verbexShowStatus: 'Verbex: 상태 보기',
    verbexShowRelatedNotes: 'Verbex: 연관 노트 보기',
    verbexUpdateIndex: 'Verbex: 인덱스 갱신',
    verbexUpdateModifiedFileIndex: 'Verbex: 수정된 파일 인덱스 갱신',
    verbexRefreshSkillList: 'Verbex: Skill 목록 새로고침',
    verbexShowCurrentPlan: 'Verbex: 현재 Plan 보기',
    verbexStopRun: 'Verbex: 실행 중단',
    verbexResumeRun: 'Verbex: 실행 재개',
    verbexRunAgentOnSelectionToolCalling:
      'Verbex: 선택 영역으로 Agent 실행 (tool-calling)',
    selectTheRequestTextToSendTo: 'Agent에 전달할 요청 텍스트를 선택하세요.',
    startingVerbexAgent: 'Verbex Agent 실행 시작…',
    verbexAgentToolCallsTurns: 'Verbex Agent {p0} — tool 호출 {p1}회, {p2}턴.',
    completed: '완료',
    iterationLimitReached: '반복 한도 도달',
    verbexAgentError: 'Verbex Agent 오류: {p0}',
    verbexContinueWritingAtCursor: 'Verbex: 이어쓰기 (커서 위치)',
    verbexRewriteSelection: 'Verbex: 선택 영역 다시 쓰기',
    noCheckpointsToRestore: '복원할 되돌리기 지점이 없습니다.',
    verbexRollbackRestoredSkippedFailedSkippedFiles:
      'Verbex: {p0} 롤백 — 복원 {p1}개, 건너뜀 {p2}개, 실패 {p3}개. 건너뛴 파일은 저장 뒤에 바뀌었거나 저장 결과가 확정되지 않아 그대로 뒀습니다: {p4}',
    verbexRestoredToCheckpoint:
      'Verbex: {p0}: 되돌리기 지점 {p1} 상태로 복원했습니다.',
    verbexListCheckpoints: 'Verbex: 되돌리기 지점 목록',
    verbexToggleAutoMode: 'Verbex: Auto Mode 전환',
    verbexCleanUpCheckpointsRetentionPolicy:
      'Verbex: 되돌리기 지점 정리 (보존 정책)',
    verbexRemovedCheckpointsFreedKB:
      'Verbex: 되돌리기 지점 {p0}개 정리, {p1}KB 확보.',
    noExpiredCheckpointsToCleanUp: '정리할 만료된 되돌리기 지점이 없습니다.',
    verbexInitializationFailedChatRunsAreBlocked:
      'Verbex 초기화 실패 — {p0}. 채팅 실행은 차단됩니다.',
    cannotOpenTheVerbexChatView: 'Verbex 채팅 화면을 열 수 없습니다.',
    noTextBeforeTheCursorToContinue:
      '이어쓸 앞 텍스트가 없습니다. 커서를 본문 안에 두세요.',
    verbexContinueWriting: 'Verbex 이어쓰기',
    optionalDirectionLeaveBlankToContinueAs:
      '선택: 방향 지시 (비우면 그대로 이어서 작성). 예: 다음 단락을 요약으로',
    continueWriting: '이어쓰기',
    verbexContinuing: 'Verbex: 이어쓰는 중…',
    noContentWasGenerated: '생성된 내용이 없습니다.',
    verbexContinuationError: 'Verbex 이어쓰기 오류: {p0}',
    selectTheTextToRewriteFirst: '다시 쓸 텍스트를 먼저 선택하세요.',
    verbexRewrite: 'Verbex 다시 쓰기',
    howShouldItBeRevisedExampleMore:
      '어떻게 고칠까요? 예: 더 간결하게 / 공손한 어조로 / 개조식으로',
    rewrite: '다시 쓰기',
    verbexRewriting: 'Verbex: 다시 쓰는 중…',
    verbexRewriteError: 'Verbex 다시쓰기 오류: {p0}',
    noChanges: '변경 사항이 없습니다.',
    verbexRewritePreview: 'Verbex 다시 쓰기 — 미리보기',
    replaceTheSelectionWithTheFollowingN:
      '선택 영역을 아래 내용으로 교체합니다:\n\n{p0}',
    replace: '교체',
    verbexBM25IndexIsUnavailableCheckThe:
      'Verbex: BM25 인덱스를 사용할 수 없습니다. 상태 보기를 확인하세요.',
    verbexBM25IndexMayBeOutOf:
      'Verbex: BM25 인덱스가 최신 상태가 아닐 수 있습니다. 상태 보기를 확인하세요.',
    verbexCouldNotUpdateTheVaultIndex:
      'Verbex가 볼트 색인을 갱신하지 못했습니다. 명령 팔레트에서 "수정된 파일 인덱스 갱신"을 실행하세요.',
  },
  ChangeApprovalNotes: {
    create: '새로 만듦',
    modify: '수정',
    delete: '삭제',
    rename: '이름 변경',
    move: '이동',
    filesChangedByThisApproval: '함께 바뀌는 파일 ',
    fileS: '개',
    obsidianUpdatesLinks: '— Obsidian이 링크를 고칩니다',
    viewResult: '결과 보기',
  },
  ToolManagementModal: {
    toolManagement: '도구 관리',
  },
  TextRollbackApprovalModal: {
    approveTextFileRestoration: '이 파일들을 되돌릴까요?',
    restoreTheCurrentContentsOfTheFollowing:
      '아래 파일의 현재 내용을 이전 상태로 되돌립니다. 이후의 수정도 사라질 수 있습니다.',
    runCheckpoint: '실행: {p0} · 되돌리기 지점: {p1}',
    deleteCurrentFile: '현재 파일 삭제',
    recreatePreviousContents: '이전 내용으로 재생성',
    overwriteWithPreviousContents: '이전 내용으로 덮어쓰기',
    changedAfterApplying: ' (적용 뒤 변경됨)',
    changesAfterApplyingNotConfirmed: ' (적용 뒤 변경 여부 미확인)',
    filesChangedWhileApprovalIsPendingWill:
      '결정하는 동안 바뀐 파일은 되돌리지 않습니다. 이 허용은 이번 되돌리기 지점 한 번에만 적용됩니다.',
    allowThisRestoration: '이번 복원 허용',
    skip: '건너뛰기',
    details: '자세히',
  },
  SessionEditApprovalModal: {
    allowDocumentWorkingCopyEdits: 'AI가 이 문서를 편집하게 할까요?',
    allowAIToEditTheWorkingCopy: '문서: {p0}',
    requestedToolV: '요청한 도구: {p0} · {p1} v{p2}',
    thisDocumentIsOpenOnScreenEdits:
      '이 문서는 지금 화면에 열려 있습니다. 편집이 바로 보입니다.',
    thisDocumentIsNotOpenOnScreen:
      '이 문서는 지금 화면에 열려 있지 않습니다. 편집이 바로 보이지 않으며, 저장하거나 버릴 때까지 저장 안 한 변경으로 남습니다.',
    furtherEditsToThisDocumentInThis:
      '저장을 허용하기 전까지 파일은 바뀌지 않습니다. 이 대화에서는 편집을 다시 묻지 않고, 저장할 때 한 번 더 묻습니다.',
    editsAreSentAndRecorded:
      '편집한 내용은 설정한 AI 모델 서비스로 전송됩니다. 플러그인은 편집 내용을 되살리기 위한 기록을 자기 폴더에 남길 수 있습니다.',
    allowInThisConversation: '이 대화에서 허용',
    deny: '거절',
  },
}
