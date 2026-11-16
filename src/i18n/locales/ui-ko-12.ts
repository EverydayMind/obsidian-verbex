export const ui12 = {
  PlanTracker: {
    understand: '요청 파악',
    respond: '응답 작성',
  },
  agentCompletion: {
    validationFailureAcceptedAsIsByThe: '검증 실패를 사용자가 그대로 수용함',
    agentRunComplete: '에이전트 실행 완료: {p0}',
    attempts: '{p0}회 시도',
    '1Attempt': '1회 시도',
  },
  AgentRunExecution: {
    agentExecutionPlanPreparedCoverage:
      '에이전트 실행 계획 수립: {p0} ({p1} coverage)',
    toolWasNotIncludedInThisRequest:
      '도구 {p0}이(가) 이번 요청에 포함되지 않아 실행하지 못했습니다. 채팅의 도구 선택에서 고정하면 다음 요청부터 포함됩니다.',
    removedFilesConsideredUnrelatedToTheCurrent:
      '현재 작업과 무관하다고 판단된 파일 {p0}개를 컨텍스트에서 제거했습니다.',
    compactedContextBySummarizingEarlierMessages:
      '이전 대화 {p0}개를 요약해 컨텍스트를 압축했습니다.',
  },
  modelReadiness: {
    noChatModelsAreRegisteredAddA:
      '등록된 채팅 모델이 없습니다. 설정에서 모델을 추가하세요.',
    theSelectedChatModelCouldNotBe:
      '선택된 채팅 모델을 찾을 수 없습니다(삭제되었을 수 있음). 설정에서 다른 모델을 선택하세요.',
    theSelectedChatModelIsDisabledEnable:
      '선택된 채팅 모델 "{p0}"이(가) 비활성화되어 있습니다. 설정에서 다시 활성화하거나 다른 모델을 선택하세요.',
    theProviderForTheSelectedChatModel:
      '선택된 채팅 모델 "{p0}"의 프로바이더를 찾을 수 없습니다(삭제되었을 수 있음). 설정에서 프로바이더를 다시 추가하거나 다른 모델을 선택하세요.',
    providerHasNoAPIKeyEnterAn:
      '프로바이더 "{p0}"에 API 키가 설정되지 않았습니다. 설정에서 API 키를 입력하세요.',
    providerHasNoBaseURLEnterA:
      '프로바이더 "{p0}"에 Base URL이 설정되지 않았습니다. 설정에서 Base URL을 입력하세요.',
    theSelectedChatModelDoesNotSupport:
      '선택된 채팅 모델 "{p0}"은(는) 도구 호출을 지원하지 않습니다. 도구 호출을 끄거나 지원 모델을 선택하세요.',
  },
  browserStatusText: {
    running: '진행 중',
    executionRecordFound: '실행 기록 있음',
    noRecordInCurrentProviderNotProof:
      '현재 provider에 기록 없음 · 미실행 증거가 아님',
    inputNotSent: '입력이 전송되지 않음',
    inputSent: '입력 전송됨',
    inputPartiallySent: '입력 일부만 전송됨',
    inputTransmissionUnknown: '입력 전송 여부 불명',
    inputAppliedExternalOperationSuccessUnverified:
      '입력 적용됨 · 외부 업무 성공은 미확인',
    inputNotApplied: '입력 적용되지 않음',
    inputApplicationUnknown: '입력 적용 여부 불명',
    actions: ' {p0}{p1}/{p2}건',
    recordedSteps: '기록된 단계 ',
    recordCode: ' · 기록 코드 {p0}',
    theProviderRecordedARejectionBeforeExecution:
      ' Provider 기록상 실행 전에 거부되어 입력을 보내지 않았습니다. 사이트 상태가 그대로인지 확인한 뒤 해제하세요.',
    checkingStatusDoesNotUnblockTheAction:
      '{p0}{p1} 조회로 차단을 해제하지 않습니다. 사이트에서 직접 확인하세요.',
  },
  browserStatus: {
    noUnresolvedActionsFoundForThisConversation:
      '이 대화의 미확정 작업을 찾을 수 없습니다.',
    providerUnavailableOrAPreviousCallIs:
      'Provider가 없거나 이전 호출이 진행 중입니다. 나중에 확인하세요.',
  },
  descriptorDiff: {
    none: '(없음)',
  },
  revealSavedAnchorCandidate: {
    invalidParagraphLocation: '문단 위치가 올바르지 않습니다.',
    noCurrentParagraphCandidates: '현재 문단 후보가 없습니다.',
    paragraphLocationRecordsExpired: '문단 위치 기록이 만료됐습니다.',
    invalidDocumentPath: '문서 경로가 올바르지 않습니다.',
    approvedHWPHandsIsUnavailable: '승인된 HWP Hands를 사용할 수 없습니다.',
    hWPHandsLocationNavigationIsUnavailable:
      'HWP Hands 위치 보기를 사용할 수 없습니다.',
    locationNavigationCancelledOrThePluginIs:
      '위치 보기가 취소됐거나 플러그인이 사용 중입니다.',
    stateChangedBeforeLocationNavigation: '위치 보기 전 상태가 변경됐습니다.',
    stateChangedDuringLocationNavigationCheckThe:
      '위치 보기 중 상태가 변경됐습니다. 문서 화면을 확인하세요.',
  },
  resolveSavedAnchorRefs: {
    invalidParagraphLocationRange: '문단 위치 범위가 올바르지 않습니다.',
  },
  resolveSavedAnchorCandidates: {
    invalidParagraphLocationRange: '문단 위치 범위가 올바르지 않습니다.',
    paragraphLocationRecordsExpired: '문단 위치 기록이 만료됐습니다.',
    noParagraphLocationsToCheck: '확인할 문단 위치가 없습니다.',
    approvedHWPHandsIsUnavailable: '승인된 HWP Hands를 사용할 수 없습니다.',
    hWPHandsOpenDocumentInspectionIsUnavailable:
      'HWP Hands의 열린 문서 확인 기능을 사용할 수 없습니다.',
    hWPHandsQueryCancelledOrBusy: 'HWP Hands 조회가 취소됐거나 사용 중입니다.',
    hWPHandsChanged: 'HWP Hands가 변경됐습니다.',
    vaultChangesWereObservedDuringTheQuery:
      '조회 중 Vault 변경이 관측됐습니다. 변경 원인은 확인되지 않았습니다.',
    vaultChangesWereObservedDuringTheQuery2:
      '조회 중 Vault 변경이 관측됐습니다. 변경 원인은 확인되지 않았습니다.',
    hWPHandsStateChangedDuringTheQuery:
      '조회 중 HWP Hands 상태가 바뀌었습니다.',
    paragraphCandidatesDoNotMatchTheSave:
      '문단 후보가 저장 기록 또는 열린 문서와 일치하지 않습니다.',
  },
  resolveAnchorBatch: {
    paragraphLocationRecordsExpired: '문단 위치 기록이 만료됐습니다.',
    noParagraphLocationsToCheck: '확인할 문단 위치가 없습니다.',
    approvedKORDOCIsUnavailable: '승인된 KORDOC을 사용할 수 없습니다.',
    kORDOCParagraphReferenceVerificationIsUnavailable:
      'KORDOC 문단 참조 확인을 사용할 수 없습니다.',
    kORDOCQueryCancelledOrBusy: 'KORDOC 조회가 취소됐거나 사용 중입니다.',
    kORDOCChanged: 'KORDOC이 변경됐습니다.',
    vaultChangesWereObservedDuringTheQuery:
      '조회 중 Vault 변경이 관측됐습니다. 변경 원인은 확인되지 않았습니다.',
    vaultChangesWereObservedDuringTheQuery2:
      '조회 중 Vault 변경이 관측됐습니다. 변경 원인은 확인되지 않았습니다.',
    kORDOCStateChangedDuringTheQuery: '조회 중 KORDOC 상태가 바뀌었습니다.',
    paragraphReferencesDoNotMatchTheSave:
      '문단 참조 결과가 저장 기록과 일치하지 않습니다.',
  },
  editorReveal: {
    thisPluginDoesNotSupportLocationNavigation:
      '이 플러그인은 위치 보기를 지원하지 않습니다.',
    thePluginChangedOrAPreviousCall:
      '플러그인이 바뀌었거나 이전 호출이 진행 중입니다. 잠시 뒤 다시 누르세요.',
    thePluginChangedWhileOpeningTheLocation:
      '위치를 여는 동안 플러그인이 변경됐습니다. 문서에서 확인하세요.',
  },
  documentJobNotice: {
    hWPXFormatJobBlocked: 'HWPX 서식 작업이 차단되었습니다 ({p0}). {p1}',
  },
}
