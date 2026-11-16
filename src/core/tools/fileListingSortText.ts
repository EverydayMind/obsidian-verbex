import { L } from '../../i18n/modelText'

export function orderError() {
  return L({
    ko: `order는 asc 또는 desc여야 합니다.`,
    en: `order must be asc or desc.`,
  })
}

export function sortError() {
  return L({
    ko: `sort는 path, mtime, ctime, size 중 하나여야 합니다.`,
    en: `sort must be path, mtime, ctime, or size.`,
  })
}
