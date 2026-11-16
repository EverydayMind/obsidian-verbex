import type { JsonObject } from '../../provider/interop/protocol'
import type { BodyChoice } from '../report-style/bindingCandidateChoices'
import type { BindingCandidates } from '../report-style/bindingCandidates'
import type {
  Binding,
  ProfileMachine,
  StyleSnapshot,
} from '../report-style/types'

import type { BaseSource, EffectiveSource } from './baseFont'
import type {
  Decomposition,
  TemplateBinding,
} from './decompose/jobDecomposition'

export type Measurement = {
  snapshot: StyleSnapshot
  measurementSha256: string
}
export type MeasurementKey = {
  conversationId: string
  sampleSha256: string
  apiVersion: number
}
export type ReadyData = {
  sampleVerificationUnavailable?: string
  decomposition?: Decomposition
  template?: TemplateBinding
  bundle: JsonObject
  draftContract: JsonObject
  rolePrefixes?: Record<string, string>
  machine: ProfileMachine | null
  descriptorDigest: string
  policyRevision: number
  draftPath: string
  outputPath: string
  outputRenamed?: { requested: string; used: string }
  selectedOption?: string
  chosenBy?: 'rule' | 'user' | 'model'
  droppedBindings: Binding[]
}
export type JobState =
  | { state: 'measuring' }
  | { state: 'measured' }
  | { state: 'awaiting_choice'; choices: BodyChoice[] }
  | { state: 'blocked'; reason: string; details?: JsonObject }
  | { state: 'ready'; data: ReadyData }
export type FormatJob = {
  kind: 'sample' | 'template'
  requestedBaseFontPt: number
  baseSource: BaseSource
  effectiveBaseFontPt: number | null
  effectiveSource: EffectiveSource
  candidates: BindingCandidates | null
  id: string
  conversationId: string
  samplePath: string
  sampleSha256: string
  measurement: Measurement | null
  choices?: BodyChoice[]
  apiVersion: number
  outputName?: string
  expiresAt: number
  status: JobState
}
export type { ProductionKey } from './productionIdentity'
export const JOB_TTL = 60 * 60 * 1000
export const SHA = /^[a-f0-9]{64}$/
export const copy = <T>(value: T): T => structuredClone(value)
