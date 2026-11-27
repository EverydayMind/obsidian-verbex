import { toolFailed } from '../core/llm/toolOutcome'
import {
  SIMPLE_CORE_TOOL_NAMES,
  TOOL_REGISTRY,
  canonicalToolName,
} from '../core/tools/toolDefinitions'
import { L } from '../i18n/modelText'

import { hiddenToolRefusal } from './interop/hostCapabilities/toolAvailabilityText'
import { bridgeForRetiredTool, retiredToolFact } from './interop/knownBridges'
import { nativeToolName } from './interop/protocol'
import {
  retiredReplacementFact,
  retiredToolReplacement,
} from './interop/retiredTools'
import type { ProviderRegistrySnapshot } from './providerTurnTypes'
import type { ProviderRuntime } from './ToolProviderHub'

export type ExposureRefusal =
  | 'unknown'
  | 'not_ready'
  | 'excluded'
  | 'not_exposed'
  | 'budget_demoted'
  | 'provider_unavailable'
  | 'undetermined'

export function classifyToolExposure(
  name: string,
  registry: ProviderRuntime | undefined,
  snapshot: ProviderRegistrySnapshot | undefined,
  excluded: readonly string[],
  fixed: readonly string[],
  toolsEnabled = true,
): ExposureRefusal {
  name = canonicalToolName(name)
  // Host-only tools: a person's button reaches them, never a model call.
  if (name === 'export_census_report' || name === 'replace_starter_skill')
    return 'unknown'
  if (!toolsEnabled) return 'undetermined'
  try {
    // Hidden by the providing plugin (host-capabilities-v1 section 8).
    if (registry?.native?.availability?.hidden().has(name))
      return 'provider_unavailable'
    const builtin = !!TOOL_REGISTRY[name]
    const ready = builtin
      ? registry?.nativeToolReady?.(name) !== false
      : !!snapshot &&
        (name in (snapshot.nativeIdentities ?? {}) ||
          name in (snapshot.connectorIdentities ?? {}) ||
          name in (snapshot.mcpIdentities ?? {}))
    const statuses = registry?.native?.getStatuses()
    const knownNative = statuses?.some((status) =>
      status.descriptor?.tools.some(
        (tool) => nativeToolName(status.providerId, tool.name) === name,
      ),
    )
    if (!builtin && !ready && knownNative)
      return snapshot ? 'not_ready' : 'undetermined'
    if (!builtin && !ready)
      return registry &&
        snapshot &&
        statuses &&
        statuses.every((status) => status.descriptor)
        ? 'unknown'
        : 'undetermined'
    if (!ready) return 'not_ready'
    if (
      excluded.map(canonicalToolName).includes(name) &&
      !fixed.map(canonicalToolName).includes(name) &&
      !SIMPLE_CORE_TOOL_NAMES.has(name)
    )
      return 'excluded'
    return snapshot?.budgetDemoted?.includes(name)
      ? 'budget_demoted'
      : 'not_exposed'
  } catch {
    return 'undetermined'
  }
}

export function exposureRefusalMessage(
  name: string,
  reason: ExposureRefusal,
): string {
  if (name === 'context_candidates')
    return L({
      ko: 'context_candidates는 search_vault로 합쳐졌습니다. 의미 검색까지 섞으려면 search_vault(include_semantic: true)를 호출하세요.',
      en: 'context_candidates has been merged into search_vault. To include semantic search, call search_vault(include_semantic: true).',
    })
  // A name that moved into a Bridge says so (knownBridges.json), whatever the
  // reason is; the classification itself stays `unknown`.
  const bridge =
    reason === 'unknown' || reason === 'undetermined'
      ? bridgeForRetiredTool(name)
      : undefined
  if (bridge) return retiredToolFact(name, bridge)
  const replaced =
    reason === 'unknown' || reason === 'undetermined'
      ? retiredToolReplacement(name)
      : undefined
  if (replaced) return retiredReplacementFact(name, replaced)
  switch (reason) {
    case 'unknown':
      return L({
        ko: `${name} 도구는 등록되지 않아 실행하지 않았습니다.`,
        en: `Tool ${name} was not executed because it is not registered.`,
      })
    case 'not_ready':
      return L({
        ko: `${name} 도구는 승인되지 않았거나 준비되지 않아 실행하지 않았습니다.`,
        en: `Tool ${name} was not executed because it is unapproved or not ready.`,
      })
    case 'excluded':
      return L({
        ko: `${name} 도구는 이 대화에서 제외되어 실행하지 않았습니다.`,
        en: `Tool ${name} was not executed because it is excluded from this conversation.`,
      })
    case 'not_exposed':
      return L({
        ko: `${name} 도구는 승인·준비되었지만 이번 요청의 도구 정의에 포함되지 않아 실행하지 않았습니다. 이번 턴에는 실행할 수 없습니다. 사용자가 채팅의 도구 선택에서 이 도구를 고정하거나 요청을 다시 보내면 포함될 수 있습니다(보장은 아닙니다). 지금은 실행하지 못한 사실과 이 조치를 사용자에게 알리세요.`,
        en: `Tool ${name} is approved and ready but was not executed because it is absent from this request's tool definitions. It cannot run in this turn. The user can pin it in the chat tool selector or resubmit the request; this may include it (not guaranteed). Report the non-execution and this action to the user now.`,
      })
    case 'budget_demoted':
      return L({
        ko: `${name} 도구는 이번 요청의 입력 예산 때문에 이번 턴에서 제외되어 실행하지 않았습니다. 이번 턴에는 실행할 수 없습니다. 이 사실과 사용자가 요청을 다시 보내거나 범위를 줄일 수 있다는 점을 알리세요.`,
        en: `Tool ${name} was not executed: it was left out of this turn by the request input budget. It cannot run in this turn. Report this to the user and that they can resend the request or narrow its scope.`,
      })
    case 'provider_unavailable':
      return hiddenToolRefusal(name)
    case 'undetermined':
      return L({
        ko: `${name} 도구가 이번 요청에 포함되지 않은 원인을 확인하지 못해 실행하지 않았습니다.`,
        en: `Tool ${name} was not executed; the reason it is missing from this request could not be determined.`,
      })
  }
}

export function refusedTool(
  name: string,
  reason: ExposureRefusal,
  reexposed = false,
) {
  if (name === 'context_candidates')
    return toolFailed(exposureRefusalMessage(name, reason), {
      mutationScope: 'none',
    })
  return toolFailed(
    reexposed
      ? L({
          ko: `${name} 도구는 이번 요청의 도구 정의에 없어 이 호출은 실행하지 않았습니다. 다음 호출부터 이 도구가 정의에 포함됩니다. 같은 호출을 다시 하세요.`,
          en: `Tool ${name} was not executed because it is absent from this request's tool definitions. It will be included from the next call. Repeat the same call.`,
        })
      : exposureRefusalMessage(name, reason),
    {
      mutationScope: 'none',
    },
  )
}
