import {
  type ContextPackerResult,
  type ContextPacket,
  type ContextPacketKind,
  type ContextPacketSeed,
  type ContextPriority,
  type ExecutionMode,
  type ExecutionPlan,
  type OutputMode,
  createExecutionPlan,
  renderBlock,
  replacePackedBlock,
} from '../core/batch/contextPacker'
import type { BatchContract } from '../core/batch/contracts'
import type { RequirementCoverage } from '../core/routing/coverage'
import type { CoverageDecision } from '../core/routing/scopeDecision'
import { modelMarker } from '../i18n/modelMarkers'
import { L } from '../i18n/modelText'
import { estimateTokens } from '../utils/llm/estimateTokens'

import { ContextSection } from './ContextSection'

const DEFAULT_SECTION_KIND: Record<ContextSection['id'], ContextPacketKind> = {
  base_context: 'chunk',
  digests: 'digest',
  workflow_coverage: 'digest',
  self_contained_inventory: 'inventory',
  regrounding: 'history',
  followup_grounding: 'history',
  folder_inventory: 'inventory',
  companion_edit_scope: 'instruction',
  user_request: 'instruction',
  continuation_facts: 'history',
  referenced_documents: 'inventory',
  style_profiles: 'inventory',
  document_jobs: 'instruction',
}

const DEFAULT_SECTION_PRIORITY: Record<ContextSection['id'], ContextPriority> =
  {
    base_context: 'optional',
    digests: 'supporting',
    workflow_coverage: 'mandatory',
    self_contained_inventory: 'supporting',
    regrounding: 'supporting',
    followup_grounding: 'supporting',
    folder_inventory: 'optional',
    companion_edit_scope: 'mandatory',
    user_request: 'mandatory',
    continuation_facts: 'supporting',
    referenced_documents: 'mandatory',
    style_profiles: 'mandatory',
    document_jobs: 'mandatory',
  }

function sectionSeed(section: ContextSection): ContextPacketSeed {
  const metadata = section.content.split(/\r?\n/, 1)[0]?.trim() ?? ''
  const countOnly = `[${section.id}: content omitted]`
  return {
    id: section.id,
    kind: section.kind ?? DEFAULT_SECTION_KIND[section.id],
    requirementIds: section.requirementIds ?? [],
    contentMode: section.contentMode ?? 'full',
    tokenEstimateByMode: {
      full: estimateTokens(section.content),
      snippet: estimateTokens(section.content.slice(0, 1_200)),
      metadata: estimateTokens(metadata),
      count_only: estimateTokens(countOnly),
    },
    contentRef: { kind: 'inline', text: section.content },
    ...(section.coverageUnitIds
      ? { coverageUnitIds: [...section.coverageUnitIds] }
      : {}),
    routing: {
      priority: section.priority ?? DEFAULT_SECTION_PRIORITY[section.id],
      mustKeep:
        section.mustKeep ??
        (section.id === 'user_request' || section.id === 'workflow_coverage'),
    },
  }
}

function sectionWrapper(
  hasContext: boolean,
  packet: ContextPacket,
  body: string,
): string {
  return packet.id === 'user_request' && hasContext
    ? L({
        ko: `${modelMarker('userRequest', 'ko')}${body}`,
        en: `${modelMarker('userRequest', 'en')}${body}`,
      })
    : body
}

export class ContextAssembler {
  private sections: ContextSection[] = []
  private packetSeeds: ContextPacketSeed[] = []

  private renderSection(
    plan: ExecutionPlan,
    sectionId: string,
    content: string,
  ): string {
    const packet = plan.packets.find((item) => item.id === sectionId)
    if (!packet) return ''
    const hasContext = this.sections.some(
      (section) => section.id !== 'user_request',
    )
    return renderBlock(packet, content, (item, body) =>
      sectionWrapper(hasContext, item, body),
    )
  }

  refitWrapperTokens(plan: ExecutionPlan, sectionId: string): number {
    return estimateTokens(this.renderSection(plan, sectionId, ''))
  }

  refitSection(
    plan: ExecutionPlan,
    sectionId: string,
    content: string,
    maxTokens: number,
  ): ExecutionPlan {
    const packed = replacePackedBlock(
      plan.packed,
      sectionId,
      this.renderSection(plan, sectionId, content),
      maxTokens,
    )
    if (packed === plan.packed) return plan
    const updated = packed.packets.find((item) => item.id === sectionId)
    if (!updated) return plan
    const packet = {
      ...updated,
      contentRef: { kind: 'inline' as const, text: content },
      tokenEstimateByMode: {
        ...updated.tokenEstimateByMode,
        full: estimateTokens(content),
      },
    }
    return {
      ...plan,
      packets: plan.packets.map((item) =>
        item.id === sectionId ? packet : item,
      ),
      packed: {
        ...packed,
        packets: packed.packets.map((item) =>
          item.id === sectionId ? packet : item,
        ),
      },
    }
  }

