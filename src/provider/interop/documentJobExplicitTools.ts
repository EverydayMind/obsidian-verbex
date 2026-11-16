import { explicitlyNamedTools } from '../../core/tools/explicitToolMentions'

export function documentJobExplicitTools(
  request: string,
  candidates: readonly string[],
): Set<string> {
  const explicit = new Set(explicitlyNamedTools(request))
  for (const name of candidates) {
    const short = name.startsWith('plg__')
      ? (name.split('__').at(-1) ?? name)
      : name
    const escaped = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (
      [name, short].some((value) =>
        new RegExp(
          '(?<![A-Za-z0-9_])' + escaped(value) + '(?![A-Za-z0-9_])',
          'i',
        ).test(request),
      )
    )
      explicit.add(name)
  }
  return explicit
}
