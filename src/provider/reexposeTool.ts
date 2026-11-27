import { assertWorkActive } from '../runtime/PluginRuntimeLifecycle'

import { prepareAgentProviderTools } from './prepareAgentProviderTools'

type Prepared = Awaited<ReturnType<typeof prepareAgentProviderTools>>
type Input = Parameters<typeof prepareAgentProviderTools>[1]

export function createReexposeTool(
  ports: Parameters<typeof prepareAgentProviderTools>[0],
  input: Input,
  simple: boolean,
  toolsEnabled: boolean,
  get: () => Prepared,
  set: (prepared: Prepared) => void,
) {
  const attempts = new Map<string, Promise<boolean>>()
  const names: string[] = []
  let pending = Promise.resolve()
  return (name: string) => {
    const previous = attempts.get(name)
    if (previous) return previous
    const attempt = pending.then(async () => {
      assertWorkActive(input.signal)
      const current = get()
      const snapshot = current.providerSnapshot
      if (!snapshot?.observations) return false
      try {
        const next = await prepareAgentProviderTools(
          ports,
          {
            ...input,
            reexpose: {
              names: [...names, name],
              observations: snapshot.observations,
              providerTurnId: current.providerTurnId,
              snapshot,
              budget: current.budgetDecision,
            },
          },
          simple,
          toolsEnabled,
        )
        assertWorkActive(input.signal)
        if (!next.reexposed.includes(name)) return false
        if (
          next.reexposed.some(
            (added) =>
              !snapshot.nativeIdentities?.[added] ||
              snapshot.nativeIdentities[added] !==
                next.providerSnapshot?.nativeIdentities?.[added],
          )
        )
          return false
        if (
          current.exposure.definitions.some(
            (definition) =>
              !next.exposure.definitions.some(
                (item) => item.function.name === definition.function.name,
              ),
          )
        )
          return false
        if (
          Object.entries(snapshot.nativeIdentities ?? {}).some(
            ([key, identity]) =>
              snapshot.toolNames.includes(key) &&
              next.providerSnapshot?.nativeIdentities?.[key] !== identity,
          )
        )
          return false
        names.push(name)
        set(next)
        return true
      } catch {
        assertWorkActive(input.signal)
        return false
      }
    })
    attempts.set(name, attempt)
    pending = attempt.then(
      () => undefined,
      () => undefined,
    )
    return attempt
  }
}
