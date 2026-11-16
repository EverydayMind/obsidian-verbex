import { z } from 'zod'

import { t } from '../../i18n'
import { L } from '../../i18n/modelText'

import type { JsonObject } from './protocol'

/** Policy metadata is a hint for the next read, never permission to bypass it. */
export const browserReadAccessSchema = z.enum([
  'allowed',
  'approval_required',
  'needs_allowlist',
  'blocked',
  'read_disabled',
  'prompt_unavailable',
])

export function browserReadAccessLabel(target?: JsonObject): string {
  const access = browserReadAccessSchema.safeParse(target?.readAccess)
  return access.success ? t(`browserReadAccessR10.${access.data}`) : ''
}

export function browserReadAccessInstructions(): string {
  return L({
    ko: 'readAccess=approval_required이면 같은 tabId로 페이지 읽기 도구를 호출해 사람의 사이트 허용 확인을 요청한다. 확인창의 결정 전에 본문을 읽거나 허용됐다고 간주하지 않는다. policyState=unallowed만으로 읽기 불가라 단정하거나 새 tabId를 요구하지 않는다. needs_allowlist는 정확한 origin의 허용 목록 등록, blocked는 차단, read_disabled/prompt_unavailable은 읽기 설정 확인이 필요하다.',
    en: 'For readAccess=approval_required, call the page-reading tool with the same tabId to request human site approval. Do not read the body or assume approval before the dialog decision. policyState=unallowed alone does not mean reading is impossible or require a new tabId. needs_allowlist requires registering the exact origin; blocked means blocked; read_disabled/prompt_unavailable requires checking read settings.',
  })
}
