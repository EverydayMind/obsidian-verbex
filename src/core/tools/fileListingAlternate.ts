import type { TFile } from 'obsidian'

import { L } from '../../i18n/modelText'

import type { ToolArgs } from './localToolCommon'

export function nameMatches(
  file: TFile,
  name: string | undefined,
  args: ToolArgs,
): boolean {
  if (!name) return true
  const query = name.normalize('NFC').toLowerCase()
  const filename = (file.name ?? file.path.split('/').pop() ?? '')
    .normalize('NFC')
    .toLowerCase()
  return args.name_match === 'contains'
    ? filename.includes(query)
    : filename === query
}

export function alternateExtensionHint(
  tool: string,
  args: ToolArgs,
  name: string | undefined,
  extension: string | null | undefined,
  list: (extension: string) => TFile[],
): string {
  const ext = extension?.trim().replace(/^\.+/, '').toLowerCase()
  const other = ext === 'hwp' ? 'hwpx' : ext === 'hwpx' ? 'hwp' : undefined
  if (
    tool !== 'list_files' ||
    !other ||
    (name && args.name_match !== 'contains')
  )
    return ''
  const count = list(other).filter((file) =>
    nameMatches(file, name, args),
  ).length
  if (!count) return ''
  return (
    '\n' +
    L({
      ko: `같은 범위에 .${other} 파일 ${count}개가 더 있습니다(extension 없이 또는 "${other}"로 다시 조회).`,
      en: `There are ${count} more .${other} files in the same scope (query again without extension or with "${other}").`,
    })
  )
}
