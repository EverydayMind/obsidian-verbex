import { nodeProcess } from '../../platform/node/api'
/** Never inherit unrelated host credentials when spawning a local server. */
export function mcpEnvironment(): Record<string, string> {
  const allowed = [
    'PATH',
    'SystemRoot',
    'WINDIR',
    'ComSpec',
    'TEMP',
    'TMP',
    'LANG',
    'LC_ALL',
  ]
  return Object.fromEntries(
    allowed
      .map((name) => [name, nodeProcess().env[name]] as const)
      .filter(
        (entry): entry is readonly [string, string] =>
          typeof entry[1] === 'string',
      ),
  )
}
