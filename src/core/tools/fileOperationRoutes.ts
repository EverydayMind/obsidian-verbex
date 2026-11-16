/**
 * Request patterns that expose delete_file / move_file / rename_file.
 *
 * They fire when a file-like target is directly followed by the action
 * ("이 노트를 30 정책으로 옮겨 줘"), and stay silent when the thing being
 * removed, moved or renamed is part of a note's body ("3번 항목을 삭제").
 */
const TARGET = '(?:파일|노트|메모|문서|폴더)'
const PARTICLE = String.raw`(?:을|를|은|는|도|들을|\s*하나를|\s*전체를|\s*자체를)?`
const GAP = String.raw`\s*(?:\S+\s+){0,2}?`
const BODY_GAP = String.raw`\s*(?:\S+\s+){0,4}?`
const BODY_PART =
  '(?:절|항목|문장|줄|단락|문단|내용|부분|표|태그|속성|링크|단어|글자|행|열|제목)'
const ENGLISH_TARGET = String.raw`\s+(?:(?:the|this|that|these|those|a|an|my|all)\s+)?(?:files?|notes?|folders?|memos?|documents?|directories|directory|subfolders?)\b`

const fileAction = (verbs: string, english: string) =>
  new RegExp(
    `^(?!.*${BODY_PART}(?:을|를|은|는|도|만)?${BODY_GAP}(?:${verbs})).*${TARGET}${PARTICLE}${GAP}(?:${verbs})|\\b(?:${english})${ENGLISH_TARGET}`,
    'i',
  )

export const DELETE_FILE_ROUTE = fileAction(
  '삭제|지워|지우|제거',
  'delete|remove|trash',
)

export const MOVE_FILE_ROUTE = fileAction('옮겨|옮기|이동', 'move|relocate')

const LEGACY_RENAME_FILE_ROUTE = new RegExp(
  String.raw`^(?!.*${BODY_PART}\s*이름).*${TARGET}(?:의|을|를|은|는)?\s*(?:\S+\s+){0,1}?이름(?:을|만)?\s*(?:\S+\s+){0,6}?(?:바꿔|바꾸|변경|고쳐)|\brename${ENGLISH_TARGET}`,
  'i',
)

export const RENAME_FILE_ROUTE = new RegExp(
  `${LEGACY_RENAME_FILE_ROUTE.source}|\\b(?:change|modify)\\s+(?:the\\s+)?name\\s+of${ENGLISH_TARGET}|\\b(?:change|modify)${ENGLISH_TARGET}(?:'s|’s)\\s+name\\b`,
  'i',
)
