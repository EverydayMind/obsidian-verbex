import type { ReadPageRecovery } from '../../core/large-document/readPageRecovery'

import type { JsonObject, ToolDescriptor } from './protocol'
import type { NativeToolResult } from './resultReader'

/** Arguments are from the validated invocation; prose/next cursor never sets start. */
export function nativeReadRecovery(
  name: string,
  tool: ToolDescriptor,
  args: JsonObject,
  result: NativeToolResult,
): ReadPageRecovery {
  let revision: string | undefined
  const start: ReadPageRecovery['start'] = Object.fromEntries(
    Object.entries(args).filter(
      ([key, value]) =>
        ['path', 'cursor', 'from', 'start', 'start_line', 'offset'].includes(
          key,
        ) &&
        ((typeof value === 'string' && value.length <= 2048) ||
          typeof value === 'number'),
    ),
  ) as Record<string, string | number>
  if (Array.isArray(args.pages) && typeof args.pages[0] === 'number')
    start.page = args.pages[0]
  else if (typeof args.pages === 'string')
    start.page = args.pages.split(/[,-]/, 1)[0].trim().slice(0, 128)
  try {
    const metadata: unknown = JSON.parse(result.readPage?.continuation ?? '')
    if (metadata && typeof metadata === 'object') {
      const value = metadata as Record<string, unknown>
      const rev = value.sourceSha256 ?? value.revision
      if (typeof rev === 'string' && rev.length <= 256) revision = rev
    }
  } catch {
    /* No structured revision supplied by this reader. */
  }
  return {
    tool: name,
    paths: result.paths,
    revision,
    start,
    rangeArguments: [
      'pages',
      'from',
      'to',
      'start_line',
      'end_line',
      'limit',
      'range',
    ].filter((key) =>
      Object.prototype.hasOwnProperty.call(
        tool.inputSchema.properties ?? {},
        key,
      ),
    ),
  }
}
