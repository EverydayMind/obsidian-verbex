/** Normalize a workflow id or workflow filename to the runnable workflow id. */
export function normalizeWorkflowRef(value: string): string {
  const basename = value.trim().replace(/\\/g, '/').split('/').pop() ?? ''
  return basename.replace(/\.workflow\.ya?ml$/i, '').replace(/\.ya?ml$/i, '')
}
