import { L } from '../i18n/modelText'
import type { JsonObject } from '../provider/interop/protocol'

/** Guidance follows the bound role, never a vocabulary guess about draft prose. */
export function metaGuidance(sizePt?: number | null): string {
  return L({
    ko: `작성 정보·주석·부연 줄은 **라벨**: 값 형식으로 쓰면 샘플의 보조 서식${sizePt == null ? '' : `(${sizePt} pt)`}으로 렌더됩니다`,
    en: `Write author details, comments and supplementary lines as **Label**: value to render them in the sample supplementary style${sizePt == null ? '' : `(${sizePt} pt)`}`,
  })
}
export function contractMetaGuidance(contract: JsonObject): string {
  const roles = contract.roles
  return roles &&
    typeof roles === 'object' &&
    !Array.isArray(roles) &&
    typeof roles['BODY:META'] === 'string'
    ? roles['BODY:META']
    : ''
}
