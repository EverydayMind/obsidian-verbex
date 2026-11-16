import { App, TFile } from 'obsidian'

import type { ToolResult } from '../../core/tools/localToolCommon'
import { t } from '../../i18n'
import { runtimeTimers } from '../../platform/runtime'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'
import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import { RequestTool } from '../../types/llm/request'
import type { ProviderExecutionContext } from '../ProviderRegistry'

import * as modelText from './connectorModelText'
import {
  ConnectorManifest,
  ConnectorTool,
  approvalPayload,
  connectorManifestSchema,
  connectorToolName,
  validateArguments,
} from './manifestSchema'
import { safeSerialize } from './safeSerialize'
import {
  ConnectorTarget,
  dataProperty,
  resolveConnectorTarget,
} from './targetResolver'

export type ConnectorEntry = {
  manifest: ConnectorManifest
  tool: ConnectorTool
  definition: RequestTool
  identity: string
  target: ConnectorTarget
}
export type ConnectorStatus = { id: string; status: string; version?: string }
export type ConnectorAudit = {
  connectorId: string
  tool: string
  targetVersion: string
  generation: number
  bytes: number
  truncated: boolean
  durationMs: number
  vaultEvents: number
}

export class PluginConnectorHost {
  private readonly identities = new WeakMap<object, number>()
  private sequence = 0
  private readonly busy = new Set<string>()
  private readonly quarantined = new Set<string>()
  private entries = new Map<string, ConnectorEntry>()
  private statuses: ConnectorStatus[] = []
  private disposed = false

  constructor(
    private app: App,
    private getManifests: () => readonly ConnectorManifest[],
    private onQuarantine: (id: string) => void = () => {},
  ) {}

  private objectId(object: object): number {
    let identity = this.identities.get(object)
    if (!identity) {
      identity = ++this.sequence
      this.identities.set(object, identity)
    }
    return identity
  }

  private resolve(manifest: ConnectorManifest): ConnectorTarget {
    return resolveConnectorTarget(this.app, manifest, (object) =>
      this.objectId(object),
    )
  }

  async review(raw: unknown) {
    const manifest = connectorManifestSchema.parse(raw)
    const target = this.resolve(manifest)
    for (const tool of manifest.tools)
      if (typeof dataProperty(target.object, tool.method) !== 'function')
        throw new Error(`API method ${tool.method} is unavailable.`)
    const approved = {
      manifestDigest: await canonicalDigest(approvalPayload(manifest)),
      targetVersion: target.version,
    }
    return { manifest, approved }
  }

  async approve(
    raw: unknown,
    reviewedVersion?: string,
  ): Promise<ConnectorManifest> {
    const { manifest, approved } = await this.review(raw)
    if (reviewedVersion && reviewedVersion !== approved.targetVersion)
      throw new Error(t('providerR14.versionChanged'))
    this.quarantined.delete(manifest.id)
    return { ...manifest, approved, enabled: true }
  }

  async refresh(): Promise<ConnectorEntry[]> {
    const entries = new Map<string, ConnectorEntry>()
    const statuses: ConnectorStatus[] = []
    if (this.disposed) return []
    for (const raw of this.getManifests()) {
      try {
        const manifest = connectorManifestSchema.parse(raw)
        if (statuses.some((status) => status.id === manifest.id))
          throw new Error('Duplicate connector id.')
        let status = manifest.enabled
          ? t('providerR14.approvalNeeded')
          : t('providerR14.disabled')
        const target = this.resolve(manifest)
        const digest = await canonicalDigest(approvalPayload(manifest))
        if (
          manifest.enabled &&
          !this.quarantined.has(manifest.id) &&
          manifest.approved?.manifestDigest === digest &&
          manifest.approved.targetVersion === target.version
        ) {
          status = this.busy.has(manifest.id)
            ? t('providerR14.busy')
            : t('providerR14.active')
          for (const tool of manifest.tools) {
            if (tool.options.disabled || !tool.options.agentCallable) continue
            const handler = dataProperty(target.object, tool.method)
            if (typeof handler !== 'function')
              throw new Error(t('providerR14.methodMissing'))
            const name = connectorToolName(manifest, tool)
            const identity = `${digest}:${target.version}:${target.generation}:${this.objectId(target.plugin)}:${target.transientApi ? target.generation : this.objectId(handler)}`
            entries.set(name, {
              manifest,
              tool,
              target,
              identity,
              definition: {
                type: 'function',
                function: {
                  name,
                  description: tool.description,
                  parameters:
                    tool.inputSchema as RequestTool['function']['parameters'],
                },
              },
            })
          }
        }
        statuses.push({
          id: manifest.id,
          status: this.quarantined.has(manifest.id)
            ? t('providerR14.recheck')
            : status,
          version: target.version,
        })
      } catch (error) {
        for (const [name, entry] of entries)
          if (entry.manifest.id === raw.id) entries.delete(name)
        statuses.push({
          id: raw.id,
          status:
            error instanceof Error ? error.message : t('providerR14.error'),
        })
      }
    }
    this.entries = entries
    this.statuses = statuses
    return [...entries.values()]
  }