  addSection(section: ContextSection): void {
    if (section.content.trim()) {
      this.sections.push(section)
    }
  }

  /** Add serializable packets such as revision-bound coverage units. */
  addPacketSeeds(seeds: readonly ContextPacketSeed[]): void {
    this.packetSeeds.push(...seeds)
  }

  private routedPacketSeeds(): {
    seeds: ContextPacketSeed[]
    hasContext: boolean
  } {
    const hasContext = this.sections.some(
      (section) => section.id !== 'user_request',
    )
    const sectionSeeds = this.sections.map(sectionSeed)
    const requestIndex = sectionSeeds.findIndex(
      (packet) => packet.id === 'user_request',
    )
    const insertionIndex = requestIndex < 0 ? sectionSeeds.length : requestIndex
    return {
      hasContext,
      seeds: [
        ...sectionSeeds.slice(0, insertionIndex),
        ...this.packetSeeds,
        ...sectionSeeds.slice(insertionIndex),
      ],
    }
  }

  /**
   * Build the serializable execution plan and pack it in one operation.
   * Keeping this boundary in the assembler ensures every caller uses the
   * same packet ordering, routing facts, and durable-defer inputs.
   */
  async assembleExecutionPlan(input: {
    request: string
    inputBudgetTokens: number
    fixedOverheadTokens: number
    decision?: CoverageDecision
    contract?: BatchContract | null
    coverage?: RequirementCoverage
    outputMode?: OutputMode
    execution?: ExecutionMode
    durableDeferSectionIds?: readonly string[]
    durableDeferCoverageUnitIds?: readonly string[]
  }): Promise<ExecutionPlan> {
    const { seeds, hasContext } = this.routedPacketSeeds()
    return createExecutionPlan({
      request: input.request,
      decision: input.decision,
      contract: input.contract,
      coverage: input.coverage,
      outputMode: input.outputMode,
      execution: input.execution,
      inputBudgetTokens: input.inputBudgetTokens,
      fixedOverheadTokens: input.fixedOverheadTokens,
      packets: seeds,
      packer: {
        durableDeferPacketIds: input.durableDeferSectionIds,
        durableDeferCoverageUnitIds: input.durableDeferCoverageUnitIds,
        renderWrapper: (packet, body) =>
          sectionWrapper(hasContext, packet, body),
      },
    })
  }

  /**
   * Assemble all sections through the global packet contract. Allocation is
   * priority-aware, while the final text preserves the original section order
   * so prompt semantics remain stable. A capacity error is returned to the
   * caller instead of silently dropping mandatory material.
   */
  async assemblePacked(input: {
    inputBudgetTokens: number
    fixedOverheadTokens: number
    durableDeferSectionIds?: readonly string[]
    durableDeferCoverageUnitIds?: readonly string[]
  }): Promise<ContextPackerResult> {
    const plan = await this.assembleExecutionPlan({
      request: '',
      inputBudgetTokens: input.inputBudgetTokens,
      fixedOverheadTokens: input.fixedOverheadTokens,
      durableDeferSectionIds: input.durableDeferSectionIds,
      durableDeferCoverageUnitIds: input.durableDeferCoverageUnitIds,
    })
    return plan.packed
  }

  assemble(): string {
    // 1. user_request 섹션을 제외한 컨텍스트 섹션들을 먼저 조립합니다.
    const contextSections = this.sections.filter((s) => s.id !== 'user_request')
    const contextContent = contextSections
      .map((s) => s.content.trim())
      .join('\n\n')

    // 2. user_request 섹션을 가져옵니다.
    const userRequestSection = this.sections.find(
      (s) => s.id === 'user_request',
    )
    const userRequestContent = userRequestSection?.content.trim() ?? ''

    // 3. 기존의 결합 포맷과 동일하도록 조립합니다.
    if (contextContent && userRequestContent) {
      return L({
        ko: `${contextContent}\n\n${modelMarker('userRequest', 'ko')}${userRequestContent}`,
        en: `${contextContent}\n\n${modelMarker('userRequest', 'en')}${userRequestContent}`,
      })
    } else if (userRequestContent) {
      return userRequestContent
    } else {
      return contextContent
    }
  }
}
