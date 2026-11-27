// The only place that touches Obsidian's private `app.commands` API.
import type { App } from 'obsidian'

type CommandsRegistry = {
  commands?: Record<string, unknown>
  executeCommandById?: (id: string) => unknown
}

const commandsOf = (app: App): CommandsRegistry | undefined =>
  (app as App & { commands?: CommandsRegistry }).commands

export function hasObsidianCommand(app: App, id: string): boolean {
  const commands = commandsOf(app)?.commands
  return Boolean(commands && Object.hasOwn(commands, id))
}

export function executeObsidianCommand(app: App, id: string): boolean {
  const registry = commandsOf(app)
  if (!registry?.executeCommandById || !hasObsidianCommand(app, id)) {
    return false
  }
  return registry.executeCommandById(id) !== false
}
