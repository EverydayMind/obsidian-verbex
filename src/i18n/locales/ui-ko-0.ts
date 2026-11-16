export const ui0 = {
  main: {
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
    noCheckpointsToRestore: '복원할 체크포인트가 없습니다.',
    verbexRollbackRestoredSkippedFailedSkippedFiles:
      'Verbex: {p0} 롤백 — 복원 {p1}개, 건너뜀 {p2}개, 실패 {p3}개. 건너뛴 파일은 저장 뒤에 바뀌었거나 저장 결과가 확정되지 않아 그대로 뒀습니다: {p4}',
    verbexRestoredToCheckpoint:
      'Verbex: {p0}을(를) 체크포인트 {p1} 상태로 복원했습니다.',
    verbexListCheckpoints: 'Verbex: 체크포인트 목록',
    verbexCheckpointsLatestFiles:
      'Verbex 체크포인트 {p0}개 (최신: {p1}, 파일 {p2}개).',
    noCheckpointsInTheActiveRun: '활성 Run에 체크포인트가 없습니다.',
    verbexToggleAutoMode: 'Verbex: Auto Mode 전환',
    verbexCleanUpCheckpointsRetentionPolicy:
      'Verbex: 체크포인트 정리 (보존 정책)',
    verbexRemovedCheckpointsFreedKB:
      'Verbex: 체크포인트 {p0}개 정리, {p1}KB 확보.',
    noExpiredCheckpointsToCleanUp: '정리할 만료 체크포인트가 없습니다.',
    verbexInitializationFailedChatRunsAreBlocked:
      'Verbex 초기화 실패 — {p0}. 채팅 실행은 차단됩니다.',
    approveHWPXBinaryChanges: 'HWPX 바이너리 변경 승인',
    approveAllProposalsAndSave: '전체 제안 승인 및 저장',
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
      'Verbex could not update the vault index. Use "Verbex: 수정된 파일 인덱스 갱신" from the command palette.',
  },
  ChangeApprovalNotes: {
    create: '새로 만듦',
    modify: '수정',
    delete: '삭제',
    rename: '이름 변경',
    move: '이동',
    filesChangedByThisApproval: '이 승인으로 함께 바뀌는 파일 ',
    fileS: '개',
    obsidianUpdatesLinks: '— Obsidian이 링크를 고칩니다',
    viewResult: '결과 보기',
  },
  ToolManagementModal: {
    toolManagement: '도구 관리',
  },
  TextRollbackApprovalModal: {
    approveTextFileRestoration: '텍스트 파일 복원 승인',
    restoreTheCurrentContentsOfTheFollowing:
      '아래 파일의 현재 내용을 이전 상태로 되돌립니다. 이후의 수정도 사라질 수 있습니다.',
    runCheckpoint: '실행: {p0} · 체크포인트: {p1}',
    deleteCurrentFile: '현재 파일 삭제',
    recreatePreviousContents: '이전 내용으로 재생성',
    overwriteWithPreviousContents: '이전 내용으로 덮어쓰기',
    changedAfterApplying: ' (적용 뒤 변경됨)',
    changesAfterApplyingNotConfirmed: ' (적용 뒤 변경 여부 미확인)',
    filesChangedWhileApprovalIsPendingWill:
      '승인 대기 중 파일이 바뀌면 복원하지 않습니다. 이 승인은 이번 체크포인트 한 번에만 적용됩니다.',
    allowThisRestoration: '이번 복원 허용',
    skip: '건너뛰기',
  },
  SessionEditApprovalModal: {
    allowDocumentWorkingCopyEdits: '문서 작업본 편집 허용',
    allowAIToEditTheWorkingCopy:
      '이 대화에서 AI가 {p0} 작업본을 편집하도록 허용할까요?',
    requestedToolV: '요청한 도구: {p0} · {p1} v{p2}',
    thisDocumentIsOpenOnScreenEdits:
      '이 문서는 지금 화면에 열려 있습니다. 편집이 바로 보입니다.',
    thisDocumentIsNotOpenOnScreen:
      '이 문서는 지금 화면에 열려 있지 않습니다. 편집이 바로 보이지 않으며, 저장하거나 버릴 때까지 저장 안 한 변경으로 남습니다.',
    furtherEditsToThisDocumentInThis:
      '허용하면 이 대화의 이후 편집은 이 문서에 대해 다시 묻지 않고, 편집마다 채팅에 결과를 남깁니다. 원본 파일은 바뀌지 않습니다. 파일 저장은 따로 승인을 받습니다. 플러그인은 자기 폴더에 복구 기록을 남길 수 있습니다. 편집 결과의 문서 내용은 LLM 제공자에 전달될 수 있습니다.',
    allowInThisConversation: '이 대화에서 허용',
    deny: '거절',
  },
}
