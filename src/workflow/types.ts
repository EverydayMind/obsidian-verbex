export type ChecklistResumeState =
  | { kind: 'pending'; remaining: string[] }
  | { kind: 'complete'; warnings?: string[] }
  | { kind: 'unavailable'; reason: string }

export type ResumeAction = {
  kind: 'required_tool'
  toolName: 'checklist_next'
}
