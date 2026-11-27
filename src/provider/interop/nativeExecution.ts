import type { App } from 'obsidian'

import type { AgentToolOutcome } from '../../core/llm/toolOutcome'
import { L } from '../../i18n/modelText'
import {
  aiPrivateErrorOutcome,
  aiPrivateRefusalOutcome,
  findAiPrivateArg,
  refusingAiPrivate,
} from '../../security/aiPrivateRefusal'
import type { OwnershipOptions } from '../ownershipTypes'
import type { ProviderExecutionContext } from '../providerTurnTypes'

import { commitAllowed } from './commitPolicy'
import type { DiagnosticSpan } from './diagnostics'
import { runNativeEffect } from './effectDispatch'
import type { HostBlockGuard } from './hostBlockGuard'
import type { OwnershipBlockState } from './hostBlockState'
import { hiddenToolRefusal } from './hostCapabilities/toolAvailabilityText'
import type { NativeHostOptions } from './hostOptions'
import type { Discovered, NativeToolEntry } from './hostScan'
import { nativeEffectOptions } from './nativeEffectOptions'
import { nativeExecutionFailure as failed } from './nativeExecutionFailure'
import {
  snapshotNativeToolArgs,
  validateNativeToolArgs,
} from './nativeToolArgs'
import { providerCallCancelled } from './providerCallError'
import type { ProviderRuntimeState } from './providerRuntimeState'
import type { SessionGrantStore } from './sessionGrants'

type NativeExecutionHost = {
  app: App
  disposed: boolean
  busy: Set<string>
  entries: () => ReadonlyMap<string, NativeToolEntry>
  discovered: () => ReadonlyMap<string, Discovered>
  runtimeState: ProviderRuntimeState
  options: NativeHostOptions
  grants: SessionGrantStore
  refresh: (signal?: AbortSignal) => Promise<void>
  isCurrent: (found: Discovered, name?: string) => boolean
  /** Read live (host-capabilities-v1 section 8): hidden tool name -> reason. */
  hiddenTools?: () => ReadonlyMap<string, string>
  blockState: OwnershipBlockState
  blockGuard: HostBlockGuard
}

/** Validate the turn identity and arguments before consulting host block memory. */
export async function executeNativeCall(
  host: NativeExecutionHost,
  name: string,
  inputArgs: Record<string, unknown>,
  ctx: ProviderExecutionContext,
  trace: DiagnosticSpan,
): Promise<AgentToolOutcome> {
  try {
    if (host.disposed || ctx.signal?.aborted)
      return failed(providerCallCancelled())
    const input = snapshotNativeToolArgs(inputArgs)
    if (input.problem) return failed(input.problem, true)
    const privatePath = findAiPrivateArg(input.args)
    if (privatePath) return aiPrivateRefusalOutcome(privatePath)
    await host.refresh(ctx.signal)
    const entry = host.entries().get(name)
    if (
      !entry ||
      !ctx.snapshot?.toolNames.includes(name) ||
      ctx.snapshot.nativeIdentities?.[name] !== entry.identity
    )
      return failed(
        L({
          ko: '이 플러그인 도구는 이번 턴에 승인된 상태가 아닙니다. 다시 요청하세요.',
          en: 'This plugin tool is not approved for this turn. Request it again.',
        }),
      )
    const found = host.discovered().get(entry.providerId)
    if (!found)
      return failed(
        L({
          ko: '플러그인 도구를 사용할 수 없습니다.',
          en: 'The plugin tool is unavailable.',
        }),
      )
    if (host.hiddenTools?.().has(name)) return failed(hiddenToolRefusal(name))
    const { args, problem } = validateNativeToolArgs(input.args, entry.tool)
    if (problem) return failed(problem, true)
    const providerId = entry.providerId
    if (host.busy.has(providerId))
      return failed(
        L({
          ko: '같은 플러그인의 이전 호출이 아직 끝나지 않았습니다.',
          en: 'The previous call to the same plugin has not finished yet.',
        }),
        true,
      )
    const call = {
      trace,
      app: host.app,
      busy: host.busy,
      selfId: host.options.selfId ?? 'verbex',
      vaultPath: refusingAiPrivate(
        host.options.vaultPath ?? ((path: string) => path),
      ),
      name,
      tool: entry.tool,
      handle: found.handle,
      digest: found.digest,
      generation: found.generation,
      args,
      ctx,
      current: () =>
        host.isCurrent(found, entry.tool.name) &&
        (entry.tool.effect !== 'commit' ||
          commitAllowed(
            host.options,
            found,
            entry.tool,
            entry.policyRevision,
          )) &&
        (entry.tool.effect !== 'browser' ||
          host.options.browserEffects?.() === true),
      assertOwnership: (path: string, options?: OwnershipOptions) =>
        host.blockState.assertOwnership(
          () =>
            host.options.assertOwnership?.(path, providerId, options) ??
            Promise.resolve(),
          providerId,
        ),
      reportFault: () => host.runtimeState.block(found.handle),
      callTimeoutMs: host.options.callTimeoutMs,
    }
    return await host.blockGuard.run(name, args, ctx, () =>
      runNativeEffect(
        call,
        nativeEffectOptions(
          call,
          host.options,
          found.descriptor.provider.name,
          host.grants,
          entry.policyRevision,
        ),
      ),
    )
  } catch (error) {
    return (
      aiPrivateErrorOutcome(error) ??
      failed(
        error instanceof Error
          ? error.message
          : L({ ko: '플러그인 도구 호출 실패', en: 'Plugin tool call failed' }),
      )
    )
  }
}
