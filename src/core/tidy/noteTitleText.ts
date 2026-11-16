import { L } from '../../i18n/modelText'

export function emptyTitle() {
  return L({
    ko: `사용할 수 있는 제목이 없습니다.`,
    en: `No usable title remains.`,
  })
}

export function lengthLimit(p0: string | number) {
  return L({ ko: `길이 제한 ${p0}자`, en: `Length limit: ${p0} characters` })
}

export function longFolder() {
  return L({
    ko: `폴더 경로가 너무 깁니다.`,
    en: `The folder path is too long.`,
  })
}

export function reservedName() {
  return L({ ko: `Windows 예약 장치 이름`, en: `Windows reserved device name` })
}

export function reservedTitle(p0: string | number) {
  return L({ ko: `${p0} 노트`, en: `${p0} note` })
}

export function trimStart() {
  return L({
    ko: `앞의 마침표 제거(숨김 파일 방지)`,
    en: `Removed leading periods (prevents hidden files)`,
  })
}

export function trimEnd() {
  return L({
    ko: `끝의 마침표·공백 제거`,
    en: `Removed trailing periods and spaces`,
  })
}

export function spaces() {
  return L({ ko: `연속 공백 정리`, en: `Collapsed consecutive spaces` })
}

export function extension() {
  return L({ ko: `확장자 .md 제거`, en: `Removed the .md extension` })
}

export function nfc() {
  return L({ ko: `유니코드 NFC 정규화`, en: `Unicode NFC normalization` })
}

export function closeBracket() {
  return L({ ko: `Obsidian 링크를 깨는 "]"`, en: `"]" breaks Obsidian links` })
}

export function openBracket() {
  return L({ ko: `Obsidian 링크를 깨는 "["`, en: `"[" breaks Obsidian links` })
}

export function anchors() {
  return L({
    ko: `Obsidian 링크를 깨는 "#" "^"`,
    en: `"#" and "^" break Obsidian links`,
  })
}

export function controls() {
  return L({ ko: `제어 문자`, en: `Control characters` })
}

export function wildcards() {
  return L({
    ko: `Windows 금지 문자 "?" "*"`,
    en: `Windows disallows "?" and "*"`,
  })
}

export function greaterThan() {
  return L({ ko: `Windows 금지 문자 ">"`, en: `Windows disallows ">"` })
}

export function lessThan() {
  return L({ ko: `Windows 금지 문자 "<"`, en: `Windows disallows "<"` })
}

export function quote() {
  return L({ ko: `Windows 금지 문자 '"'`, en: `Windows disallows '"'` })
}

export function pipe() {
  return L({
    ko: `Windows·링크 금지 문자 "|"`,
    en: `Windows and links disallow "|"`,
  })
}

export function slashes() {
  return L({
    ko: `Windows 금지 문자 "/" "\\"`,
    en: `Windows disallows "/" and "\\"`,
  })
}

export function colon() {
  return L({ ko: `Windows 금지 문자 ":"`, en: `Windows disallows ":"` })
}
