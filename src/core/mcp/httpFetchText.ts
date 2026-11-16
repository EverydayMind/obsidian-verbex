import { L } from '../../i18n/modelText'

export function urlFormat() {
  return L({
    ko: 'MCP URL은 사용자 정보와 fragment가 없는 HTTP(S) 주소여야 합니다.',
    en: 'The MCP URL must be an HTTP(S) address without user information or a fragment.',
  })
}

export function httpsRequired() {
  return L({
    ko: '원격 MCP는 HTTPS를 사용하세요. HTTP는 localhost에서만 지원합니다.',
    en: 'Use HTTPS for remote MCP servers. HTTP is supported only on localhost.',
  })
}

export function requestTooLarge() {
  return L({
    ko: 'MCP HTTP 요청이 크기 제한을 초과했습니다.',
    en: 'The MCP HTTP request exceeds the size limit.',
  })
}

export function redirect() {
  return L({
    ko: 'MCP URL이 다른 주소로 이동합니다. 최종 endpoint URL을 입력하세요.',
    en: 'The MCP URL redirects to another address. Enter the final endpoint URL.',
  })
}

export function responseTooLarge() {
  return L({
    ko: 'MCP HTTP 응답이 크기 제한을 초과했습니다.',
    en: 'The MCP HTTP response exceeds the size limit.',
  })
}

export function aborted() {
  return L({
    ko: 'MCP HTTP 응답이 중단됐습니다.',
    en: 'The MCP HTTP response was aborted.',
  })
}

export function closed() {
  return L({
    ko: 'MCP HTTP 응답이 완료 전에 닫혔습니다.',
    en: 'The MCP HTTP response closed before completion.',
  })
}

export function timeout() {
  return L({
    ko: 'MCP HTTP 연결 시간이 초과됐습니다.',
    en: 'The MCP HTTP connection timed out.',
  })
}
