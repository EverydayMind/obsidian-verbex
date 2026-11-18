import { L } from '../../i18n/modelText'

import type { QueryArgs } from './noteQueryArgs'
import * as modelText from './noteQueryFactsText'
import { type Note, values } from './noteQueryValues'

export const reserved = [
  'path',
  'name',
  'folder',
  'top_folder',
  'mtime',
  'ctime',
  'size',
]

export function assertReservedComparisons(
  notes: Note[],
  q: QueryArgs,
  tasks: boolean,
): void {
  for (const { field, op } of q.where) {
    const name = field.toLowerCase()
    if (
      name === 'text' &&
      op !== 'missing' &&
      op !== 'exists' &&
      !notes.some((note) => values(note, field).length)
    )
      throw new Error(
        L({
          ko: tasks
            ? `where의 field "text"는 속성 이름입니다. 할 일 문장 검색은 text 인자에 넣으세요.`
            : `where의 field "text"는 속성 이름입니다. 본문 낱말 검색은 text 인자에 넣으세요.`,
          en: tasks
            ? `The where field "text" is a property name. Use the text argument to search task text.`
            : `The where field "text" is a property name. Use the text argument to search note text.`,
        }),
      )
    if (
      op !== 'missing' &&
      op !== 'exists' &&
      reserved.includes(name) &&
      !notes.some((note) => values(note, field).length)
    )
      throw new Error(
        modelText.missingProperty(
          field,
          ` ${modelText.hint(name)} ${modelText.whereHint(name)}`,
        ),
      )
  }
}
