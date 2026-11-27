import {
  type OwnershipEnvironment,
  checkDocumentOwnership,
} from './checkDocumentOwnership'
import type { DiagnosticSpan, InteropDiagnostics } from './interop/diagnostics'
import {
  type DocumentOwner,
  type OwnershipOptions,
  type OwnershipQueryResult,
  ownershipKey as key,
} from './ownershipTypes'
import type { ProviderExecutionContext } from './providerTurnTypes'

type Writer = { kind: 'native'; providerId: string }

/** Cross-provider working-copy ownership. Reads remain unrestricted. No document-format logic. */
export class DocumentOwnershipPolicy {
  private readonly companionScopes = new Map<
    object,
    { runId: string; path: string }
  >()
  constructor(
    private readonly nativeDocuments: (
      exceptProviderId?: string,
      trace?: DiagnosticSpan,
    ) => Promise<DocumentOwner[] | OwnershipQueryResult>,
    private readonly companionDocuments: (
      targetPath?: string,
    ) => Promise<string[]> = () => Promise.resolve([]),
    private readonly diagnostics?: InteropDiagnostics,
    private readonly environment: OwnershipEnvironment = {},
  ) {}

  /** Hold a submitted companion scope for the actual call, including approval wait. */
  register(context?: ProviderExecutionContext): () => void {
    const lease = {}
    if (context?.runId && context.scope?.path)
      this.companionScopes.set(lease, {
        runId: context.runId,
        path: key(context.scope.path),
      })
    return () => {
      this.companionScopes.delete(lease)
    }
  }
  release(runId: string): void {
    for (const [lease, scope] of this.companionScopes)
      if (scope.runId === runId) this.companionScopes.delete(lease)
  }

  async assertAvailable(
    path: string,
    writer: Writer,
    options?: OwnershipOptions,
  ): Promise<void> {
    if (this.diagnostics)
      return this.diagnostics.measure(
        'ownership',
        {
          path,
          providerId: writer.providerId,
        },
        (trace) => this.checkAvailable(path, writer, options, trace),
      )
    return this.checkAvailable(path, writer, options)
  }

  private async checkAvailable(
    path: string,
    writer: Writer,
    options?: OwnershipOptions,
    trace?: DiagnosticSpan,
  ): Promise<void> {
    return checkDocumentOwnership({
      path,
      writer,
      options,
      trace,
      environment: this.environment,
      diagnostics: this.diagnostics,
      nativeDocuments: this.nativeDocuments,
      companionDocuments: async (target) => [
        ...[...this.companionScopes.values()].map((scope) => scope.path),
        ...(await this.companionDocuments(target)),
      ],
    })
  }
}
