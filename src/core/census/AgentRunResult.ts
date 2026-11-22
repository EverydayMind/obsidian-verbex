import type { AgentLoopResult } from '../llm/agentLoop'

import type { CensusReport } from './types'

/** The report is an output of chat execution, never an agent-loop input. */
export type AgentRunResult = AgentLoopResult & { censusReport?: CensusReport }
