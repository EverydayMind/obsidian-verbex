import type { App } from 'obsidian'

import type { TurnRecord } from '../../runstate/turnLedger'
import type { VerbexSettings } from '../../settings/schema/setting.types'
import { buildCensusReport } from '../census/CensusReportBuilder'
import type { CensusSessionPort } from '../census/types'

import type { ToolExecutionContext } from './localToolCommon'
import { linesPolicy } from './obsidianQueryLinesAccess'
import type { ObsidianQueryLinesSessionStore } from './obsidianQueryLinesSession'

export function createLocalCensus(
  store: ObsidianQueryLinesSessionStore,
  app: () => App,
  settings: () => VerbexSettings | undefined,
) {
  const context = (signal?: AbortSignal): ToolExecutionContext => ({
    app: app(),
    configFolders: settings(),
    signal,
    getContextBudget: () => 0,
    getPriorityFolder: () => '',
    getToolRequestLogPath: () => '',
  })
  const port: CensusSessionPort = {
    snapshot: (ref, runId, signal) =>
      store.snapshot(ref, runId, () => linesPolicy(context(signal)), signal),
  }
  return {
    ...port,
    buildReport: (turn: TurnRecord, runId: string, signal?: AbortSignal) =>
      buildCensusReport(turn, runId, port, context(signal)),
  }
}
