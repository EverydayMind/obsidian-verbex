import { t } from '../i18n'
import {
  PlanStepStatus,
  VerbexPlanStep,
  VerbexRunState,
  WorkflowDefinition,
} from '../verbex/types'

// Allowed plan-step transitions. Enforced so callers cannot move a step into
// an inconsistent state (e.g. completing a step that never started).
const ALLOWED_TRANSITIONS: Record<PlanStepStatus, PlanStepStatus[]> = {
  pending: ['in_progress', 'blocked', 'skipped'],
  in_progress: ['completed', 'failed', 'blocked'],
  blocked: ['pending', 'in_progress', 'skipped'],
  failed: ['in_progress', 'skipped'],
  completed: [],
  skipped: [],
}

const TERMINAL_STATUSES: PlanStepStatus[] = ['completed', 'skipped']

export class PlanTracker {
  static fromWorkflow(workflow: WorkflowDefinition): VerbexPlanStep[] {
    return workflow.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      status: 'pending',
      dependsOn: step.depends_on ?? [],
      workflowStepId: step.id,
    }))
  }

  static createAdhocPlan(title: string): VerbexPlanStep[] {
    return [
      {
        id: 'understand',
        title: t('ui.PlanTracker.understand'),
        description: title,
        status: 'completed',
        dependsOn: [],
      },
      {
        id: 'respond',
        title: t('ui.PlanTracker.respond'),
        status: 'pending',
        dependsOn: ['understand'],
      },
    ]
  }

  /** Whether a transition between two step statuses is permitted. */
  static canTransition(from: PlanStepStatus, to: PlanStepStatus): boolean {
    return from === to || ALLOWED_TRANSITIONS[from].includes(to)
  }

  /**
   * Returns a new plan with `stepId` moved to `status`. Throws if the step is
   * unknown or the transition is not allowed by the state machine.
   */
  static transition(
    plan: VerbexPlanStep[],
    stepId: string,
    status: PlanStepStatus,
  ): VerbexPlanStep[] {
    const step = plan.find((item) => item.id === stepId)
    if (!step) {
      throw new Error(`Unknown plan step: ${stepId}`)
    }
    if (!this.canTransition(step.status, status)) {
      throw new Error(
        `Invalid plan transition for step ${stepId}: ${step.status} -> ${status}`,
      )
    }
    return plan.map((item) => (item.id === stepId ? { ...item, status } : item))
  }

  /** True once a step's dependencies are all satisfied (completed/skipped). */
  static dependenciesSatisfied(
    plan: VerbexPlanStep[],
    step: VerbexPlanStep,
  ): boolean {
    return step.dependsOn.every((depId) => {
      const dep = plan.find((item) => item.id === depId)
      return dep ? TERMINAL_STATUSES.includes(dep.status) : true
    })
  }

  /**
   * The next step that should run: the first pending step whose dependencies
   * are all satisfied. Returns null when none is runnable.
   */
  static nextRunnableStep(plan: VerbexPlanStep[]): VerbexPlanStep | null {
    return (
      plan.find(
        (step) =>
          step.status === 'pending' && this.dependenciesSatisfied(plan, step),
      ) ?? null
    )
  }

  /** All steps are in a terminal state (completed or skipped). */
  static isComplete(plan: VerbexPlanStep[]): boolean {
    return plan.every((step) => TERMINAL_STATUSES.includes(step.status))
  }

  /** Any step has failed. */
  static hasFailure(plan: VerbexPlanStep[]): boolean {
    return plan.some((step) => step.status === 'failed')
  }

  /**
   * Synchronize a run with a (possibly mutated) plan: stores the plan,
   * recomputes `currentStepId`, and derives the run status from the plan
   * unless the run is paused/cancelled (which the user controls explicitly).
   */
  static syncRunWithPlan(
    run: VerbexRunState,
    plan: VerbexPlanStep[],
  ): VerbexRunState {
    const inProgress = plan.find((step) => step.status === 'in_progress')
    const next = this.nextRunnableStep(plan)
    const currentStepId = inProgress?.id ?? next?.id ?? null

    let status = run.status
    if (run.status !== 'paused' && run.status !== 'cancelled') {
      if (this.hasFailure(plan)) {
        status = 'error'
      } else if (this.isComplete(plan)) {
        status = 'completed'
      } else if (inProgress || run.status === 'created') {
        status = 'in_progress'
      }
    }

    return { ...run, plan, currentStepId, status }
  }

  /**
   * Convenience: transition a step within a run and re-sync the run state in
   * one call.
   */
  static advanceRun(
    run: VerbexRunState,
    stepId: string,
    status: PlanStepStatus,
  ): VerbexRunState {
    const plan = this.transition(run.plan, stepId, status)
    return this.syncRunWithPlan(run, plan)
  }
}
