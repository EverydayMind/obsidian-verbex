import type { JsonObject } from '../../../provider/interop/protocol'

export type PairRecord = {
  schema: 'hwpx-decomposition-record/2'
  decompositionId: string
  dialect: string
  rulesVersion?: string
  catalogVersion?: string
  sourcePath: string
  sourceSha256: string
  textFile: string
  textSha256: string
  templatePayloadSha256: string
}
export type Decomposition = {
  facts: JsonObject
  /** Exact tested bytes, retained only in the transient host job store. */
  pending?: {
    markdown: string
    markdownSha256: string
    bundle: JsonObject
    record: Omit<PairRecord, 'schema' | 'textSha256' | 'templatePayloadSha256'>
    textPath: string
    templatePath: string
    conversionFingerprint: string
  }
  explicit?: boolean
}
export type TemplateBinding = {
  dialect?: string
  rulesVersion?: string
  catalogVersion?: string
  path: string
  textPath: string
  sha256: string
  state: 'as_saved' | 'modified' | 'absent'
  sourcePath?: string
  sourceSha256?: string
}

export function decompositionNextStep(decomposition?: Decomposition) {
  const facts = decomposition?.facts
  const fitness = facts?.fitness as JsonObject | undefined
  return (
    facts?.state === 'pending_save' &&
    (fitness?.grade !== 'C' || decomposition?.explicit === true)
  )
}
