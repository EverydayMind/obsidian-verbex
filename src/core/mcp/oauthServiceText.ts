import { L } from '../../i18n/modelText'

export function loginRequired() {
  return L({
    ko: 'OAuth 로그인이 필요합니다. MCP 설정의 로그인 버튼을 눌러주세요.',
    en: 'OAuth login is required. Click the login button in MCP settings.',
  })
}

export function expired() {
  return L({
    ko: 'OAuth 인증이 만료됐습니다. MCP 설정에서 다시 로그인하세요.',
    en: 'OAuth authorization has expired. Log in again from MCP settings.',
  })
}

export function secretChanged() {
  return L({
    ko: 'OAuth 비밀 항목이 변경됐습니다. 다시 로그인하세요.',
    en: 'The OAuth secret changed. Log in again.',
  })
}

export function disposed() {
  return L({
    ko: 'OAuth 서비스가 종료되었습니다.',
    en: 'The OAuth service has shut down.',
  })
}

export function nodeRequired() {
  return L({
    ko: 'OAuth는 Node.js 20 이상의 Obsidian 데스크톱이 필요합니다.',
    en: 'OAuth requires Obsidian desktop with Node.js 20 or later.',
  })
}

export function busy() {
  return L({
    ko: 'OAuth 작업이 이미 진행 중입니다.',
    en: 'An OAuth operation is already in progress.',
  })
}

export function cancelled() {
  return L({
    ko: 'OAuth 작업이 취소되었거나 시간이 만료됐습니다. 다시 로그인하거나 연결하세요.',
    en: 'The OAuth operation was cancelled or timed out. Log in or connect again.',
  })
}

export function issuerMismatch() {
  return L({
    ko: 'OAuth issuer 검증에 실패했습니다. 서버 인증 설정을 확인하세요.',
    en: 'OAuth issuer validation failed. Check the server authentication settings.',
  })
}

export function registrationRejected() {
  return L({
    ko: '서버가 DCR 등록을 거부했습니다. 서버의 클라이언트 등록 지원을 확인하세요.',
    en: 'The server rejected DCR registration. Check its client registration support.',
  })
}

export function authorizationFailed() {
  return L({
    ko: 'OAuth 인증에 실패했습니다. 다시 로그인하고 서버의 인증 설정을 확인하세요.',
    en: 'OAuth authorization failed. Log in again and check the server authentication settings.',
  })
}
