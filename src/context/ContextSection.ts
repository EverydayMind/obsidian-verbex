import type {
  ContextContentMode,
  ContextPacketKind,
  ContextPriority,
} from '../core/batch/contextPacker'

export type ContextSection = {
  id:
    | 'base_context'
    | 'digests'
    | 'workflow_coverage'
    | 'self_contained_inventory'
    | 'regrounding'
    | 'followup_grounding'
    | 'folder_inventory'
    | 'companion_edit_scope'
    | 'user_request'
    | 'continuation_facts'
    | 'referenced_documents'
    | 'style_profiles'
    | 'document_jobs'
  title?: string
  content: string
  kind?: ContextPacketKind
  requirementIds?: string[]
  priority?: ContextPriority
  mustKeep?: boolean
  contentMode?: ContextContentMode
  coverageUnitIds?: string[]
}
