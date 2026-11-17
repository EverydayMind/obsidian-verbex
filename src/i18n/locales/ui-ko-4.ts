export const ui4 = {
  DocumentIndexSettings: {
    kORDOCLastChecked: 'KORDOC {p0} · {p1} · {p2} · 마지막 확인 {p3}',
    noExtractor: '추출기 없음',
    none: '없음',
    couldNotCheckExtractionStatus: '추출 상태 확인 실패',
    localHWPHWPXPDFSearch: 'HWP·HWPX·PDF 로컬 검색',
    extractDiskDocumentsWithKORDOCAndInclude:
      'KORDOC으로 디스크 문서를 추출해 BM25에 포함합니다. 원본과 사이드카는 수정하지 않습니다.',
    hWPHWPXPDFEmbeddings: 'HWP·HWPX·PDF 임베딩',
    sendDocumentBodiesToTheSelectedEmbedding:
      '문서 본문을 선택한 임베딩 서비스로 전송합니다. 로컬 검색과 별도로 동의해야 합니다.',
    sendDocumentBodiesToTheLocalEmbedding:
      '문서 본문을 로컬 임베딩 서비스로 보냅니다. 예상 {p0}개 청크',
    consentToHWPHWPXDocumentEmbeddings: '한글 문서 임베딩 동의',
    documentBodiesWillBeSentToAn:
      '문서 본문이 외부 임베딩 서비스로 전송됩니다.\n현재 문서 상태: {p0} · {p1} chunks\n추출된 청크마다 임베딩 비용이 발생할 수 있습니다.',
    index: '{p0} 색인',
    hWPHWPXDocumentIncludePaths: '한글 문서 포함 경로',
    hWPHWPXDocumentExcludePaths: '한글 문서 제외 경로',
    enterVaultRelativePathsOrGlobPatterns:
      '줄마다 Vault 상대 경로나 glob 패턴을 입력합니다. 공통 검색 범위도 적용됩니다.',
    automaticHWPHWPXExtractionSizeLimitMB: '한글 문서 자동 추출 크기 상한 (MB)',
    documentsExceedingTheLimitRequireManualRe:
      '상한을 넘는 문서는 수동 재추출만 허용합니다. KORDOC의 절대 상한은 100MB입니다.',
    automaticDocumentExtractionPageLimit: '문서 자동 추출 쪽 상한',
    hWPHWPXDocumentExtractionStatus: '한글 문서 추출 상태',
    checkExtractorAvailabilityAndCountsByDocument:
      '추출기 가용성과 문서별 상태 개수를 확인합니다.',
    processing: '처리 중…',
    checkStatus: '상태 확인',
    reExtractFailedDocuments: '실패 문서 다시 추출',
  },
  McpSection: {
    collapse: '접기',
    expand: '펼치기',
    afterConnectingPinToolsInChatOr:
      '연결 후 채팅 도구 선택에서 고정하거나 Skill·요청으로 후보를 선택할 수 있습니다. 기본은 호출별 승인이고 자동 허용은 도구별로 명시해야 합니다.',
    reconnectMCP: 'MCP 다시 연결',
    reconnect: '다시 연결',
    automaticExecution: '{p0} 자동 실행',
    couldNotUpdateMCPAutomaticApproval: 'MCP 자동 허용 설정 실패',
    reviewTargetAndApproveAgain: '대상 확인 후 다시 승인 필요',
  },
  VerbexPlaceholderSection: {
    thisSettingIsEnabledIn: '이 설정은 ',
    currentlyAPreview: '에서 활성화됩니다. (현재 미리보기)',
  },
  useNativeBatchApproval: {
    approvalSettingsChangedReviewAgain:
      '승인 설정이 바뀌었습니다. 다시 검토하세요.',
    couldNotRevokeApproval: '승인 철회 실패',
    approvalSettingsChangedReviewAgain2:
      '승인 설정이 바뀌었습니다. 다시 검토하세요.',
    couldNotUpdateApprovalSettings: '승인 설정 변경 실패',
    approvalSettingsChangedReviewAgain3:
      '승인 설정이 바뀌었습니다. 다시 검토하세요.',
    approvalFailed: '승인 실패',
  },
  ToolManagementSection: {
    toolManagement: '도구 관리',
    registered: '등록 ',
    ready: '· 준비 ',
    agentCandidates: '· 에이전트 후보',
    lastSuccessfulModelRequestExposure: '마지막 성공한 모델 요청 노출:',
    noneYet: '아직 없음',
    toolsActuallySentToTheModelDepend:
      '모델에 실제로 보내는 도구는 이번 대화 선택, Skill, 준비 상태와 정의 토큰 예산에 따라 달라집니다. 실행 승인은 후보 선택과 별도로 적용됩니다.',
    toolApproval: '도구 승인',
    toolCategory: '도구 분류',
    all: '전체',
    searchTools: '도구 검색',
    searchCapabilitiesAndProviders: '기능·제공자 검색',
    enableToolsForChatAgent: '채팅 에이전트 도구 사용',
    showing: '표시 ',
    tools: '개 ·',
    groups: '개 그룹',
    tools2: '개',
    noMatchingTools: '해당하는 도구가 없습니다.',
    addPluginAPI: '플러그인 API 추가',
    manageMCPServersAndPermissions: 'MCP 서버·권한 관리',
    noMCPServersRegistered: 'MCP 서버가 등록되어 있지 않습니다.',
    manageKeywordSemanticAndHybridVaultSearch:
      'Vault 검색은 검색 설정에서 키워드·의미·혼합 방식과 인덱스를 관리합니다. 의미 검색 실패 시 키워드 검색으로 전환합니다. Bases 렌더링은 Bases 코어 플러그인을 켜지 않아도 사용할 수 있습니다.',
  },
  ToolGroupTable: {
    details: '{p0} 자세히',
    details2: '자세히',
    externalServer: '외부 서버',
    community: '커뮤니티',
    obsidianPublicAPIVerbex: 'Obsidian 공개 API / Verbex',
    vaultChangesPermissionCheckDiffProposalApproval:
      'Vault 변경: 권한 확인 → Diff/제안 승인 → 체크포인트 → 적용',
    editsTheWorkingCopyOfAnOpen:
      '열린 문서의 작업본을 편집합니다. 파일 저장은 별도의 저장 도구와 저장 허용을 거칩니다.',
    readAndCalculationResultsMayLaterBe:
      '읽기·계산 결과는 이후 LLM 제공자에 전송될 수 있습니다.',
    executionApprovalIsRequiredForEachCall: '호출마다 실행 승인이 필요합니다.',
    executionIsAutomaticallyAllowed: '실행이 자동 허용됩니다.',
    advancedDefinitions: '고급 정의',
    groupTools: '그룹 도구',
    tool: '도구',
    provider: '제공자',
    readiness: '준비 상태',
    definitionApproval: '정의 승인',
    changes: '변경',
    details3: '자세히',
  },
  RAGSection: {
    collectRetrievalEvaluationData: '검색 평가 데이터 수집',
    markRealVaultQueriesAndRelevantEvidence:
      '실제 vault 질의와 관련 근거 청크를 표시해 RetrievalEvaluationCase golden set을 작성합니다.',
    openCollector: '수집 화면 열기',
  },
}
