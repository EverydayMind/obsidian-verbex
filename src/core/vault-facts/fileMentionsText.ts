import { L } from '../../i18n/modelText'

export function empty(p0: string | number, p1: string | number) {
  return L({
    ko: `${p0}에 이 파일을 링크했거나 파일 이름 "${p1}"을 적은 노트 없음.`,
    en: `No notes in ${p0} link to this file or mention the file name "${p1}".`,
  })
}

export function found(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `${p0}에서 이 파일을 링크했거나 파일 이름 "${p1}"을 적은 노트 ${p2}개: `,
    en: `${p2} notes in ${p0} link to this file or mention the file name "${p1}": `,
  })
}

export function limited(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `${p0}의 언급 노트: 계산하지 않음(노트 ${p1}개, 한도 500개·5MB).${p2}`,
    en: `Mentioning notes in ${p0}: not counted (${p1} notes; limit 500 notes / 5MB).${p2}`,
  })
}

export function duplicates(p0: string | number) {
  return L({
    ko: ` (같은 이름의 파일이 Vault에 ${p0}개 있어 이름 언급은 어느 파일인지 구분되지 않음)`,
    en: ` (${p0} files in the Vault share this name; name mentions do not identify which file)`,
  })
}

export function folder(p0: string | number) {
  return L({ ko: `같은 폴더(${p0})`, en: `the same folder (${p0})` })
}
