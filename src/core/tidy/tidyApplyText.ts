import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function completedSteps(
  message: string | number,
  steps: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `${message} (이미 끝난 단계: ${steps}. 체크포인트로 되돌릴 수 있습니다.)`,
      en: `${message} (Steps already completed: ${steps}. You can restore them from the checkpoint.)`,
    },
    locale,
  )
}

export function deduplicated(
  path: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    { ko: `원본 중복 제거(${path})`, en: `Source deduplication(${path})` },
    locale,
  )
}

export function created(
  path: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    { ko: `새 노트 생성(${path})`, en: `New note creation(${path})` },
    locale,
  )
}

export function aliasAdded(locale: ModelLocale = getModelLocale()) {
  return L(
    {
      ko: '이전 제목을 aliases에 추가',
      en: 'Added the previous title to aliases',
    },
    locale,
  )
}

export function permanentDeleteRefused(locale: ModelLocale = getModelLocale()) {
  return L(
    {
      ko: 'Obsidian 삭제 설정이 영구 삭제이므로 휴지통 이동을 실행할 수 없습니다.',
      en: 'Cannot move to trash because Obsidian is configured to delete permanently.',
    },
    locale,
  )
}

export function unexpectedChanges(
  paths: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `실행 중 예상 목록 밖의 파일 변경이 관측됐습니다: ${paths}. 변경 원인은 확인할 수 없으며 이 파일은 이번 체크포인트에 포함되지 않았습니다. 내용을 확인하세요.`,
      en: `Changes to files outside the expected list were observed during execution: ${paths}. Their cause cannot be determined, and these files were not included in this checkpoint. Check their contents.`,
    },
    locale,
  )
}

export function updatedLinks(
  updated: string | number,
  total: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `링크가 바뀐 노트 ${updated}/${total}개`,
      en: `Notes with updated links: ${updated}/${total}`,
    },
    locale,
  )
}

export function linkCounts(
  unchanged: string | number,
  broken: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `고칠 필요 없음 ${unchanged}개 / 깨진 링크가 있는 노트 ${broken}개`,
      en: `No correction needed: ${unchanged} / Notes with broken links: ${broken}`,
    },
    locale,
  )
}

export function morePaths(
  count: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L({ ko: ` 외 ${count}개`, en: ` and ${count} more` }, locale)
}

export function sourceStillExists(
  path: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `원본 ${path}이(가) 아직 남아 있습니다.`,
      en: `The source ${path} still exists.`,
    },
    locale,
  )
}

export function trashed(locale: ModelLocale = getModelLocale()) {
  return L(
    {
      ko: '휴지통으로 이동했으며 Obsidian 휴지통 또는 시스템 휴지통에서 되살릴 수 있습니다.',
      en: 'Moved to trash; it can be restored from the Obsidian trash or system trash.',
    },
    locale,
  )
}

export function newPathMissing(
  path: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `새 경로 ${path}에서 노트를 찾지 못했습니다.`,
      en: `Could not find the note at the new path ${path}.`,
    },
    locale,
  )
}

export function newNoteMissing(
  path: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `새 노트 ${path}을(를) 찾지 못했습니다.`,
      en: `Could not find the new note ${path}.`,
    },
    locale,
  )
}
