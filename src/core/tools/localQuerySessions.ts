import { ObsidianQueryLinesSessionStore } from './obsidianQueryLinesSession'
import { PropertyQuerySessionStore } from './propertyQuerySession'

/** The registry owns both independent, memory-only query lifecycles. */
export function createLocalQuerySessions() {
  return {
    propertyQuerySessions: new PropertyQuerySessionStore(),
    obsidianQueryLinesSessions: new ObsidianQueryLinesSessionStore(),
  }
}
