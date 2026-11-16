import type {
  OAuthClientInformationContext,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client'

import { L } from '../../i18n/modelText'

import { validateMcpUrl } from './httpFetch'
import type { OAuthRecord } from './oauthStore'

/** SDK owns discovery/DCR/PKCE/issuer checks; this provider owns storage and UX. */
export class McpOAuthProvider implements OAuthClientProvider {
  private verifier?: string
  private discovery?: OAuthDiscoveryState
  constructor(
    private record: OAuthRecord,
    readonly redirectUrl: string,
    private persist: (record: OAuthRecord) => void,
    private redirect: (url: URL) => void,
    private stateValue?: string,
  ) {
    this.discovery = record.discovery
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Verbex',
      application_type: 'native',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }
  }
  state() {
    if (!this.stateValue)
      throw new Error(
        L({
          ko: 'OAuth 로그인 버튼을 눌러주세요.',
          en: 'Click the OAuth login button.',
        }),
      )
    return this.stateValue
  }
  clientInformation(ctx?: OAuthClientInformationContext) {
    return ctx ? this.record.clients[ctx.issuer] : undefined
  }
  saveClientInformation(
    info: StoredOAuthClientInformation,
    ctx?: OAuthClientInformationContext,
  ) {
    const issuer = ctx?.issuer ?? info.issuer
    if (!issuer || issuer !== info.issuer)
      throw new Error(
        L({
          ko: 'OAuth 클라이언트 issuer가 없습니다.',
          en: 'The OAuth client issuer is missing.',
        }),
      )
    this.save({
      ...this.record,
      clients: { ...this.record.clients, [issuer]: info },
    })
  }
  tokens(ctx?: OAuthClientInformationContext) {
    return !ctx || this.record.tokens?.issuer === ctx.issuer
      ? this.record.tokens
      : undefined
  }
  saveTokens(tokens: StoredOAuthTokens, ctx?: OAuthClientInformationContext) {
    if (
      !tokens.issuer ||
      (ctx && tokens.issuer !== ctx.issuer) ||
      tokens.token_type.toLowerCase() !== 'bearer'
    )
      throw new Error(
        L({
          ko: 'OAuth 토큰의 issuer 또는 bearer 형식이 올바르지 않습니다.',
          en: 'Invalid OAuth token issuer or bearer format.',
        }),
      )
    this.save({
      ...this.record,
      tokens,
      discovery: this.discovery,
      redirectUrl: this.redirectUrl,
      expiresAt:
        tokens.expires_in === undefined
          ? undefined
          : Date.now() + tokens.expires_in * 1000,
    })
  }
  saveCodeVerifier(verifier: string) {
    this.verifier = verifier
  }
  codeVerifier() {
    if (!this.verifier)
      throw new Error(
        L({
          ko: 'OAuth PKCE 검증 값이 없습니다.',
          en: 'The OAuth PKCE verifier is missing.',
        }),
      )
    return this.verifier
  }
  saveDiscoveryState(state: OAuthDiscoveryState) {
    const issuer =
      state.authorizationServerMetadata?.issuer ?? state.authorizationServerUrl
    if (
      state.authorizationServerMetadata &&
      !state.authorizationServerMetadata.registration_endpoint &&
      !this.record.clients[issuer]
    )
      throw new Error(
        L({
          ko: '서버가 DCR 등록 endpoint를 제공하지 않습니다. 서버의 OAuth 클라이언트 등록 지원을 확인하세요.',
          en: 'The server does not provide a DCR registration endpoint. Check its OAuth client registration support.',
        }),
      )
    this.discovery = state
  }
  discoveryState() {
    return this.discovery
  }
  redirectToAuthorization(url: URL) {
    this.redirect(validateMcpUrl(url.href))
  }
  invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery',
  ) {
    if (scope === 'all' || scope === 'verifier') this.verifier = undefined
    if (scope === 'all' || scope === 'discovery') this.discovery = undefined
    this.save({
      ...this.record,
      ...(scope === 'all' || scope === 'client' ? { clients: {} } : {}),
      ...(scope === 'all' || scope === 'tokens'
        ? { tokens: undefined, expiresAt: undefined }
        : {}),
      ...(scope === 'all' || scope === 'discovery'
        ? { discovery: undefined }
        : {}),
    })
  }
  private save(record: OAuthRecord) {
    this.persist(record)
    this.record = record
  }
}
