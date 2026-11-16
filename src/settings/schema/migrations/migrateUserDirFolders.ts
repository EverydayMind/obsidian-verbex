/**
 * Moves the Skills / Workflows / Prompts folder settings out of the hidden
 * `.verbex/` dir into the visible, user-editable `Verbex/` dir.
 *
 * Only rewrites a folder whose stored value still equals the old default (or is
 * unset) — a user who pointed it somewhere custom keeps their value. This
 * historical migration is retained for the version chain; v34 reverses defaults.
 */
export function migrateUserDirFolders(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const newData = { ...data }
  newData.version = 18

  const moves: [key: string, oldDefault: string, newDefault: string][] = [
    ['skillsFolder', '.verbex/Skills', 'Verbex/Skills'],
    ['workflowsFolder', '.verbex/Workflows', 'Verbex/Workflows'],
    ['promptsFolder', '.verbex/Prompts', 'Verbex/Prompts'],
  ]

  for (const [key, oldDefault, newDefault] of moves) {
    const value = newData[key]
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === oldDefault
    ) {
      newData[key] = newDefault
    }
  }

  return newData
}
