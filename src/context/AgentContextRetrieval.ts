import type { TFile } from 'obsidian'

import {
  computeInputBudget,
  computeOutputBudget,
  resolveContextWindow,
} from '../core/llm/contextWindow'
import { getChatModelClient } from '../core/llm/manager'
import { resolveChatModelId } from '../core/llm/modelSelection'
import type { RunLifecycle } from '../runstate/RunLifecycle'
import type { VerbexSettings } from '../settings/schema/setting.types'
import type { VerbexContextTrace } from '../verbex/types'

import type { ContextBuilder } from './ContextBuilder'
import { effectiveContextBudget } from './effectiveContextBudget'
import type { LexicalIndexRepository } from './LexicalIndex'

type RetrievalPorts = {
  builder: Pick<ContextBuilder, 'build'>
  lexicalIndex: Pick<LexicalIndexRepository, 'getStats'>
  runs: Pick<RunLifecycle, 'getSnapshot' | 'setSnapshot' | 'emit'>
}

/** Owns turn retrieval budget resolution and context status publication. */
export class AgentContextRetrieval {
  constructor(
    private getSettings: () => VerbexSettings,
    private ports: RetrievalPorts,
  ) {}
  async buildContext(
    query: string,
    currentFile?: TFile | null,
    mentionedFiles?: TFile[],
    maxContextTokens?: number,
    omitCurrentNoteBody = false,
    formatSources?: readonly string[],
  ): Promise<VerbexContextTrace> {
    let resolvedBudget = maxContextTokens
    if (!resolvedBudget || resolvedBudget <= 0) {
      const resolved = resolveChatModelId({ settings: this.getSettings() })
      try {
        const { model } = getChatModelClient({
          modelId: resolved.modelId,
          settings: this.getSettings(),
        })
        const contextWindow = resolveContextWindow(model)
        const outputBudget = computeOutputBudget(
          contextWindow,
          this.getSettings().verbex.context.reservedOutputTokens,
        )
        resolvedBudget = effectiveContextBudget(
          this.getSettings(),
          computeInputBudget(contextWindow, outputBudget),
        )
      } catch {
        resolvedBudget = this.getSettings().verbex.context.maxContextTokens
      }
    }

    const context = await this.ports.builder.build({
      query,
      currentFile,
      mentionedFiles,
      maxContextTokens: resolvedBudget,
      omitCurrentNoteBody,
      formatSources,
    })
    this.ports.runs.setSnapshot({
      ...this.ports.runs.getSnapshot(),
      lastContext: context,
      lexicalIndex: await this.ports.lexicalIndex.getStats(),
      lastError: null,
    })
    this.ports.runs.emit()
    return context
  }
}
