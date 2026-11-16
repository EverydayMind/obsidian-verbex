import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function digestMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 준비의 digest가 내용과 다릅니다.',
      en: 'The save preparation digest does not match its contents.',
    },
    locale,
  )
}

export function invalidExpiry(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 준비의 만료 시각이 허용 범위 밖입니다.',
      en: 'The save preparation expiry is outside the allowed range.',
    },
    locale,
  )
}

export function invalidPath(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 준비의 경로가 Vault 경로 형식이 아닙니다.',
      en: 'A save preparation path is not in Vault path format.',
    },
    locale,
  )
}

export function duplicatePath(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 대상에 같은 경로가 두 번 있습니다.',
      en: 'The save targets contain the same path twice.',
    },
    locale,
  )
}

export function newTargetMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '새 문서 준비가 확정한 대상과 다릅니다.',
      en: 'The new document preparation differs from the resolved target.',
    },
    locale,
  )
}

export function newPathMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '새 문서의 경로가 확정한 대상과 다릅니다.',
      en: 'The new document path differs from the resolved target.',
    },
    locale,
  )
}

export function templateMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '템플릿이 확정한 대상과 다릅니다.',
      en: 'The template differs from the resolved target.',
    },
    locale,
  )
}

export function templateFormatMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '템플릿과 새 문서의 형식이 다릅니다.',
      en: 'The template and new document formats differ.',
    },
    locale,
  )
}

export function sourceMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 준비의 원본이 확정한 대상과 다릅니다.',
      en: 'The save preparation source differs from the resolved target.',
    },
    locale,
  )
}

export function destinationMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 경로가 확정한 대상과 다릅니다.',
      en: 'The save path differs from the resolved target.',
    },
    locale,
  )
}

export function modeMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 방식과 저장 경로가 맞지 않습니다.',
      en: 'The save mode does not match the save path.',
    },
    locale,
  )
}

export function formatMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '다른 형식으로 저장할 수 없습니다.',
      en: 'Saving in a different format is not supported.',
    },
    locale,
  )
}

export function emptyWriteSet(locale?: ModelLocale) {
  return L(
    {
      ko: '새 파일 저장에 쓸 대상이 없습니다.',
      en: 'There are no targets to write for the new file save.',
    },
    locale,
  )
}

export function primaryMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 대상의 원본 항목이 저장 경로와 다릅니다.',
      en: 'The primary save target entry differs from the save path.',
    },
    locale,
  )
}

export function primaryModeMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '원본 항목의 쓰기 방식이 저장 방식과 다릅니다.',
      en: 'The primary entry write operation differs from the save mode.',
    },
    locale,
  )
}

export function beforeHashMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 대상의 쓰기 전 해시가 쓰기 방식과 맞지 않습니다.',
      en: 'A save target before-hash does not match its write operation.',
    },
    locale,
  )
}

export function tooLarge(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 대상이 100 MiB 상한을 넘습니다.',
      en: 'The save targets exceed the 100 MiB limit.',
    },
    locale,
  )
}

export function folderMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '새 폴더가 저장할 파일의 상위 폴더가 아닙니다.',
      en: 'The new folder is not a parent of a file to be saved.',
    },
    locale,
  )
}
