import { Platform } from 'obsidian'

import { L } from '../../i18n/modelText'
import { ChatModel } from '../../types/chat-model.types'
import {
  LLMOptions,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
} from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../../types/llm/response'
import { LLMProvider } from '../../types/provider.types'
import { TlsOptions } from '../../utils/llm/httpTransport'

import { ModelDiscoveryUnsupportedError } from './modelDiscovery.errors'
import { ProviderModelListResult } from './modelDiscovery.types'

export type ConnectionTestResult = {
  ok: boolean
  message: string
}

// TODO: do these really have to be class? why not just function?
export abstract class BaseLLMProvider<P extends LLMProvider> {
  protected readonly provider: P
  constructor(provider: P) {
    this.provider = provider
  }

  protected getTlsOptions(): TlsOptions | undefined {
    if (!Platform.isDesktopApp) return undefined
    const path = this.provider.tlsCaCertPath?.trim()
    if (!path && !this.provider.tlsSkipVerify) return undefined
    const tls: TlsOptions = {}
    if (path) {
      try {
        // Desktop-only: mobile must not load Node's filesystem module.
        const fs = require('fs') as typeof import('fs')
        tls.caCerts = [fs.readFileSync(path, 'utf8')]
      } catch (error) {
        throw new Error(
          L({
            ko: `공급자 ${this.provider.id}의 CA 인증서 파일을 읽을 수 없습니다: ${path}. ${String(error)}`,
            en: `Could not read CA certificate for provider ${this.provider.id}: ${path}. ${String(error)}`,
          }),
        )
      }
    }
    if (this.provider.tlsSkipVerify) tls.rejectUnauthorized = false
    return tls
  }

  abstract generateResponse(
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming>

  abstract streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>>

  abstract getEmbedding(
    model: string,
    text: string,
    options?: { dimensions?: number; signal?: AbortSignal },
  ): Promise<number[]>

  async getEmbeddings(
    model: string,
    texts: string[],
    options?: { dimensions?: number; signal?: AbortSignal },
  ): Promise<number[][]> {
    return Promise.all(
      texts.map((text) => this.getEmbedding(model, text, options)),
    )
  }

  /**
   * Auto-discover available models from the provider (e.g. OpenAI/LM Studio
   * `GET /v1/models`, Ollama `GET /api/tags`). Providers that expose such an
   * endpoint override this and return raw entries + `source: 'remote'` (or
   * `'curated'` for a known-model fallback); normalization into settings
   * identities happens at the discovery boundary, not here. The default
   * throws `ModelDiscoveryUnsupportedError` so callers can distinguish "this
   * provider has no discovery endpoint" from a failed discovery attempt.
   */
  async listModels(_options?: {
    signal?: AbortSignal
  }): Promise<ProviderModelListResult> {
    throw new ModelDiscoveryUnsupportedError(
      'Automatic model discovery is not available for this provider. Enter the model id manually.',
    )
  }

  /**
   * Lightweight connection test for the settings UI. Providers that can
   * cheaply validate credentials / reachability override this. The default
   * reports that no test is available yet (e.g. providers whose full client
   * lands in M4).
   */
  async testConnection(_model?: ChatModel): Promise<ConnectionTestResult> {
    return {
      ok: false,
      message:
        'Connection test is not available for this provider yet. It will be enabled when the full client lands (M4).',
    }
  }
}
