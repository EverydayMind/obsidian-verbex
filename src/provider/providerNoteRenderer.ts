import type { RequestTool } from '../types/llm/request'

import type { ExposureGateReason } from './interop/exposureGates'
import { nativeProviderNotes } from './interop/exposurePolicy'
import type { NativeTurnScope } from './interop/turnScope'
import type { ProviderRuntime } from './ToolProviderHub'

/**
 * Renders the per-provider note block for an exposure selection. The budget
 * planner calls it with different sets of providers whose instruction text is
 * left out; the final block uses the same function, so what was measured is
 * what is sent.
 */
export function providerNoteRenderer(input: {
  registry: ProviderRuntime | undefined
  jobTurn: {
    policy: { suppress: boolean }
    samplePaths: readonly string[]
  }
  turnPaths: readonly string[]
  turnScope: NativeTurnScope | undefined
  gates: readonly ExposureGateReason[]
}) {
  const { registry, jobTurn, turnPaths, turnScope } = input
  return (
    selection: { definitions: RequestTool[] },
    omit: ReadonlySet<string>,
  ): string => {
    const names = selection.definitions.map((tool) => tool.function.name)
    return nativeProviderNotes(
      (registry?.native?.getEntries() ?? []).filter((entry) =>
        names.includes(entry.name),
      ),
      registry?.native?.instructionsFor(names) ?? [],
      jobTurn.policy.suppress
        ? turnPaths.filter((path) => !jobTurn.samplePaths.includes(path))
        : [...turnPaths],
      jobTurn.policy.suppress &&
        turnScope &&
        jobTurn.samplePaths.includes(turnScope.scope.path)
        ? undefined
        : turnScope,
      input.gates,
      omit,
    )
  }
}
