import { L } from '../../i18n/modelText'

export function resultError(key: keyof ReturnType<typeof messages>): string {
  return messages()[key]
}

function messages() {
  return {
    object: L({
      ko: '도구 결과가 객체가 아닙니다.',
      en: 'Tool result is not an object.',
    }),
    content: L({
      ko: '도구 결과에 content 배열이 없습니다.',
      en: 'Tool result has no content array.',
    }),
    text: L({
      ko: '도구 결과는 text content만 지원합니다.',
      en: 'Tool results support only text content.',
    }),
    boolean: L({
      ko: 'isError는 boolean이어야 합니다.',
      en: 'isError must be a boolean.',
    }),
    structured: L({
      ko: 'structuredContent는 객체여야 합니다.',
      en: 'structuredContent must be an object.',
    }),
    meta: L({ ko: '_meta는 객체여야 합니다.', en: '_meta must be an object.' }),
    path: L({
      ko: '결과 경로가 문자열이 아닙니다.',
      en: 'Result path is not a string.',
    }),
    resource: L({
      ko: 'resource는 객체여야 합니다.',
      en: 'resource must be an object.',
    }),
    evidence: L({
      ko: 'evidencePaths는 256개 이하의 배열이어야 합니다.',
      en: 'evidencePaths must be an array of at most 256 entries.',
    }),
    error: L({
      ko: 'error는 객체여야 합니다.',
      en: 'error must be an object.',
    }),
  }
}

export function unsupportedResultField(key: string): string {
  return L({
    ko: `도구 결과에 지원하지 않는 필드가 있습니다: ${key}`,
    en: `Tool result contains an unsupported field: ${key}`,
  })
}

export function truncatedResult(full: string, limit: number): string {
  return L({
    ko: `${full.slice(0, limit)}\n[결과가 ${limit}자에서 잘렸습니다. 범위를 좁혀 다시 읽으세요.]`,
    en: `${full.slice(0, limit)}\n[Result truncated at ${limit} characters. Narrow the scope and read again.]`,
  })
}
