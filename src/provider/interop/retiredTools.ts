import { z } from 'zod'

import { L } from '../../i18n/modelText'

import bundled from './retiredTools.json'

/**
 * Tool names that older Verbex versions exposed and a separately installed
 * plugin now replaces under its own provider tools (no one-to-one successor).
 * Data only: plugin names, versions and tool prefixes live in the JSON, never
 * in a code branch. It feeds the refusal text for such a name and lets old
 * Workflows keep loading. It is never consulted for exposure, execution or
 * approval. No obsidian runtime import.
 */
const toolName = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)

const entrySchema = z
  .object({
    pluginName: z.string().min(1).max(100),
    minVersion: z.string().regex(/^\d+(\.\d+){0,3}$/),
    /** Prefix of the replacing provider's tool names. */
    toolPrefix: z.string().regex(/^[a-z0-9_-]{1,100}$/),
    retiredTools: z.array(toolName).min(1).max(64),
  })
  .strict()

const tableSchema = z
  .object({ entries: z.array(entrySchema).max(50) })
  .strict()
  .refine(
    (table) => {
      const names = table.entries.flatMap((entry) => entry.retiredTools)
      return new Set(names).size === names.length
    },
    { message: 'retired tool names must be unique' },
  )

export type RetiredToolEntry = z.infer<typeof entrySchema>
export type RetiredToolsTable = z.infer<typeof tableSchema>

const EMPTY: RetiredToolsTable = { entries: [] }

let override: unknown
let overridden = false

/** Tests only: replace (or with no argument, restore) the table. */
export function overrideRetiredTools(...raw: [] | [unknown]): void {
  overridden = raw.length > 0
  override = raw[0]
}

/** A defective table is ignored whole. */
export function activeRetiredTools(): RetiredToolsTable {
  const parsed = tableSchema.safeParse(overridden ? override : bundled)
  return parsed.success ? parsed.data : EMPTY
}

/** The replacing plugin for a retired tool name, if any. */
export function retiredToolReplacement(
  name: string,
  table: RetiredToolsTable = activeRetiredTools(),
): RetiredToolEntry | undefined {
  return table.entries.find((entry) => entry.retiredTools.includes(name))
}

/** Model-facing refusal for a call to a tool name a plugin now replaces. */
export function retiredReplacementFact(
  name: string,
  entry: RetiredToolEntry,
): string {
  return L({
    ko: `\`${name}\` 도구는 Verbex에서 빠졌습니다. 같은 일은 이제 ${entry.pluginName}의 \`${entry.toolPrefix}…\` 도구가 맡습니다. ${entry.pluginName} ${entry.minVersion} 이상이 설치·승인돼 있으면 그 도구를 쓰고, 없으면 사람에게 설치·승인을 안내하세요.`,
    en: `\`${name}\` was removed from Verbex and is provided by ${entry.pluginName} as its own \`${entry.toolPrefix}…\` tools. If ${entry.pluginName} ${entry.minVersion} or later is installed and approved, use those tools; otherwise tell the user to install and approve it.`,
  })
}
