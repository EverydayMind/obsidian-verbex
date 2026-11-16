import { L } from '../../i18n/modelText'

export function staleText() {
  return L({
    ko: {
      expired:
        '이 cursor는 만료되었습니다(30분 경과·세션 한도 또는 plugin 재시작). 이전 결과와 합산하지 않습니다. cursor 없이 exhaustive=true로 새 전수 조회를 시작하세요.',
      invalidated:
        '접근 정책이 바뀌어 이 snapshot을 폐기했습니다. 옛 결과를 근거로 쓰지 말고 cursor 없이 exhaustive=true로 새 전수 조회를 시작하세요.',
      mismatch:
        '이 cursor는 다른 대화의 전수 조회에 속해 이번 대화의 coverage에 합산할 수 없습니다. cursor 없이 exhaustive=true로 시작하세요.',
    },
    en: {
      expired:
        'This cursor has expired (30 minutes elapsed, session limit reached or plugin restarted). Do not combine it with previous results. Start a new exhaustive query with exhaustive=true and no cursor.',
      invalidated:
        'This snapshot was discarded because the access policy changed. Do not use old results as evidence; start a new exhaustive query with exhaustive=true and no cursor.',
      mismatch:
        'This cursor belongs to an exhaustive query in another conversation and cannot contribute to coverage in this conversation. Start with exhaustive=true and no cursor.',
    },
  })
}
