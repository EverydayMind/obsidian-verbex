export const ui6 = {
  changeLedger: {
    changeLedgerNoMutationCallsExecutedIn:
      '변경 장부: 이 턴에서 실행된 변경 호출이 없습니다.',
    applied: '적용',
    partiallyApplied: '부분 적용',
    failedDenied: '실패·거부',
    unchangedUnknown: '변경 없음·불명',
    applied2: '적용',
    partiallyApplied2: '부분 적용',
    failedDenied2: '실패·거부',
    unchangedUnknown2: '변경 없음·불명',
    calls: ' {p0}건',
    andMore: '외 {p0}건',
    changeLedgerMutationCallsInThisTurn:
      '변경 장부: 이 턴의 변경 호출 {p0}건 — {p1}.',
  },
  McpOAuthControls: {
    completeBrowserSignInAndConsentClosing:
      '브라우저에서 로그인·동의를 완료하세요. 설정 창을 닫으면 취소됩니다.',
    signedInTestTheConnectionToCheck:
      '로그인 완료. 연결 확인 후 서버 도구를 확인하세요.',
    oAuthSignInFailed: 'OAuth 로그인 실패',
    discoverServiceAuthenticationAndRegisterVerbexThrough:
      '서비스의 인증 정보를 발견하고 DCR로 Verbex를 등록합니다. DCR을 지원하지 않는 서버는 로그인할 수 없습니다. 로그인 정보는 Obsidian Keychain에 저장합니다.',
    browserSignInSignInAgain: '브라우저 로그인 / 다시 로그인',
    signInCancelled: '로그인이 취소되었습니다.',
    cancelSignIn: '로그인 취소',
    signInCredentialsDeletedFromThisDevice:
      '이 기기의 로그인 정보를 삭제했습니다. 서비스의 동의 철회는 해당 서비스에서 관리하세요.',
    couldNotDeleteSignInCredentials: '로그인 정보 삭제 실패',
    deleteSignInCredentials: '로그인 정보 삭제',
  },
  McpConnectionFields: {
    endpointUrl: 'MCP 엔드포인트 URL',
    connectionType: '연결 방식',
    remoteMCPURL: '원격 MCP URL',
    localProgramAdvanced: '로컬 프로그램 (고급)',
    enterTheMCPAddressProvidedByThe:
      '서비스가 제공하는 MCP 주소를 입력하세요. 원격은 HTTPS, localhost는 HTTP도 지원합니다.',
    authentication: '인증',
    browserSignInOAuthDCR: '브라우저 로그인 · OAuth / DCR',
    none: '없음',
    tokenObsidianKeychain: '토큰 · Obsidian Keychain',
    keychainSecret: 'Keychain 비밀 항목',
    chooseAnExistingTokenOrCreateA:
      '기존 토큰을 선택하거나 새 항목을 만드세요. Verbex 설정에는 항목 이름만 저장합니다. 토큰 변경 후에는 다시 연결하세요.',
    tokenConnectionsRequireSecretStorageInObsidian:
      '토큰 연결에는 Obsidian 1.11.5 이상의 Secret Storage가 필요합니다.',
    oAuthSignInRequiresSecretStorageIn:
      'OAuth 로그인에는 Obsidian 1.11.5 이상의 Secret Storage가 필요합니다.',
    command: '실행 명령',
    localMCPProgramOrFullExecutablePath:
      '로컬 MCP 프로그램 또는 전체 실행 파일 경로',
    arguments: '인자',
    enterOneArgumentPerLineDoNot:
      '한 줄에 인자 하나씩 입력하세요. 따옴표로 다시 감싸지 않습니다.',
    environmentVariablesAdvanced: '환경변수 (고급)',
    onlySpecifiedValuesAreAddedToThe:
      '명시한 값만 최소 실행 환경에 추가합니다. 기존 로컬 환경변수 설정은 유지됩니다.',
  },
  PluginConnectorReviewModal: {
    reviewPluginConnector: '플러그인 커넥터 검토',
    jSONMustNotExceed150000Characters: 'JSON은 150,000자 이하여야 합니다.',
    jSONError: 'JSON 오류',
    atMost32ConnectorsCanBeRegistered:
      '커넥터는 최대 32개까지 등록할 수 있습니다.',
    approvalFailed: '승인 실패',
    manifestJSON: '매니페스트 JSON',
    reviewJSON: 'JSON 검토',
    target: '대상: ',
    connector: '· 커넥터:',
    agentCalls: '에이전트 호출:',
    allowed: '허용',
    off: '꺼짐',
    resultLimit: '결과 최대 ',
    charactersTimeout: '자 · 제한시간',
    approvalSendsThisMethodSReturnValues:
      '승인하면 이 메서드의 반환 내용이 현재 채팅 모델에 전달됩니다. 플러그인 코드는 Obsidian 안에서 실행되며, 읽기·계산 선언만으로 실제 부수효과를 차단하지는 못합니다. 동기 호출은 화면을 멈출 수 있고, 시간초과나 중단으로 대상 호출을 취소할 수 없습니다.',
    ifTheSameIDAlreadyExistsReplace:
      '기존에 같은 ID가 있으면 이 정의로 교체하고 현재 설치 버전에 승인합니다.',
    approveAndRegisterReviewedDefinitions: '검토한 정의 승인 및 등록',
    close: '닫기',
  },
  McpServerFormModal: {
    enterAnExecutableCommand: '실행 명령을 입력하세요.',
    connectionVerifiedServerToolsToolExecutionRequires:
      '연결 확인: 서버 도구 {p0}개. 도구 실행에는 별도 승인이 적용됩니다.',
    couldNotVerifyTheConnection: '연결 확인에 실패했습니다.',
    couldNotSaveMCPSettings: 'MCP 설정 저장에 실패했습니다.',
    invalidJSONSettings: 'JSON 설정이 올바르지 않습니다.',
    displayName: '표시 이름',
    forRemoteConnectionsDefaultsToTheURL:
      '원격 연결은 생략하면 URL의 호스트 이름을 사용합니다.',
    importConnectionSettingsJSONAdvanced: '연결 설정 JSON 가져오기 (고급)',
    importConnectionSettingsUseKeychainEntryNames:
      '연결 설정을 가져옵니다. HTTP 토큰 본문 대신 Keychain 항목 이름을 사용하세요.',
    import: '가져오기',
    checkingConnection: '연결 확인 중…',
    testConnection: '연결 확인',
  },
}