  getEntries(): ConnectorEntry[] {
    return [...this.entries.values()]
  }
  getStatuses(): ConnectorStatus[] {
    return [...this.statuses]
  }
  hasTool(name: string): boolean {
    return name.startsWith('conn__')
  }
  dispose(): void {
    this.disposed = true
    this.entries.clear()
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
    ctx?: ProviderExecutionContext,
  ): Promise<ToolResult> {
    const started = Date.now()
    try {
      if (this.disposed || ctx?.signal?.aborted)
        throw new Error('Connector call aborted.')
      await this.refresh()
      const entry = this.entries.get(name)
      if (
        !entry ||
        !ctx?.snapshot?.toolNames.includes(name) ||
        ctx.snapshot.connectorIdentities?.[name] !== entry.identity
      )
        throw new Error('Connector is not approved in this turn snapshot.')
      if (!validateArguments(entry.tool.inputSchema, args))
        return {
          kind: 'error',
          message: 'Connector arguments do not match inputSchema.',
          retryAllowed: true,
        }
      const id = entry.manifest.id
      if (this.busy.has(id))
        throw new Error('Previous connector call is still running.')
      const paths: string[] = []
      const callArgs = entry.tool.args.map((binding) => {
        if ('const' in binding) return binding.const
        if ('from' in binding) return args[binding.from]
        const key =
          'vaultPath' in binding ? binding.vaultPath : binding.vaultFile
        const path = assertUserVaultPath(this.app, String(args[key]))
        const file = this.app.vault.getAbstractFileByPath(path)
        if (!(file instanceof TFile))
          throw new Error(`Vault file unavailable: ${path}`)
        paths.push(path)
        return 'vaultPath' in binding ? path : file
      })
      const destination = `plugin://${entry.manifest.target.pluginId}/${id}`
      const manifestDigest = entry.manifest.approved?.manifestDigest
      if (!manifestDigest) throw new Error('Connector approval missing.')
      const providerIdentity = {
        serverConfigHash: manifestDigest,
        connectionGeneration: entry.target.generation,
        toolSchemaHash: await canonicalDigest(entry.tool.inputSchema),
      }
      const execution = await issueLocalPluginCallPermit({
        name,
        args,
        runId: ctx.runId ?? 'connector',
        turnId: ctx.turnId ?? name,
        ...providerIdentity,
        destination,
      })
      await assertExternalCallMatches(execution, {
        name,
        args,
        destination,
        effect: 'vaultRead',
        providerIdentity,
      })
      await this.refresh()
      if (
        ctx.signal?.aborted ||
        this.entries.get(name)?.identity !== entry.identity ||
        this.busy.has(id)
      )
        throw new Error('Connector changed before invocation.')
      const target = this.resolve(entry.manifest)
      const handler = dataProperty(target.object, entry.tool.method) as (
        ...values: unknown[]
      ) => unknown
      consumeAuthorizedExecution(execution, {
        runId: ctx.runId ?? 'connector',
        turnId: ctx.turnId ?? name,
      })
      this.busy.add(id)
      let events = 0
      const refs = ['create', 'modify', 'delete', 'rename'].map((event) =>
        this.app.vault.on(event as 'modify', () => {
          events++
          if (!this.quarantined.has(id)) {
            this.quarantined.add(id)
            this.onQuarantine(id)
          }
        }),
      )
      // Keep the lock and observers until the underlying call, not the race, settles.
      const actual = Promise.resolve()
        .then(() => {
          if (ctx.signal?.aborted || this.disposed || this.quarantined.has(id))
            throw new Error('Connector call aborted.')
          const current = connectorManifestSchema.parse(
            this.getManifests().find((manifest) => manifest.id === id),
          )
          const currentTool = current.tools.find(
            (tool) => tool.name === entry.tool.name,
          )
          const resolved = this.resolve(current)
          if (
            !current.enabled ||
            currentTool?.options.disabled ||
            !currentTool?.options.agentCallable ||
            current.approved?.manifestDigest !==
              entry.manifest.approved?.manifestDigest ||
            current.approved?.targetVersion !== resolved.version ||
            resolved.identityObject !== target.identityObject ||
            resolved.plugin !== target.plugin ||
            (!target.transientApi &&
              dataProperty(resolved.object, entry.tool.method) !== handler) ||
            JSON.stringify(approvalPayload(current)) !==
              JSON.stringify(approvalPayload(entry.manifest))
          )
            throw new Error('Connector changed at invocation boundary.')
          return Reflect.apply(
            dataProperty(resolved.object, entry.tool.method) as (
              ...values: unknown[]
            ) => unknown,
            resolved.object,
            callArgs,
          )
        })
        .finally(() => {
          this.busy.delete(id)
          refs.forEach((ref) => this.app.vault.offref(ref))
        })
      let timer: ReturnType<typeof runtimeTimers.setTimeout> | undefined
      let abort: (() => void) | undefined
      let value: unknown
      try {
        value = await Promise.race([
          actual,
          new Promise<never>((_, reject) => {
            timer = runtimeTimers.setTimeout(
              () =>
                reject(
                  new Error(
                    'Connector timeout; target call may still be running.',
                  ),
                ),
              entry.tool.timeoutMs,
            )
            abort = () =>
              reject(
                new Error(
                  'Connector call aborted; target call may still be running.',
                ),
              )
            if (ctx.signal?.aborted) abort()
            else ctx.signal?.addEventListener('abort', abort, { once: true })
          }),
        ])
      } finally {
        runtimeTimers.clearTimeout(timer)
        if (abort) ctx.signal?.removeEventListener('abort', abort)
      }
      if (ctx.signal?.aborted || this.disposed)
        throw new Error('Connector result discarded after abort.')
      const result = safeSerialize(value, entry.tool.result)
      if (entry.tool.result.pathField) {
        const values = Array.isArray(result.value)
          ? result.value
          : [result.value]
        for (const item of values) {
          if (!item || typeof item !== 'object') continue
          const path = (item as Record<string, unknown>)[
            entry.tool.result.pathField
          ]
          if (typeof path === 'string')
            paths.push(assertUserVaultPath(this.app, path))
        }
      }
      const canonicalPaths = [...new Set(paths)]
      const audit: ConnectorAudit = {
        connectorId: id,
        tool: name,
        targetVersion: target.version,
        generation: target.generation,
        bytes: new TextEncoder().encode(result.text).byteLength,
        truncated: result.truncated,
        durationMs: Date.now() - started,
        vaultEvents: events,
      }
      ctx.onConnectorAudit?.(audit)
      return {
        kind: 'read',
        connectorAudit: audit,
        text: modelText.connectorResult(
          id,
          entry.tool.name,
          target.version,
          result.text,
          String(result.truncated),
          events ? modelText.connectorVaultEvents(events) : '',
        ),
        evidencePaths: canonicalPaths,
        disclosure: {
          connectorId: id,
          canonicalVaultPaths: canonicalPaths,
          unattributedFiles:
            entry.tool.effect === 'read' && canonicalPaths.length === 0 ? 1 : 0,
        },
      }
    } catch (error) {
      return {
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Connector call failed.',
      }
    }
  }
}
