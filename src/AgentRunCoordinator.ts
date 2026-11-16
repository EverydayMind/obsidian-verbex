import type { AgentExecutionPorts } from './agentExecutionPorts'
import { AgentRunExecution } from './AgentRunExecution'
import { observeChatUsage } from './core/llm/usageObserver'
import { observeRunExposure } from './provider/interop/observeRunExposure'
import type { PluginRuntimeLifecycle } from './runtime/PluginRuntimeLifecycle'

type AgentRunInput = Parameters<AgentRunExecution['run']>[0]

/** Stable facade kept for controller callers while execution is isolated. */
export class AgentRunCoordinator {
  private readonly execution: AgentRunExecution

  constructor(
    private readonly ports: AgentExecutionPorts,
    private readonly lifecycle?: PluginRuntimeLifecycle,
  ) {
    this.execution = new AgentRunExecution(ports)
  }

  async run(input: AgentRunInput) {
    const execute = async (signal: AbortSignal | undefined) => {
      const stop =
        signal && input.onChatUsage
          ? observeChatUsage(signal, input.onChatUsage)
          : undefined
      const diagnostics = this.ports.providerRegistry?.native?.diagnostics
      const stopExposure =
        signal && diagnostics
          ? observeRunExposure(signal, diagnostics, input.runId)
          : undefined
      try {
        return await this.execution.run({ ...input, signal })
      } finally {
        stop?.()
        stopExposure?.()
      }
    }
    return this.lifecycle
      ? this.lifecycle.runWork(input.signal, execute)
      : input.onChatUsage ||
          (input.signal && this.ports.providerRegistry?.native?.diagnostics)
        ? execute(input.signal)
        : this.execution.run(input)
  }
}
