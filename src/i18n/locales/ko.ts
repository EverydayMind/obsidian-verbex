import { en } from './en'
import { ui0 } from './ui-ko-0'
import { ui1 } from './ui-ko-1'
import { ui10 } from './ui-ko-10'
import { ui11 } from './ui-ko-11'
import { ui12 } from './ui-ko-12'
import { census } from './ui-ko-13'
import { ui2 } from './ui-ko-2'
import { ui3 } from './ui-ko-3'
import { ui4 } from './ui-ko-4'
import { ui5 } from './ui-ko-5'
import { ui6 } from './ui-ko-6'
import { ui7 } from './ui-ko-7'
import { ui8 } from './ui-ko-8'
import { ui9 } from './ui-ko-9'

export const ko = {
  census,
  providerR14: {
    versionChanged: '대상 버전이 바뀌었습니다. JSON을 다시 검토하세요.',
    approvalNeeded: '승인 필요',
    disabled: '꺼짐',
    busy: '호출 진행 중',
    active: '활성',
    methodMissing: 'API 메서드 없음',
    recheck: '재확인 필요',
    error: '오류',
    editorUnsupported: '승인된 플러그인이 이 동작을 지원하지 않습니다.',
    editorBusy:
      '플러그인이 바뀌었거나 이전 호출이 진행 중입니다. 잠시 뒤 다시 누르세요.',
    editorChanged:
      '호출 중 플러그인이 변경됐습니다. 문서에서 상태를 확인하세요.',
  },
  providerR13: {
    mcpUnavailable: 'MCP 도구를 사용할 수 없습니다.',
    mcpChanged: 'MCP 도구가 변경됐습니다. 다시 확인하세요.',
    noChanges: '(의미적 변경 항목 없음)',
    target: '대상: {path}',
    count: '변경 수: {count}',
    sourceHash: '원본 SHA-256: {hash}',
    resultHash: '결과 SHA-256: {hash}',
    sizes: '원본 크기: {source} bytes · 결과 크기: {result} bytes',
    expires: '만료: {date}',
    changes: '변경 내용 (전체 제안 단위):',
    confirm: '이 바이너리 제안 전체를 승인하고 원본 HWPX를 덮어쓸까요?',
    wholeOnly: '부분 항목 승인은 지원하지 않습니다.',
    cell: '블록 {block} 표 {row}행 {col}열',
    block: '블록 {block}',
  },
  largeDocumentBadge: {
    badge: '> 📄 전체 문서 분석 완료 · {p0}{p1}{p2}{p3}',
    outputWarning: ' · ⚠️ 일부 출력이 잘렸을 수 있음',
    projectionWarning: ' · ⚠️ 문서 투영이 원본 일부만 담음(전체 coverage 아님)',
    verified: ' · 교차 검증 완료',
    multiScope: '{p0}개 파일 · {p1}개 구간',
    singleScope: '{p0} · {p1}개 구간',
  },
  tidyR11: {
    title:
      '제목 "{display}"을(를) 파일 이름 규칙에 맞게 "{title}"로 바꿨습니다({reasons}). 원래 표기는 aliases에 남깁니다.',
    links:
      '이 노트를 가리키는 링크가 있는 노트 {count}개는 Obsidian이 링크를 고칩니다: {notes}{tail}',
    updateLinks:
      'Obsidian "내부 링크 자동 업데이트"가 꺼져 있어 적용 중에 Obsidian 링크 업데이트 확인 창이 뜹니다. "업데이트 안 함"을 고르면 링크가 깨질 수 있습니다.',
    existing:
      '"{name}" 노트가 이미 있어({path}) 새 노트를 만들지 않고 링크만 추가합니다.',
    create:
      '엔티티({type}) 노트 {path}를 만들고 {source}의 "{mention}" 언급을 링크합니다.',
    original: '원문 변경: {context}',
    mentions: '{source}의 언급 {count}곳을 {entity}로 링크합니다{first}.',
    first: '(첫 언급만)',
    merge:
      '{source}를 {target}에 병합합니다(Obsidian 노트 작성기, {position} 붙임). 원본은 Obsidian 삭제 설정({trash})대로 지워집니다.',
    prepend: '앞에',
    append: '뒤에',
    localTrash: '.trash 폴더',
    permanent: '영구 삭제',
    systemTrash: '시스템 휴지통',
    exact: '대상과 똑같은 블록 {count}개를 원본에서 뺍니다{details}.',
    extra:
      '모델이 중복으로 판단한 블록 {count}개도 뺍니다(확인 필요): {blocks}',
    protected:
      '다른 노트가 링크하는 블록 {count}개는 중복이어도 남깁니다: {anchors}',
    conflicts: '속성 충돌({keys})은 {action}.',
    keepTarget: '대상 값을 유지합니다',
    takeSource: '원본 값으로 바꿉니다',
    alias: '원본 제목 "{title}"을(를) 대상의 aliases에 추가합니다.',
    template: '노트 작성기 템플릿이 적용됩니다.',
    properties:
      '속성 서식은 Obsidian이 다시 직렬화하므로 미리보기와 조금 다를 수 있습니다.',
    split:
      '{source}의 일부({text})를 새 노트 {path}로 옮깁니다(Obsidian 노트 작성기).',
    replacement: '원본 자리에는 {action}(노트 작성기 설정).',
    leaveNone: '아무것도 남기지 않습니다',
    leaveEmbed: '임베드 {replacement}를 남깁니다',
    leaveLink: '링크 {replacement}를 남깁니다',
    rename:
      '제목을 "{old}"에서 "{title}"(으)로 바꿉니다(Obsidian 이름 변경, 같은 폴더).',
    oldAlias: '이전 제목 "{title}"을(를) aliases에 남깁니다.',
  },
  nativeProviderR10: {
    undoTargetUnavailable:
      '이전 편집 카드의 대상을 확인할 수 없습니다. 문서에서 직접 되돌리세요.',
    undoTargetTimeout: '되돌리기 대상 확인 시간 초과',
    undoDocumentChanged:
      '편집 후 문서가 바뀌었습니다. 현재 문서에서 직접 되돌리세요.',
    undoReceiptMismatch:
      '되돌리기 영수증이 선택한 편집과 다릅니다. 문서에서 상태를 확인하세요.',
    editorBusy:
      '플러그인이 바뀌었거나 이전 호출이 진행 중입니다. 잠시 뒤 다시 누르세요.',
    undoPluginChanged:
      '되돌리는 동안 플러그인이 변경됐습니다. 문서에서 확인하세요.',
    undoResultUnavailable: '되돌리기 결과를 확인하지 못했습니다.',
    editorUnavailable:
      '승인된 플러그인을 사용할 수 없습니다. 도구 설정을 확인하세요.',
    invalidDocumentPath: '문서 경로가 올바르지 않습니다.',
    describeBusy: '이전 provider 탐색 응답 대기 중',
    describeTimeout: 'describe() 응답 시간 초과',
    runtimeFault:
      '저장 중 예상 밖 변경 관측: 파일을 확인한 뒤 제공 플러그인을 다시 불러오세요. 변경 원인은 미확정입니다.',
    discoveryError: '탐색 오류',
    pending: '승인 대기',
    reapproval: '도구 정의 또는 버전 변경: 재승인 필요',
    busy: '호출 진행 중',
    active: '활성',
    disabled: '꺼짐',
    error: '오류',
    duplicateRecords:
      '승인 기록이 중복되었습니다. 설정을 정리한 뒤 다시 탐색하세요.',
    providerMissing: '도구를 제공하는 플러그인을 찾을 수 없습니다.',
    definitionsChanged: '검토한 뒤 도구 정의가 바뀌었습니다. 다시 검토하세요.',
    duplicateApproval: '승인 항목이 중복되었습니다. 다시 검토하세요.',
    artifactChanged: '검토한 실행 파일이 바뀌었습니다. 다시 검토하세요.',
    artifactBusy: '이전 실행 파일 확인이 아직 끝나지 않았습니다.',
    pinnedArtifactUnavailable:
      '고정된 플러그인 실행 파일을 확인할 수 없습니다.',
    artifactPathUnavailable: '플러그인 파일 경로를 확인할 수 없습니다.',
    artifactUnavailable: '플러그인 실행 파일을 확인할 수 없습니다.',
    artifactReadChanged: '플러그인 실행 파일이 읽는 동안 바뀌었습니다.',
    selectAgain: '승인 대상을 다시 선택하세요.',
    approvalMissing: '승인 항목이 중복되었거나 사라졌습니다. 다시 검토하세요.',
    approvalChanged:
      '검토한 뒤 플러그인 또는 승인 설정이 바뀌었습니다. 다시 검토하세요.',
    alreadyApproved:
      '이미 현재 정의로 승인된 플러그인이 있습니다. 다시 검토하세요.',
    initialApprovalExists:
      '승인 기록이 이미 있거나 중복되었습니다. 다시 검토하세요.',
    pluginChanged: '검토한 뒤 플러그인이 바뀌었습니다. 다시 검토하세요.',
  },
  browserReadAccessR10: {
    allowed: '사이트 읽기 허용됨',
    approval_required: '사이트 읽기 승인 필요',
    needs_allowlist: '사이트 허용 목록 등록 필요',
    blocked: '차단된 사이트',
    read_disabled: '웹 읽기 꺼짐',
    prompt_unavailable: '사이트 허용 확인창을 사용할 수 없음',
  },
  findingAggregationR8: { issueCount: '이슈 {count}건' },
  commitStatusR7: {
    unavailable: '저장 기록을 확인할 수 없습니다.',
    invalidId: '저장 기록의 식별자가 올바르지 않습니다.',
    notFound: '이 대화의 저장 기록을 찾을 수 없습니다.',
    invalidPath: '저장 기록의 경로가 올바르지 않습니다.',
    restored: '되돌리기를 처리한 저장입니다. 기존 저장 결과는 유지됩니다.',
    running: '이전 호출이 진행 중입니다. 끝난 뒤 다시 확인하세요.',
    diskCompared:
      '현재 파일을 이전 내용과 승인한 저장 내용의 해시로 비교했습니다.',
    pluginChanged: '플러그인 상태가 바뀌었습니다. 다시 확인하세요.',
    wrongReceipt: '다른 저장의 영수증입니다.',
    responseReceived:
      '플러그인 응답을 받았으며, 표시 상태는 현재 파일의 해시로 확인했습니다.',
    responseFailed:
      '플러그인 결과를 확인하지 못했습니다. 표시 상태는 현재 파일의 해시 비교입니다.',
    waiting: '상태 조회 응답 대기 중입니다. 자동 저장 재시도는 하지 않습니다.',
    diskOnly:
      '플러그인이 바뀌었거나 재시작되어 현재 파일의 해시만 비교했습니다.',
  },
  fileToolR6: {
    rename: '{path} → {newPath}: 같은 폴더에서 이름을 변경합니다.',
    move: '{path} → {newPath}: 파일을 이동합니다.',
    trash: '{path}을(를) 휴지통으로 이동합니다.',
  },
  runtimeR5: {
    checkpoint: '체크포인트 생성 완료: 파일 변경 반영용',
    toolPermission: '도구 쓰기 권한 승인/실행: {tool} -> {path}',
    workflowMatched: '워크플로 매칭 완료: {name}',
    evaluationJson: '검색 평가 데이터 JSON을 읽을 수 없습니다: {error}',
    evaluationFormat: '검색 평가 데이터 형식이 올바르지 않습니다: {error}',
    oauthReceived: 'Verbex 로그인 응답을 받았습니다. Obsidian으로 돌아가세요.',
    oauthRejected: 'OAuth 로그인이 거부되었습니다. 다시 로그인하세요.',
    oauthCancelled: 'OAuth 로그인이 취소되었습니다.',
    oauthTimeout: 'OAuth 로그인 시간이 만료되었습니다. 다시 로그인하세요.',
    oauthCallback: 'OAuth callback 주소를 열지 못했습니다.',
    nextMessage: '진행하세요',
  },
  ui: {
    ...ui0,
    ...ui1,
    ...ui2,
    ...ui3,
    ...ui4,
    ...ui5,
    ...ui6,
    ...ui7,
    ...ui8,
    ...ui9,
    ...ui10,
    ...ui11,
    ...ui12,
  },
  restoreActiveRunCommand: 'Verbex: 활성 실행 전체 복원',
  toolBudgetNotice:
    '도구 예산 때문에 {provider} 도구가 이번 요청에 실리지 않았습니다. 필요하면 채팅의 "도구"에서 고정하세요.',
  settings: {
    documentJobs: {
      title: '문서 작업',
      baseFontPt: '서식 재사용: 기준 본문 글꼴 크기(pt)',
      description:
        '기본 15pt. 6~40pt 범위에서 0.5pt 단위로 지정합니다. 새 작업에 적용됩니다.',
    },
    tabs: {
      ariaLabel: 'Verbex 설정 구역',
      getStarted: '시작하기',
      chat: '채팅',
      search: '검색',
      advanced: '고급',
    },
    moreSettings: '세부 설정',
    readiness: {
      title: '준비 상태',
      done: '완료',
      needed: '필요',
      providerReady: '공급자 준비됨: {id}',
      providerNeeded: 'API 키가 든 공급자가 필요합니다.',
      chatModelReady: '채팅 모델: {id}',
      chatModelNeeded: '채팅 모델을 추가하세요.',
      chatModelProviderNeeded:
        '채팅 모델 {id}는 아직 쓸 수 없습니다. 공급자({providerId})를 설정하세요.',
      addChatModel: '모델 추가',
      approvalsPending: '도구 승인을 기다리는 플러그인 {count}개',
      approvalsNone: '승인을 기다리는 플러그인이 없습니다.',
      goToToolApproval: '도구 승인으로 이동',
      saveToolsOff:
        '저장 도구 {count}개가 꺼져 있습니다. Verbex가 파일을 만들거나 저장하게 하려면 켜세요.',
    },
    documentSearch: {
      title: '한글·PDF 문서 검색',
    },
    groups: {
      tools: '도구',
      llm: 'LLM',
      embedding: '임베딩',
      search: '검색',
      permissions: '도구 실행 권한과 자동 모드',
      context: '문맥 예산',
      advanced: '고급 설정',
    },
    common: {
      save: '저장',
      cancel: '취소',
      confirm: '확인',
      delete: '삭제',
      add: '추가',
      manage: '관리',
      edit: '편집',
      on: '켬',
      off: '끔',
      recommended: '추천',
      offlinePackRequired: '오프라인 팩 필요',
      enabled: '활성화',
      disabled: '비활성화',
      inherit: '공급자 기본값 상속 ({status})',
      loading: '불러오는 중...',
      required: '필수',
      optional: '선택',
      lastUpdated: '마지막 갱신: {time}',
    },
    chat: {
      title: '채팅',
      modelUnsetOption: '(선택된 모델 없음)',
      chatModel: {
        name: '채팅 모델',
        desc: '에이전트와의 일반 대화에 기본 사용할 언어 모델을 지정합니다. 이 값을 수정하면 대화와 에이전트 작업의 응답 품질, 비용, 속도가 달라집니다.',
      },
      applyModel: {
        name: '파일 반영 모델',
        desc: '변경 사항을 만들어 파일에 적용할 때 쓰는 언어 모델입니다. 변경이 정확히 반영되도록 성능이 좋은 모델을 고르는 것을 권합니다.',
      },
      systemPrompt: {
        name: '기본 시스템 프롬프트',
        desc: '모든 채팅 대화가 시작할 때 첫머리에 자동으로 추가되는 전역 프롬프트 지시어입니다. 에이전트의 말투, 기본 동작 지침, 혹은 보안 규칙을 정의할 수 있습니다.',
      },
      includeCurrentFile: {
        name: '현재 파일 자동 포함',
        desc: '활성화하면 현재 작업 창에 열려 있는 활성 노트의 본문 전체를 채팅 시작 시점에 자동으로 맥락에 주입합니다. 매번 파일을 끌어오거나 수동 첨부할 필요 없이 열어둔 노트를 즉시 분석할 수 있습니다.',
      },
      enableTools: {
        name: '도구 허용',
        desc: '에이전트에게 MCP 도구들을 호출하여 실행할 권한을 부여합니다. 이를 끄면 에이전트가 로컬 파일 읽기/쓰기나 기타 시스템 연동 도구를 쓰지 못하고 텍스트로만 대화합니다.',
      },
      maxAutoIterations: {
        name: '최대 자동 도구 실행 횟수',
        desc: '사용자의 추가 승인 단계를 거치지 않고 에이전트가 백그라운드에서 연속적으로 실행할 수 있는 도구 호출 건수 상한선입니다. 값을 높이면 여러 단계가 필요한 작업을 한 번에 끝내지만, 예기치 못한 호출 루프로 인해 토큰 API 비용이 증가할 수 있습니다.',
      },
      nextButtonMessage: {
        name: 'NEXT 버튼 메시지',
        desc: "채팅 화면의 'NEXT' 진행 버튼을 클릭했을 때 사용자가 직접 타이핑하지 않고 자동으로 전송되는 문구입니다. (예: '진행하세요', 'go ahead')",
      },
      minEvidenceReads: {
        name: '최소 증거 읽기 횟수',
        desc: '에이전트가 검토 보고서나 취합 결과를 최종 생성하기 전에, 탐색된 관련 소스 노트를 최소 몇 개 이상 읽어야 하는지 강제합니다. 0으로 설정하면 소스 파일 분석 여부와 관계없이 즉시 보고서 완성을 시도합니다.',
      },
    },
    agent: {
      title: 'Verbex 작업 폴더',
      agentsMdPath: {
        name: '시스템 프롬프트 파일 경로',
        desc: '볼트 내에서 에이전트의 페르소나 및 핵심 지시사항을 직접 기재한 시스템 프롬프트 마크다운 문서의 상대 경로를 설정합니다. 비워두면 시스템 기본 프롬프트가 대신 작동합니다.',
      },
      skillsFolder: {
        name: '스킬(Skills) 폴더 경로',
        desc: '에이전트가 도구로 불러와 쓸 수 있는 스킬 정의 파일들이 보관되는 상대 폴더입니다. 새 볼트 구성 시 기본적으로 .verbex/Skills로 설정됩니다.',
      },
      workflowsFolder: {
        name: '워크플로(Workflows) 폴더 경로',
        desc: '에이전트가 다단계 자동화 업무를 처리하는 순서를 정의한 워크플로 YAML 설정 파일들이 담긴 폴더입니다.',
      },
      promptsFolder: {
        name: '프롬프트 템플릿(Prompts) 폴더 경로',
        desc: '워크플로 진행 단계에서 활용되는 프롬프트 템플릿 텍스트 파일들이 저장되는 폴더입니다. 이 값을 변경하면 워크플로 실행 시 조립되는 지시 양식이 달라집니다.',
      },
      vaultWikiFolder: {
        name: '볼트 요약 위키 폴더 경로',
        desc: '선택 사항으로, 볼트 전체 내용에 대한 요약 정리본이 보관될 폴더 경로입니다. 에이전트는 다른 개별 노트를 검색하기 전에 이 위키 문서들을 최우선적으로 읽어 볼트 전체의 핵심 맥락을 더 빠르게 파악합니다.',
      },
    },
    providers: {
      title: '공급자',
      desc: 'LLM 제공업체를 관리합니다. 기본 공급자인 OpenAI와 OpenRouter, Anthropic (Claude), Gemini, Ollama, LM Studio 및 일반 OpenAI 호환 엔드포인트를 지원합니다. 자격 증명을 입력한 후 “연결 테스트”를 통해 통신 상태를 확인할 수 있습니다.',
      table: {
        id: 'ID',
        type: '유형',
        apiKey: 'API 키',
        tools: '도구 지원',
        actions: '동작',
        setApiKey: 'API 키 설정',
      },
      addCustom: '공급자 추가',
      deleteConfirm: {
        title: '공급자 삭제',
        message:
          '정말 공급자 "{id}"을(를) 삭제하시겠습니까?\n\n삭제 시 아래의 항목이 함께 완전히 제거됩니다:\n- 채팅 모델 {chatCount}개\n- 임베딩 모델 {embedCount}개\n\n해당 임베딩 모델로 생성된 모든 기존 데이터베이스 벡터들 또한 영구적으로 삭제되니 주의하십시오.',
      },
      addCustomModal: '공급자 추가',
      editModal: '공급자 편집: {id}',
      idField: {
        name: 'ID',
        desc: '설정 창 및 모델 구성 시 공급자를 구별하기 위해 부여하는 사용자 지정 참조용 이름입니다.',
      },
      providerType: '공급자 유형',
      migrationDone:
        '공급자 API 키 {count}개를 Obsidian 키체인으로 옮겼습니다. 설정 파일에는 키가 남지 않습니다.',
      migrationFailed:
        '일부 공급자의 API 키를 키체인으로 옮기지 못했습니다. 키는 기존 설정 파일에 그대로 있습니다: {ids}',
      keychainDesc:
        'Obsidian 키체인에 저장한 비밀을 고르거나 새로 만듭니다. 키 값은 설정 파일에 저장되지 않습니다.',
      keychainValue: '키체인: {name}',
      keychainEmpty: '키체인: {name} (값 없음)',
      apiKeyField: {
        name: 'API 키',
        desc: '{providerLabel}에 접속하기 위한 비밀 인증 키(API Key)를 입력합니다.',
        placeholder: 'API 키를 입력하세요',
      },
      baseUrlField: {
        name: 'Base URL',
        desc: '이 공급자 유형에 꼭 필요한 서버 주소입니다. 보통 /v1로 끝납니다(예: http://localhost:8000/v1). Verbex가 이 주소 뒤에 /chat/completions를 붙여 호출합니다.',
        optionalDesc: '(비워두면 기본적으로 {defaultUrl} 주소를 사용합니다.)',
        placeholder: '예: http://localhost:8000/v1',
      },
      advancedTls: '고급 (TLS)',
      tlsCaCertField: {
        name: 'CA 인증서 경로 (PEM 포맷)',
        desc: '신뢰할 수 있는 추가 사설 CA 인증서의 절대 파일 경로입니다. 사내 프록시 TLS 복호화 환경 또는 사설 네트워크 내 에어갭 환경 등에서 TLS 인증서 검증 오류가 날 때 유용합니다.',
      },
      tlsSkipVerifyField: {
        name: 'TLS 인증 검증 스킵',
        desc: '보안 인증서 검증 절차를 완전히 건너뜁니다. 보안 취약점을 유발하므로 CA 인증서 설정이 불가능한 테스트 환경 등 극히 예외적인 경우에만 활성화하십시오.',
      },
      supportsToolsField: {
        name: '도구 사용 지원',
        desc: '이 공급자 요청 시 OpenAI 형태의 함수 호출(Function Calling) 구조를 전송할지 설정합니다. 에이전트의 정상 실행을 위해서는 최소 7B급 이상의 로컬 모델 성능이 필요하며, 도구 지문 전달 시 오작동하는 모델의 경우 꺼두어야 합니다.',
      },
      testing: '테스트 중…',
      testConnection: '연결 테스트',
      previewModels: {
        button: '모델 목록 확인',
        unsupported: '이 공급자는 모델 목록 조회를 지원하지 않습니다.',
        result: '{count}개 모델 발견: {preview} 등',
      },
      addModelsPrompt: {
        title: '모델 추가',
        message:
          '공급자 "{id}"가 저장되었습니다. 지금 이 공급자의 채팅 모델을 추가하시겠습니까?',
        ctaText: '모델 추가',
      },
      errors: {
        notFound: '이 ID를 가진 공급자를 찾을 수 없습니다.',
        alreadyExists:
          '동일한 ID의 공급자가 이미 설정되어 있습니다. 다른 고유 ID를 사용해 주십시오.',
        connectionSuccess: '연결 테스트 성공',
        connectionFailed: '연결 테스트 실패: {message}',
      },
    },
    chatModels: {
      title: '채팅 모델',
      desc: '채팅에 쓸 모델 목록입니다.',
      table: {
        id: 'ID',
        providerId: '공급자 ID',
        model: '모델명',
        tools: '도구 지원',
        enable: '활성화 여부',
        actions: '동작',
      },
      addCustom: '모델 추가',
      deleteConfirm: {
        title: '채팅 모델 삭제',
        message: '정말 채팅 모델 "{id}"을(를) 삭제하시겠습니까?',
      },
      addCustomModal: '커스텀 채팅 모델 추가',
      editModal: '채팅 모델 편집: {id}',
      errors: {
        alreadyExists:
          '동일한 ID의 모델이 이미 등록되어 있습니다. 다른 ID를 설정해 주십시오.',
        providerNotFound: '해당 ID를 가진 공급자가 설정에 존재하지 않습니다.',
        providerIdNotFound: 'ID가 {id}인 공급자를 찾을 수 없습니다.',
        noModelsSelected: '추가할 모델을 하나 이상 선택하세요.',
        saveFailed:
          '설정 저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도하세요.',
      },
      addedNotice: '모델 {count}개를 추가했습니다. 채팅 모델: {name}.',
      discovery: {
        missingProvider: '설정된 공급자가 없습니다. 먼저 공급자를 추가하세요.',
        setupProvider: '이 공급자 설정하기',
        enterApiKey: '{provider} API 키 입력',
        addDifferentProvider: '다른 공급자 추가',
        addProvider: '공급자 추가',
        missingApiKey:
          '이 공급자에는 API 키가 없습니다. 먼저 공급자 설정에서 키를 넣으세요.',
        missingBaseUrl:
          '이 공급자에는 Base URL이 없습니다. 먼저 공급자 설정에서 주소를 넣으세요.',
        fetching: '모델 목록을 가져오는 중...',
        fetchedCount: '{count}개 모델',
        curatedBadge: '알려진 모델 (서버 응답 아님)',
        unverifiedBadge: '미확인',
        unverifiedTitle:
          '서버 목록에는 있으나 채팅 지원 여부를 알려 주지 않은 모델입니다. 대개 동작하며, 시험 메시지로 확인하세요.',
        alreadyAdded: '이미 추가됨',
        customInput: '직접 입력...',
        backToList: '목록에서 선택',
        addSelected: '선택한 {count}개 추가',
        retry: '다시 시도',
        searchPlaceholder: '모델 검색...',
        contextWindow: '콘텍스트: {count} 토큰',
        truncated: '목록이 잘렸습니다. 검색으로 좁혀보세요.',
        unsupported:
          '이 공급자는 모델 목록 조회를 지원하지 않습니다. 아래에 직접 입력하세요.',
        errors: {
          auth: '인증에 실패했습니다. API 키를 확인하세요.',
          endpoint:
            '모델 목록 엔드포인트를 사용할 수 없습니다. 모델 이름을 직접 입력하세요.',
          server: '공급자 서버 오류입니다. 잠시 후 다시 시도하세요.',
          network:
            '공급자에 연결할 수 없습니다. Base URL과 네트워크 연결을 확인하세요.',
          empty: '공급자가 반환한 모델이 없습니다.',
          malformed: '공급자 응답 형식이 올바르지 않습니다.',
        },
      },
      idField: {
        name: 'ID',
        desc: '이 모델을 나타낼 고유 식별 명칭입니다. 설정창 등에서 이 이름을 사용합니다.',
      },
      providerIdField: '공급자 ID',
      modelNameField: {
        name: '실제 모델명 (API 명칭)',
        placeholder: '모델명을 입력하세요',
      },
      promptLevelField: {
        name: '시스템 프롬프트 수준',
        desc: "에이전트에 주입될 기본 프롬프트 지시서의 상세도를 결정합니다. 소형 모델(예: 8B 이하)의 경우 연동 도구를 줄이고 단순화한 '간단히(simple)'를 적용하여 지시 오버헤드를 경감하는 것이 좋습니다.",
      },
      promptLevelOptions: {
        default: '기본값',
        simple: '간단히',
      },
      supportsToolsField: {
        name: '도구 지원 제어',
        desc: "해당 모델이 도구 및 함수 호출 정의를 전달받을 수 있는지 설정합니다. '상속' 시 공급자 설정을 따르며, 현재 상태는 {status}입니다.",
      },
      toolProbe: {
        name: '도구 호출 확인',
        structured: '구조화된 도구 호출이 돌아왔습니다.',
        text_call:
          '모델이 도구 호출을 본문 글자로 냈고 서버가 구조화하지 않았습니다. 서버의 도구 호출 파서 설정을 확인하세요 (vLLM: --enable-auto-tool-choice 및 --tool-call-parser).',
        no_call:
          '이번 시도에서는 도구를 호출하지 않았습니다. 한 번의 시도로는 단정할 수 없습니다.',
        rejected: '서버가 도구가 든 요청을 거부했습니다: {message}',
        error: '도구 호출을 확인하지 못했습니다: {message}',
      },
      browserImagesField: {
        name: '브라우저 이미지 전송',
        desc: '이미지 입력을 지원하는 모델에서만 켜세요. 스크린샷을 이 모델로 전송합니다. 기본값은 꺼짐입니다.',
      },
      contextWindowField: {
        name: '콘텍스트 윈도우 (토큰 개수)',
        desc: '모델이 한 번에 입력받아 출력할 수 있는 최대 토큰 한도입니다. 이 크기를 넘어가는 대용량 파일은 일괄 로딩하지 않고 자동으로 map-reduce 분석을 거치도록 설계되어 있습니다. 비워두면 자동 인식값(현재 {autoVal})이 지정됩니다.',
      },
      toolTurnReasoningEffortField: {
        name: '도구 호출 턴 추론 수준',
        desc: '선택한 API의 도구 턴에 적용되며 미설정은 모델 기본값을 따릅니다. GPT-6 Luna/Sol의 Chat Completions 도구는 명시 none이 필요하며 추론을 유지하려면 Responses를 선택하세요. Astra/6.1 Sol의 도구는 Responses가 필수이고 none은 지원하지 않습니다.',
      },
      apiModeField: {
        name: 'API 방식',
        desc: '이 모델의 모든 요청에 적용됩니다. 기존 모델은 Chat Completions를 유지하고 새 OpenAI 모델은 Responses를 기본 선택합니다. 호환 서버는 Responses 지원을 확인해야 합니다. 자동 우회는 하지 않습니다.',
      },
      compatibilityAuto: '문서화된 모델 기본값',
      compatibilityOverrideDesc:
        '공급자가 다른 지원 조건을 명시한 경우에만 덮어쓰세요. 내장 규칙은 공식 OpenAI 모델에 적용되고 호환 서버는 자체 계약을 따릅니다.',
      supportsNoneField: { name: '추론 수준 none 지원' },
      chatToolsField: { name: 'Chat Completions 함수 도구' },
      chatToolsOptions: {
        any: '모든 추론 수준',
        noneOnly: '명시 none에서만',
        unsupported: 'Responses 사용',
      },
      toolTurnReasoningEffortOptions: {
        unset: '미설정(필드 생략)',
        none: 'none(추론 끄기)',
        low: 'low',
        medium: 'medium',
        high: 'high',
      },
      errorsDetails: {
        supportsToolsInvalid:
          '도구 활성화 설정은 상속(inherit), 사용(enabled), 미사용(disabled) 중 하나여야 합니다.',
        toolTurnReasoningEffortInvalid:
          '도구 호출 턴 추론 수준은 미설정, none, low, medium, high, xhigh, max 중 하나여야 합니다.',
        contextWindowInvalid:
          '콘텍스트 윈도우는 반드시 양의 정수(토큰) 단위여야 합니다.',
      },
    },
    embeddingModels: {
      title: '임베딩 모델',
      desc: 'RAG 기반 정보 수집을 위한 문서 벡터 임베딩 생성 모델입니다.',
      table: {
        id: 'ID',
        providerId: '공급자 ID',
        model: '모델명',
        dimension: '차원 수',
        actions: '동작',
        totalEmbeddings: '총 임베딩 개수',
        sizeMb: '용량 (MB)',
      },
      addCustom: '모델 추가',
      discovery: {
        selectModel:
          '모델 하나를 선택하세요. 저장 전에 공급자 dimension 프로브를 수행합니다.',
      },
      deleteConfirm: {
        title: '임베딩 모델 삭제',
        message:
          '정말 임베딩 모델 "{id}"을(를) 삭제하시겠습니까?\n\n삭제할 경우 데이터베이스에 이 모델로 생성된 모든 인덱싱 벡터 데이터가 영구히 같이 말소됩니다.',
      },
      addCustomModal: '커스텀 임베딩 모델 추가',
      idField: {
        name: 'ID',
        desc: '이 임베딩 모델을 구분하기 위한 고유 이름입니다.',
      },
      providerIdField: '공급자 ID',
      modelNameField: {
        name: '실제 모델명 (API 명칭)',
        placeholder: '모델명을 입력하세요',
      },
      outputDimensionsField: {
        name: '출력 벡터 차원',
        desc: '선택 사항입니다. Matryoshka Representation Learning (MRL)을 지원하는 일부 모델(예: OpenAI text-embedding-3-* 등)에 대해 추출될 커스텀 차원 크기를 요청합니다. 비워두면 모델 고유의 기본 차원으로 생성됩니다.',
      },
      errors: {
        cannotRemoveSelected:
          '현재 기본 임베딩 모델로 지정되어 작업 중인 모델은 삭제할 수 없습니다.',
        cannotRemoveActive:
          '이 모델은 현재 검색 색인에 사용 중입니다. 선택한 모델의 색인 재구축을 완료한 후 삭제할 수 있습니다.',
        alreadyExists:
          '동일한 식별 ID를 가진 모델이 이미 설정에 존재합니다. 다른 이름을 사용해 주십시오.',
        providerNotFound: '해당 ID의 공급자가 설정에 존재하지 않습니다.',
        invalidResult: '임베딩 모델이 유효하지 않은 결과를 반환했습니다.',
        providerIdNotFound: 'ID가 {id}인 공급자를 찾을 수 없습니다.',
        matryoshkaError:
          '출력 차원을 {reqDim}로 요청했으나, 모델이 {retDim} 차원을 최종 반환했습니다. 이 모델은 가변 차원(Matryoshka Representation Learning)을 미지원할 수 있으므로, 해당 필드를 비워두고 기본 차원을 사용하십시오.',
        rebuildFailed: '인덱스 재구축에 실패했습니다.',
        removeFailed: '인덱스 삭제에 실패했습니다.',
        unknownError: '알 수 없는 오류가 발생했습니다',
      },
      actionsAria: {
        refresh: '새로고침',
        rebuildIndex: '인덱스 재구축',
        removeIndex: '인덱스 삭제',
        cancelRebuild: '인덱스 재구축 취소',
      },
      performanceWarning: {
        title: '성능 저하 경고',
        message:
          '이 모델은 {dim}차원 벡터를 내놓으나, 시스템이 최적화하여 지원하는 인덱싱 차원 단위는 [{optDims}]입니다.\n\n이 차원 차이로 인해 향후 벡터 지식 검색 연산 속도가 다소 느려질 수 있습니다.\n\n그래도 정말 등록을 계속 진행하시겠습니까?',
      },
    },
    rag: {
      title: 'RAG (검색 증강 생성)',
      embeddingModel: {
        name: '임베딩 모델 선택',
        desc: '문서 조각들을 벡터 지식화하고 유사도 RAG 검색 시 활용할 임베딩 모델을 선택합니다. 변경 후에도 현재 인덱스가 활성 상태로 유지되며, 새 모델은 임베딩 데이터베이스 관리에서 명시적으로 재구축해야 합니다. 로컬 multilingual-e5-small FP16 (Windows x64)은 네트워크 없이 실행되며 입력은 최대 512 토큰으로 잘립니다.',
      },
      localEmbeddingDevice: {
        name: '로컬 임베딩 실행 장치',
        desc: 'WebGPU를 선택하면 GPU를 사용하며, 초기화나 추론에 실패하거나 CPU와 출력이 다르면 자동으로 CPU로 전환합니다.',
      },
      includePatterns: {
        name: '인덱싱 포함 패턴',
        desc: "지식 DB에 인덱싱할 볼트 내 대상 파일들을 glob 패턴으로 한 줄에 하나씩 적어 제어합니다. 비워두면 기본적으로 모든 파일을 변환 대상에 둡니다. 수정 후에는 '전체 볼트 인덱스 재구축' 명령을 수동 실행해야 DB에 실제로 적용됩니다. (예: notes 폴더의 모든 마크다운은 'notes/**')",
      },
      excludePatterns: {
        name: '인덱싱 제외 패턴',
        desc: '보안 상의 이유나 비효율을 막기 위해 지식 인덱싱에서 아예 배제할 볼트 내 경로를 glob 형태로 지정합니다. (예: 일기장 폴더, 백업용 아카이브 등)',
      },
      testPatterns: '패턴 테스트',
      chunkSize: {
        name: '텍스트 분절 청크 크기',
        desc: '파일을 개별 벡터 지식 단위로 쪼갤 때 기준이 되는 글자 수(문자 단위) 상한입니다. 이 수치가 너무 작으면 문맥이 잘리고, 너무 크면 LLM이 읽을 때 핵심을 놓칠 수 있습니다. 변경 후 재구축이 필요합니다.',
      },
      thresholdTokens: {
        name: 'RAG 자동 전환 임계 토큰',
        desc: '채팅에서 참조 파일들의 원본 텍스트 분량이 이 한도를 넘기면, 전량 로딩을 포기하고 자동으로 필요한 단락만 유사도 기반으로 부분 발췌(RAG)해 주입합니다. 이를 통해 불필요한 입력 토큰 소비와 비용을 차단합니다.',
      },
      minSimilarity: {
        name: 'RAG 최소 유사도 점수',
        desc: '유사도 RAG 검색을 통해 문맥으로 활용할 청크들의 하한 점수입니다. 이 기준선을 올리면 질문과 무관한 파일 조각의 유입은 막지만 필요한 정보가 검색에서 제외될 수도 있습니다.',
      },
      bm25Weight: {
        name: 'BM25 가중치 (하이브리드 비율)',
        desc: '의미론적 임베딩 유사도 점수와 키워드 완전 일치(BM25) 스코어를 결합하는 가중치 비율(0~1)입니다. 0은 의미 파악(임베딩)만 하고, 1은 완전 검색어 일치로만 가동됩니다. 공식: (1 - 가중치) × 임베딩 + 가중치 × BM25',
      },
      limit: {
        name: '최대 문맥 청크 주입 수',
        desc: 'RAG 지식 검색에서 결과물로 가져와 프롬프트에 포함시킬 수 있는 최대 청크 개수입니다. 숫자를 늘리면 에이전트가 참고하는 지식폭은 넓어지나 토큰 누적으로 비용이 늘어납니다.',
      },
      linkedMarkdownFiles: {
        name: '연관 마크다운 추가 링크 한도',
        desc: '검색 결과 문서 내부에서 발견된 [[위키링크]]나 마크다운 연결 노트를 추적하여 추가 수집할 마크다운 파일들의 최대 수량입니다.',
      },
      linkedMarkdownDepth: {
        name: '연관 링크 추적 깊이 (홉 수)',
        desc: 'RAG 검색 결과 문서로부터 연관 링크를 몇 단계까지 연속으로 타고 가며 맥락을 보강할지 설정합니다. 1로 두면 직접 연결된 1촌 파일들만 한정하여 포함합니다.',
      },
      manageDb: '임베딩 데이터베이스 관리',
      expandGraph: {
        name: '구조 그래프 융합',
        desc: 'ContextBuilder 검색에 wikilink, backlink, 인접 청크 후보를 포함합니다. 질의마다 추가 노트를 읽을 수 있습니다.',
      },
      rebuildIndexModal: {
        title: '인덱스 재구축: {model}',
        message:
          '정말 모델 "{model}"의 인덱스를 재구축하시겠습니까?\n\n이 작업은 해당 모델로 생성된 모든 기존 임베딩을 비우고 다시 처음부터 생성합니다.',
        cta: '재구축',
      },
      clearIndexModal: {
        title: '인덱스 비우기: {model}',
        message:
          '정말 모델 "{model}"의 모든 기존 임베딩 데이터를 삭제하시겠습니까?',
      },
      excludedFilesModal: {
        title: '제외된 파일 {count}개',
        empty: '제외 패턴과 일치하는 파일이 없습니다',
      },
      includedFilesModal: {
        title: '포함된 파일 {count}개',
        noPatterns:
          '포함 패턴이 지정되지 않았습니다 - 제외 패턴에 해당하는 파일을 제외한 모든 파일이 포함됩니다',
        empty: '포함 패턴과 일치하는 파일이 없습니다',
      },
    },
    search: {
      title: '검색',
      sectionDesc:
        "임베딩 검색과 하이브리드 검색은 임베딩 모델, 하이브리드 비율(BM25 가중치), 리랭커를 함께 씁니다. 임베딩 모델은 이 검색 탭에서 고르고, 비율과 그 밖의 세부 조정은 같은 탭의 '세부 설정'에 있습니다.",
      searchMode: {
        name: '검색 방식 설정',
        desc: '컨텍스트 빌더가 참고 노트를 찾는 기준을 설정합니다. (단순 키워드 매칭 BM25, 의미망 임베딩 검색, 또는 하이브리드) 임베딩/하이브리드는 임베딩 모델 구성이 선행되어야 하며 불가 시 자동으로 BM25로 폴백합니다.',
      },
      searchModeOptions: {
        bm25: 'BM25 전용 (키워드 매칭, 임베딩 불필요)',
        embedding: '임베딩 전용 (의미론적 연산)',
        hybrid: '하이브리드 결합 (의미론적 + 키워드 매칭)',
      },
      bm25TopK: {
        name: 'BM25 검색 노출 수',
        desc: '키워드 매칭 방식의 1차 문서 탐색 시 ContextBuilder가 수집할 상위 결과 개수입니다.',
      },
      candidateMultiplier: {
        name: '후보군 배수 승수',
        desc: '최종 컨텍스트 랭킹을 매기기 전에 1차적으로 넓게 긁어올 초기 키워드 검색 후보 풀(Pool)의 크기 배율입니다.',
      },
      linkExpansionDepth: {
        name: '링크 추적 범위',
        desc: '활성 노트를 기준으로 내부 연결된 링크들을 몇 깊이까지 따라가며 ContextBuilder의 지식망에 미리 등록해둘지 제어합니다.',
      },
      excludePaths: {
        name: '검색 제외 경로',
        desc: '키워드 검색 DB에 원천적으로 추가하지 않을 볼트 상대 경로 목록을 한 줄에 하나씩 명시합니다.',
      },
      excludeTypes: {
        name: '검색 제외 노트 종류',
        desc: '"type" 속성이 여기 적은 값과 같은 노트는 검색 대상에서 뺍니다. 한 줄에 하나씩 적고, 대소문자는 구분하지 않습니다. 기본값은 긴 기계용 데이터가 든 서식 프로파일 노트를 검색 결과에서 빼 줍니다.',
      },
      embeddingModelAndReranker: {
        name: '임베딩 모델 및 리랭커 연동 정보',
        desc: '임베딩 및 하이브리드 결합 검색은 위의 RAG 설정 내 임베딩 모델 지정값, 하이브리드 비율(bm25Weight), 리랭킹 스위치를 그대로 공유하여 동작합니다.',
      },
      relatedNotesAutoRefresh: {
        name: '관련 노트 자동 갱신',
        desc: '활성 노트가 바뀌거나 수정될 때 Related Notes pane을 자동으로 갱신합니다.',
      },
      relatedNotesLimit: {
        name: '관련 노트 후보 검색 수',
        desc: '비슷한 노트와 연관된 노트 순위를 계산할 후보 수입니다. 각 목록은 최대 10건입니다.',
      },
    },
    permissionsSection: {
      title: '도구 실행 권한과 자동 모드',
      defaultPermission: {
        name: '기본 실행 권한',
        desc: '자동화 모드가 완전히 꺼져 있을 때, 쓰기/수정 계열 도구 호출이 발생하면 기본적으로 적용할 안전 잠금 단계입니다.',
      },
      permissionOptions: {
        read_only: '읽기 전용 (쓰기 차단)',
        diff_only: 'Diff 검토 승인 대기',
        approve_write: '수정/쓰기 허용',
        auto: '자동화 모드 시 자동 승인',
        session_trust: '이번 세션 한정 승인 승계',
        forbidden: '금지 (도구 접근 차단)',
      },
      alwaysRequireApproval: {
        name: '항상 수동 승인 대기',
        desc: "자동화 모드가 꺼져 있을 때, 에이전트의 모든 파일 변경 시도를 항상 사용자가 Diff 창에서 눈으로 직접 보고 '적용'을 누르기 전까지 대기시킵니다.",
      },
      autoModeDefault: {
        name: '자동화 모드 자동 켬',
        desc: "매 채팅 세션을 새로 시작할 때 위험하지 않은 경미한 파일 쓰기/생성 도구에 대해 자동으로 '자동화 모드'가 승인된 상태로 진입하게 만듭니다.",
      },
      autoModeTimeout: {
        name: '자동 적용 카운트다운 타이머 (초)',
        desc: "자동화 모드에서 변경 사항(Diff)이 떴을 때, 사용자가 명시적으로 '거부/중단'을 누르지 않으면 몇 초 뒤에 이를 자동으로 안전하게 적용할지 시간을 지정합니다.",
      },
      alwaysConfirmCategories: {
        name: '예외적 항상 확인 대상 카테고리',
        desc: '자동화 모드가 작동 중이더라도 절대 자동으로 넘어가서는 안 되고 무조건 사용자의 버튼 수동 승인을 받아야 할 위험 파일 작업 분류를 쉽표(,)로 구분해 나열합니다.',
      },
      checkpointBeforeWrite: {
        name: '쓰기 직전 백업 롤백 지점 생성',
        desc: '에이전트가 파일 수정 쓰기를 가하기 직전에 현재 파일의 스냅샷(되돌리기 지점)을 확보하도록 보장합니다. 만약 백업 파일 생성을 실패하면 쓰기 자체를 즉시 중단합니다.',
      },
      allowExternalApiTools: {
        name: '외부 인터넷 API 도구 허용',
        desc: '로컬 파일 도구 외에 외부 네트워크 API(external_api 분류) 도구 호출을 수행하도록 허용합니다. 단, 위험 분류의 작업은 여전히 수동 승인 루프를 통과해야 합니다.',
      },
    },
    context: {
      title: '문맥 예산',
      contextBudgetMode: {
        name: '제한 기준 모드',
        desc: 'API 비용 제한이나 속도를 위해 현재 언어 모델의 최대 입력 한계(Max Context)를 그대로 따르거나, 직접 수동으로 토큰 예산 상한선을 두어 활용합니다.',
      },
      contextBudgetOptions: {
        auto: '모델 규격 제한 추적',
        custom: '수동 토큰 상한 규정',
      },
      maxContextTokens: {
        name: '최대 제한 토큰량',
        desc: '수동 토큰 상한 규정 모드에서만 활성화되는 전역 컨텍스트 상한치입니다.',
      },
      splitLargeFiles: {
        name: '대용량 파일 분할 요약 (map-reduce)',
        desc: '큰 파일이나 긴 문서가 에이전트 입력 허용치를 초과하여 입력에서 누락되거나 오류를 내는 대신, 자동으로 잘게 분할 분석하여 최종 핵심 요약문(digest)만 컨텍스트로 전달합니다.',
      },
      attachmentDigestRatio: {
        name: '단일 첨부 분할 요약 전환 비율',
        desc: '개별 첨부 파일 하나가 최대 제한 토큰량 중 이 비율 이상을 잠식하려고 하면 원본을 싣지 않고 즉시 map-reduce 요약 절차로 전환시킵니다.',
      },
      currentNoteMode: {
        name: '활성 노트 맥락 수집 정책',
        desc: '현재 사용자가 주시하고 있는 마크다운 노트 본문을 컨텍스트 빌더가 대화방에 실을 때의 처리 방식입니다.',
      },
      currentNoteModeOptions: {
        auto: '자동 판정',
        fullWhenFits: '허용량 내 전체 포함',
        snippet: '요약 스니펫만 포함',
      },
      currentNoteTokenBudget: {
        name: '활성 노트 전용 토큰 한도',
        desc: '여기에 적힌 한도 크기 이내의 활성 노트는 원본 전체를 실으며, 넘어가면 구조도와 일부 특정 excerpt 정보만 축약하여 읽습니다.',
      },
      reservedOutputTokens: {
        name: '모델 출력용 예약 토큰',
        desc: '입력이 모델의 콘텍스트 윈도우를 꽉 채워 답변 생성이 끊기는 문제를 방지하기 위해, 사전에 답변 출력 몫으로 제외해 놓을 예비 공간의 토큰량입니다.',
      },
      mapReduceChunkRatio: {
        name: '분할 요약 분량 배율',
        desc: '요약 프로세스 실행 시 1회 연산당 탑재할 청크 조각의 비율(0.05~1)입니다. 이 비율을 낮추면 요청당 크기가 작아져 모델 타임아웃 확률은 줄어들지만 호출 총 횟수는 늘어납니다.',
      },
      mapReduceStepTimeout: {
        name: '분할 요약 요청 타임아웃 시간 (ms)',
        desc: '대규모 문서를 분할 분석하는 각 단위 요청에 적용할 독립된 시간 제한 초입니다. 작업 부하가 높은 분석 쿼리이므로 일반 채팅 대화 시간보다 넉넉히 설정하십시오.',
      },
      largeFileConfirmThreshold: {
        name: '대용량 처리 확인 팝업 기준 (청크 수)',
        desc: '분석하려는 전체 파일 크기가 너무 커서 여기서 지정한 수 이상의 분할 호출(API 요청)이 예상될 경우, 예산 보호를 위해 사용자 확인 팝업을 띄웁니다. 0은 무조건 확인 없이 자동 분석합니다.',
      },
      batchCallsPerTurn: {
        name: '턴당 최대 누적 API 호출 횟수',
        desc: '대규모 대량 문서 처리 과정에서 너무 많은 연속 연산이 일어나지 않도록 한 차례 대화당 실행될 최대 누적 모델 호출 수를 제한합니다. 0은 제한하지 않습니다.',
      },
      batchWallTimePerTurn: {
        name: '턴당 누적 실행 시간 제한 (ms)',
        desc: '한 차례의 턴 대화 내에서 백그라운드 대량 문서 작업에 허용할 최대 경과 시간입니다. 이 수치가 지나면 안전하게 작업을 일시중단하고 사용자 대화창을 복구합니다. 0은 무제한입니다.',
      },
      summaryWikiTokenBudget: {
        name: '요약 위키 전용 예산',
        desc: '볼트 요약 위키 폴더에서 탐지된 정리 노트들을 맥락에 우선 공급하기 위해 별도로 확보해 두는 최소 토큰 용량입니다.',
      },
      searchResultTokenBudget: {
        name: '검색 결과 전용 예산',
        desc: 'BM25 키워드 및 연동된 관련 링크 노트를 실을 때 사용하는 최소 전용 토큰 배분량입니다.',
      },
      skillTokenBudget: {
        name: '스킬(Skill) 전용 예산',
        desc: '선택된 Skill 본문을 프롬프트에 넣을 때 허용하는 최대 토큰 수입니다. 본문이 한도를 넘으면 잘리며, 값을 낮추면 문맥 사용량을 줄일 수 있습니다.',
      },
      contextCompaction: {
        name: '콘텍스트 자동 컴팩트(압축)',
        desc: '에이전트 실행 과정 중 중요치 않은 대화 정보를 자동 압축하고 보존하는 코어를 제어합니다. (현재 기본 고정 동작)',
      },
    },
    mcp: {
      title: 'MCP 서버',
      warningCallout:
        '주의: 에이전트가 도구를 작동하면 도구가 출력한 결과물 본문 전체가 그대로 LLM의 입력 콘텍스트(토큰)로 입력됩니다. 도구 출력 내용이 거대할 경우 API 요금과 비용이 급격히 증가할 수 있으므로, 길게 출력될 가능성이 있는 도구들을 다룰 때는 각별히 유의해 주십시오.',
      mobileNotSupported: '모바일 장치에서는 MCP 기능이 지원되지 않습니다.',
      serversTitle: '추가 MCP 서버 목록',
      addButton: 'MCP 서버 등록',
      table: {
        server: '서버명',
        status: '연결 상태',
        enabled: '활성화 여부',
        actions: '동작',
      },
      actionsAria: {
        edit: '편집',
        delete: '삭제',
      },
      empty: '등록된 외부 MCP 서버가 없습니다.',
      editModal: 'MCP 서버 정보 수정',
      deleteConfirm: {
        title: 'MCP 서버 삭제',
        message: '정말 MCP 서버 "{name}"을(를) 삭제하시겠습니까?',
      },
      expanded: {
        tools: '연동 도구 리스트',
        error: '발생한 오류',
      },
      status: {
        connected: '연결됨',
        connecting: '연결 시도 중...',
        error: '오류',
        disconnected: '연결 해제됨',
      },
      tool: {
        enabled: '도구 사용',
        autoExecute: '자동 실행 승인',
      },
      form: {
        name: {
          name: '서버 이름',
          desc: 'MCP 서버를 식별하기 위한 영문 명칭',
          placeholder: "예: 'github'",
        },
        parameters: {
          name: '연동 매개변수 설정',
          desc: 'MCP 서버 프로세스를 생성하고 실행하는 상세 환경을 적은 JSON 양식입니다. 구성 속성:\n- "command": 실행 파일이나 인터프리터 이름 (예: "npx", "node")\n- "args": (선택 사항) 커맨드 라인에 보낼 파라미터 배열\n- "env": (선택 사항) 프로그램 구동에 필수적인 특수 환경 변수의 키-값 쌍',
        },
        validParameters: '유효한 파라미터 형태입니다.',
        errors: {
          nameRequired: '서버 이름을 입력해 주십시오.',
          alreadyExists:
            '동일한 이름을 가진 MCP 서버가 이미 등록되어 있습니다.',
          parametersRequired:
            '연동 설정(JSON 매개변수)은 필수 입력 사항입니다.',
          parametersMustBeJson: '매개변수는 유효한 JSON 형식이어야 합니다.',
          invalidJsonFormat: 'JSON 양식이 유효하지 않습니다.',
          invalidParameters: '올바르지 않은 파라미터 구조입니다.',
          failedToAdd: 'MCP 서버 등록에 실패했습니다.',
        },
      },
    },
    templates: {
      title: '프롬프트 템플릿',
      howToUse:
        "자주 재사용하는 질의나 양식을 템플릿으로 저장해 두면 대화창에서 간편하게 불러올 수 있습니다. 채팅창에 <code>/템플릿-이름</code>을 기입하면 템플릿 텍스트가 바로 본문에 대체 주입됩니다. 또한 대화창 본문의 특정 문장을 블록 드래그하면 등장하는 '템플릿 생성' 단축 버튼으로도 즉시 등록할 수 있습니다.",
      savedTemplates: '저장된 프롬프트 템플릿',
      addButton: '프롬프트 템플릿 만들기',
      table: {
        name: '템플릿명',
        actions: '동작',
      },
      actionsAria: {
        edit: '템플릿 편집',
        delete: '템플릿 삭제',
      },
      loading: '템플릿 목록 로딩 중...',
      empty: '저장된 템플릿이 없습니다.',
      deleteConfirm: {
        title: '템플릿 삭제',
        message: '정말 프롬프트 템플릿 "{name}"을(를) 삭제하시겠습니까?',
      },
      errors: {
        loadFailed: '템플릿 목록 로드 실패. 설정을 다시 새로고침해 보십시오.',
        deleteFailed:
          '템플릿을 삭제하는 데 실패했습니다. 다시 시도해 주십시오.',
      },
    },
    etc: {
      debugMode: {
        name: '디버그 모드',
        desc: '켜면 대화 화면의 실행 기록 반출 단추를 쓸 수 있습니다.',
      },
      storeRunBodies: {
        name: '실행 기록에 본문 저장',
        desc: '새 턴의 실행 기록(Run 기록)에 진단용 본문(서식 작업 계약·분해 판정·선택지 미리보기)을 저장합니다. 대화 내용과 최종 답은 이 설정과 무관하게 저장됩니다. 설정을 바꿔도 이미 저장된 기록은 바뀌지 않습니다.',
      },
      auditLogging: {
        name: '문맥 감사 기록',
        desc: '켜면 대화 화면에 읽기 전용 패널이 생겨 턴마다 검색, 제외, 문맥 밀어내기·압축, 도구 호출의 건수 합계를 보여 줍니다. 프롬프트 원문과 도구 호출 내용은 저장하지 않습니다.',
      },
      title: '기타',
      resetSettings: {
        name: '전체 설정 초기화',
        desc: '모든 설정이 기본값으로 되돌아갑니다. Provider API 키·모델 구성·권한 설정이 초기화되며 되돌릴 수 없습니다.',
        button: '초기화',
        confirm: {
          title: '설정 초기화 진행',
          message:
            '정말 모든 설정을 기본값으로 되돌리시겠습니까? Provider API 키·모델 구성·권한 설정이 초기화되며 되돌릴 수 없습니다.',
          ctaText: '초기화',
          notice: '모든 플러그인 설정이 기본값으로 초기화되었습니다.',
        },
      },
    },
    openSourceLicenses: {
      title: '오픈소스 라이선스',
      desc: 'Verbex는 아래 오픈소스 프로젝트의 일부 또는 수정된 코드를 포함합니다. 저작권 및 MIT 라이선스 고지는 이 화면과 배포되는 플러그인 패키지에 함께 포함되어 있습니다.',
      source: '소스:',
    },
  },
  notices: {
    index: {
      rebuilding: 'Verbex: 볼트 색인을 다시 만드는 중…',
      updating: 'Verbex: 볼트 색인을 갱신하는 중…',
      progress: 'Verbex: 청크 색인 중 {completed} / {total}',
      rateLimited: '(요청 한도가 풀리기를 기다리는 중)',
      rebuilt: 'Verbex: 볼트 색인을 다시 만들었습니다',
      updated: 'Verbex: 볼트 색인을 갱신했습니다',
      embeddingFailed:
        'Verbex: BM25 색인은 갱신했지만 임베딩 색인 갱신에 실패했습니다. 설정에서 임베딩 모델 연결을 확인하세요. 자세한 내용은 개발자 콘솔에 있습니다.',
    },
    context: {
      noQuery: 'Verbex: 텍스트를 선택하거나 질의가 있는 줄에 커서를 두세요.',
      built: 'Verbex: 자료 {count}건으로 컨텍스트를 만들었습니다.',
      failed:
        'Verbex: 컨텍스트를 만들지 못했습니다. 자세한 내용은 개발자 콘솔에 있습니다.',
    },
    chat: {
      loadFailed: '대화를 불러오지 못했습니다.',
      saveFailed: '대화 기록을 저장하지 못했습니다.',
    },
  },
  views: {
    common: {
      paneError: '이 패널을 표시할 수 없습니다. 패널을 다시 열어 보세요.',
    },
    status: {
      title: 'Verbex 상태',
      refresh: '새로 고침',
      skills: '스킬',
      workflows: '워크플로',
      paused: '일시정지',
      errors: '오류',
      bm25Docs: 'BM25 문서',
      vectorFiles: '벡터 파일',
      vectorChunks: '벡터 청크',
      searchIndex: '검색 인덱스',
      noBm25: 'BM25 인덱스가 로드되지 않았습니다.',
      noVector: '벡터 인덱스가 로드되지 않았습니다.',
      vector: '벡터 ({model})',
      storageBreakdown: '저장 공간: {breakdown}',
      contextTrace: '컨텍스트 추적',
      autoContextTokens: '{estimated} / {budget} 자동 컨텍스트 토큰 추정',
      autoContextGauge: '자동 컨텍스트 사용률: {percent}%',
      autoContextHelp:
        '전체 대화 기록이 아니라 최근 ContextBuilder 페이로드를 측정합니다.',
      autoContextBudget:
        '자동 컨텍스트 예산의 {percent}% · 대화 기록과 도구 스키마 제외',
      previewHelp: 'Verbex: 컨텍스트 미리보기를 실행해 검색 근거를 확인하세요.',
      activeRun: '활성 실행',
      adHoc: '임시 실행',
      noWorkflow: '워크플로 없음',
      noActiveRun: '활성 실행이 없습니다.',
      skillsSection: '스킬',
      noSkills: '스킬을 찾지 못했습니다.',
      workflowErrors: '워크플로 오류',
      sources: {
        mentioned: '첨부',
        current_note: '현재 노트',
        wiki: '위키',
        bm25: 'BM25',
        semantic: '시맨틱',
        wikilink: '위키링크',
        backlink: '백링크',
        tag: '태그',
        dataview: 'Dataview',
        base: 'Base',
      },
      readiness: {
        label: '준비 상태',
        ui: 'UI',
        catalog: '카탈로그',
        lexical: 'BM25',
        semantic: '시맨틱',
      },
      providerTools: {
        label: 'Provider 도구',
        registry: 'Provider 레지스트리',
        availableCount: '사용 가능한 도구',
        protocol: '호스트 protocol {protocol} · generation {generation}',
        schema: 'Schema {schema}',
        unavailableHelp: 'Provider 레지스트리를 사용할 수 없습니다.',
        noRegistry: '연결된 Provider 레지스트리가 없습니다.',
        noProviders: '아직 등록된 Provider가 없습니다.',
        states: {
          ready: '사용 가능',
          waiting: '등록 대기',
          unavailable: '사용 불가',
        },
      },
    },
    related: {
      excludeDailyNotes: '일일 노트 제외',
      title: '관련 노트',
      openNoteHelp: '관련 노트를 보려면 Markdown 노트를 여세요.',
      refresh: '새로 고침',
      refreshing: '새로 고치는 중…',
      finding: '관련 노트를 찾는 중…',
      noNotes: '관련 Markdown 노트를 찾지 못했습니다.',
      similar: '비슷한 노트',
      related: '연관된 노트',
      ctrlClickHint:
        'Ctrl/Cmd 키를 누른 채 원을 클릭하면 관련 노트 그림은 그대로 두고 그 노트만 엽니다.',
      signals: {
        vector: '벡터',
        bm25: 'BM25',
        graph: '그래프',
      },
    },
  },
} satisfies typeof en
