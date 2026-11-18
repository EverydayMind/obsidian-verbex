import type { App, TFile } from 'obsidian'

import { L } from '../../i18n/modelText'
import { type FileSort, sortValue } from '../tools/fileListingSort'
import { fmValue } from '../tools/propertyMatch'

import { type Note, values } from './noteQueryValues'

export function minuteTie(
  name: string,
  minutes: (string | undefined)[],
  hasDate: boolean,
): string {
  const first = minutes[0]
  if (!first || minutes[1] !== first) return ''
  const count = minutes.filter((minute) => minute === first).length
  return L({
    ko: `\n정렬 기준 ${name} 값이 앞의 ${count}개에서 같은 분입니다.${hasDate ? ' 이 순서는 작성 순서가 아닐 수 있습니다. 노트를 쓴 날짜순이 필요하면 query_notes에 sort_by:"date"를 주세요(노트의 date 속성).' : ''}`,
    en: `\nThe first ${count} items share the same minute of ${name}.${hasDate ? ' This order may not be the order the notes were written in. For written-date order call query_notes with sort_by:"date" (the notes\' date property).' : ''}`,
  })
}

export function fileMinuteTie(
  app: App,
  files: TFile[],
  sort: FileSort,
): string {
  if (sort !== 'mtime' && sort !== 'ctime') return ''
  return minuteTie(
    sort,
    files.map((file) =>
      Number.isFinite(file.stat?.[sort]) ? sortValue(file, sort) : undefined,
    ),
    files.some((file) => {
      if (file.extension.toLowerCase() !== 'md') return false
      const date = fmValue(
        app.metadataCache.getFileCache(file)?.frontmatter ?? {},
        'date',
      )
      return date !== undefined && date !== null && date !== ''
    }),
  )
}

export function noteMinuteTie(notes: Note[], sort: string): string {
  const key = sort.toLowerCase()
  if (key !== 'file.mtime' && key !== 'file.ctime') return ''
  return minuteTie(
    sort,
    notes.map((note) =>
      Number.isFinite(
        key === 'file.mtime' ? note.stat?.mtime : note.stat?.ctime,
      )
        ? values(note, sort)[0]?.text
        : undefined,
    ),
    notes.some((note) => values(note, 'date').length > 0),
  )
}
