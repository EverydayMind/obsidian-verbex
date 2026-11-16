import { App, moment } from 'obsidian'

type DailyNotesOptions = { folder?: string; format?: string }

/** Keep access to the core plugin's private settings at this boundary. */
export function dailyNoteExclusion(
  app: App,
  enabled: boolean,
): ((path: string) => boolean) | undefined {
  if (!enabled) return undefined
  const core = app as App & {
    internalPlugins?: {
      getPluginById?: (id: string) =>
        | {
            instance?: { options?: DailyNotesOptions }
          }
        | undefined
    }
  }
  const options =
    core.internalPlugins?.getPluginById?.('daily-notes')?.instance?.options
  // Without the plugin's settings, do not guess which notes are daily notes.
  if (!options) return undefined
  return createDailyNoteMatcher(options)
}

export function createDailyNoteMatcher(
  options: DailyNotesOptions,
): (path: string) => boolean {
  const folder = (options.folder ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
  const prefix = folder ? `${folder}/` : ''
  const format = options.format?.length ? options.format : 'YYYY-MM-DD'
  return (path) => {
    if (!path.startsWith(prefix) || !path.endsWith('.md')) return false
    const relative = path.slice(prefix.length, -3)
    // A date format can itself contain folders, e.g. YYYY/MM/YYYY-MM-DD.
    const name = format.includes('/')
      ? relative
      : (relative.split('/').pop() ?? '')
    const date = moment(name, format, true)
    return date.isValid() && date.format(format) === name
  }
}
