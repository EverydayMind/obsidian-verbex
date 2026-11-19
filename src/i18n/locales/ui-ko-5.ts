export const ui5 = {
  PluginConnectorSection: {
    couldNotCheckStatus: '상태 확인 실패',
    obsidianPluginAPI: 'Obsidian 플러그인 API',
    connectReadAndCalculationAPIsToThe:
      '읽기·계산 API를 채팅 에이전트에 연결합니다. 승인 후 Skill, 키워드 또는 대화 고정으로 필요한 도구를 선택합니다.',
    advancedImportCustomDefinitions: '고급 · 커스텀 정의 가져오기',
    importJSON: 'JSON 가져오기',
    checkingStatus: '상태 확인 중',
    enableConnector: '커넥터 사용',
    reviewReapprove: '검토 / 재승인',
    exportJSON: 'JSON 내보내기',
    removeRegistration: '등록 삭제',
    enableTool: '도구 사용',
    allowAgentCalls: '에이전트 호출 허용',
    copyTheJSONToExport: '내보낼 JSON을 복사하세요',
  },
  PluginApiPresets: {
    supportedPresets: '지원 프리셋',
    aPIIsConnectedAutomaticallyPinItIn:
      '{p0} API가 자동 연결돼 있습니다. 채팅의 도구 선택에서 고정할 수 있습니다.',
    installAndEnableInObsidianSettingsCommunity:
      'Obsidian 설정 → 커뮤니티 플러그인에서 {p0}를 설치·켜세요. 준비되면 도구 관리에 자동 표시됩니다.',
    reviewReapprove: '검토 / 재승인',
    addReviewTasks: 'Tasks 추가·검토',
    checkConnectionStatus: '연결 상태 확인',
    installationAndActivationHelp: '설치·활성화 안내',
    installationAndActivationAreSeparateFromAPI:
      '설치·활성화와 API 연결·호출 승인은 별도입니다. 지원 프리셋은 Tasks·Dataview·KORDOC입니다.',
  },
  NativeSequentialApproval: {
    toolCount: '도구 {n}개',
    toolCountOne: '도구 {n}개',
    tools: '· 도구',
    tools2: '개 ·',
    awaitingApproval: '승인 전',
    reapprove: '재승인',
    savePermissionCommitGrantAndDisabledTool:
      "승인해도 저장 도구는 켜지지 않습니다. 승인 뒤 'Vault 저장 도구 허용'에서 켜세요.",
    approve: '승인',
    skip: '건너뛰기',
    stop: '중단',
    reviewToolApproval: '도구 승인 검토',
    batchToolApproval:
      '플러그인 도구 승인 (플러그인 {plugins}개 · 도구 {tools}개)',
    batchToolApprovalPluginsOnly: '플러그인 도구 승인 (플러그인 {plugins}개)',
    approved: '승인 ',
    skipped: '· 건너뜀 ',
    changed: '· 변경됨',
    failed: '· 실패 ',
  },
  NativeReapprovalReview: {
    approvedPluginVersion: '승인한 플러그인 버전: ',
    currentVersion: '· 현재 버전:',
    approvedFileSHA256: '승인한 파일 SHA-256: ',
    currentFileSHA256: '현재 파일 SHA-256: ',
    itemsChangedFromThePreviousDefinition: '이전 도구 설명과 달라진 항목 ',
    items: '개',
    previous: '이전',
    current: '현재',
    someDetailsWereOmittedReviewTheFull:
      '표시가 일부 생략되었습니다. 전체 도구 설명을 검토하세요.',
    previousApprovedDefinitionsAreMissingOrUnverified:
      '이전에 승인한 도구 설명이 없거나 확인되지 않아 변경 내용을 비교할 수 없습니다. 현재 도구 설명 전체를 검토하세요.',
    fullRawDefinitions: '도구 설명 원문',
    approvalRecords: '승인 기록 ',
    duplicatesPreventToolUseRevokeAllApproval:
      '개가 중복되어 도구를 사용할 수 없습니다. 아래에서 이 플러그인의 승인 기록을 모두 철회한 뒤 도구 설명을 다시 검토하고 승인하세요. 비활성 도구 및 실행 파일 해시 설정도 다시 지정해야 합니다.',
    revokeAllDuplicateApprovals: '중복 승인 모두 철회',
    revokeApproval: '승인 철회',
  },
  NativeProviderSection: {
    toolDiscoveryFailed: '도구 탐색 실패',
    toolsExposedByPlugins: '플러그인 자체 노출 도구',
    toolsExposedByEnabledPluginsAvailableTo:
      '승인하면 설정한 AI 모델이 이 플러그인의 도구를 쓰고 그 결과를 받습니다. 플러그인의 도구 설명이나 버전이 바뀌면 다시 묻습니다.',
    savingNeedsSaveTools:
      "파일 저장은 'Vault 저장 도구 허용'을 따로 켜야 합니다.",
    details: '자세히',
    toolsRunInThePluginsCode:
      '도구는 Obsidian 안에서 그 플러그인의 코드로 실행됩니다. 효과 표시는 플러그인의 선언이지 격리 장치가 아닙니다.',
    optionalExecutableHashesCheckChangesToMain:
      '선택적 실행 파일 해시는 디스크의 main.js 변경을 확인합니다. 이미 메모리에 적재된 코드나 같은 프로세스의 동작을 격리하거나 증명하지 않습니다.',
    openDocumentProtectionUsesDocumentListsFrom:
      '열린 문서 보호는 승인되어 사용 중인 편집 플러그인의 문서 목록으로 확인합니다. 승인 대기·오류인 플러그인에는 적용되지 않습니다.',
    allowBrowserActionsApproveEachCall: '브라우저 동작 허용(매 호출 승인)',
    checkingPluginTools: '플러그인 도구를 확인하고 있습니다…',
    noPluginsExposeTools: '도구를 내놓은 플러그인이 없습니다.',
    review: '도구 ',
    tools: '개 검토',
    enableTool: '도구 사용',
    approveTheToolDefinitionsAbove: '위 도구 설명을 승인',
    existingConnector: '기존 커넥터 ',
    isAlsoEnabledDisableThisConnectorTo:
      '도 함께 사용 중입니다. 자체 노출 도구만 사용하려면 이 커넥터를 끄시겠습니까?',
    disableConnector: '커넥터 끄기',
    enabled: '사용',
    saveToolsOffNotice:
      "이 플러그인의 저장 도구 {count}개가 꺼져 있습니다. 파일을 만들거나 저장하게 하려면 아래 'Vault 저장 도구 허용'에서 켜세요.",
  },
  NativeProviderDefinition: {
    readOnlyTools: '읽기 전용 도구 {n}개',
    readOnlyToolsOne: '읽기 전용 도구 {n}개',
    changingTools: '변경할 수 있는 도구(편집·저장·조작) {n}개',
    changingToolsOne: '변경할 수 있는 도구(편집·저장·조작) {n}개',
    browserActionApproveEachCall: '브라우저 동작(매 호출 승인)',
    read: '읽기',
    calculate: '계산',
    editWorkingCopy: '문서 편집(저장 전)',
    saveToVaultSeparatePermissionAndPer:
      "파일 저장('Vault 저장 도구 허용'과 매번 확인 필요)",
    usageSentToTheModelOriginalText:
      '모델에 전달되는 사용법(플러그인 제공 원문):',
  },
  NativeCommitGrantControls: {
    toolDefinitionsOrApprovalChangedCheckAgain:
      '도구 설명 또는 승인이 바뀌었습니다. 다시 확인하세요.',
    couldNotUpdateSaveToolPermission: '저장 도구 허용 변경 실패',
    allowVaultSaveTools: 'Vault 저장 도구 허용',
    separateFromToolDefinitionApprovalEachSave:
      '도구 설명 승인과 별개입니다. 저장할 때마다 다시 묻고 되돌리기 지점을 먼저 만듭니다.',
    saveToolPermissionIsDisabledInThis:
      '기존 수용 게이트 검증 전이므로 이 빌드에서는 저장 도구 허용이 닫혀 있습니다.',
    theDefinitionChangedAndThePreviousSave:
      '도구 설명이 바뀌어 이전 저장 허용이 비활성입니다. 재승인만으로 복원되지 않습니다.',
  },
  NativeArtifactControls: {
    couldNotVerifyExecutable: '실행 파일 확인 실패',
    fileOrApprovalSettingsChangedCheckAgain:
      '파일 또는 승인 설정이 바뀌었습니다. 다시 확인하세요.',
    couldNotPinExecutable: '실행 파일 고정 실패',
    pinnedFileSHA256: '고정된 파일 SHA-256: ',
    checkExecutableHash: '실행 파일 해시 확인',
    currentFileSHA256: '현재 파일 SHA-256: ',
    pinThisHash: '이 해시를 고정',
    cancel: '취소',
  },
}
