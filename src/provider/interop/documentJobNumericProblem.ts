/** AJV numeric keywords are mapped without inspecting error prose. */
export function numericPrepareProblem(keyword: string) {
  if (keyword === 'minimum' || keyword === 'maximum') return 'out_of_range'
  if (keyword === 'multipleOf') return 'invalid_step'
  return undefined
}
