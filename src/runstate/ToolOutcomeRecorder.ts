import type { WorkflowDefinition } from '../verbex/types'
import type { ChangeOutcome } from '../workflow/StepExecutor'

import type { RunLifecycle } from './RunLifecycle'
import type { RunStateRepository } from './RunStateRepository'

type OutcomePorts = {
  runs: Pick<RunLifecycle, 'recordToolOutcome'>
  repository: Pick<RunStateRepository, 'read'>
  getWorkflow: (id: string) => WorkflowDefinition | undefined
}

/** Resolves workflow output policy before recording an applied change. */
export class ToolOutcomeRecorder {
  private readonly workflowOpenPolicyWarnings = new Set<string>()
  constructor(private ports: OutcomePorts) {}
  async recordToolOutcome(
    runId: string,
    outcome: ChangeOutcome,
    options: { openAppliedNotes?: boolean } = {},
  ): Promise<void> {
    if (typeof options.openAppliedNotes === 'boolean') {
      await this.ports.runs.recordToolOutcome(runId, outcome, options)
      return
    }
    let openAppliedNotes = true
    try {
      const run = await this.ports.repository.read(`${runId}.json`)
      if (run?.workflow) {
        const workflow = this.ports.getWorkflow(run.workflow)
        const step = workflow?.steps.find(
          (candidate) => candidate.id === run.currentStepId,
        )
        if (step) {
          openAppliedNotes = step.open_output ?? true
        } else {
          this.warnWorkflowOpenPolicyOnce(
            runId,
            workflow
              ? 'current workflow step was not found'
              : 'workflow definition was not cached',
          )
        }
      }
    } catch (error) {
      this.warnWorkflowOpenPolicyOnce(runId, 'policy lookup failed', error)
    }
    await this.ports.runs.recordToolOutcome(runId, outcome, {
      openAppliedNotes,
    })
  }

  private warnWorkflowOpenPolicyOnce(
    runId: string,
    reason: string,
    error?: unknown,
  ): void {
    if (this.workflowOpenPolicyWarnings.has(runId)) return
    this.workflowOpenPolicyWarnings.add(runId)
    console.warn(
      `[Verbex] Falling back to opening applied notes for ${runId}: ${reason}`,
      error,
    )
  }
}
