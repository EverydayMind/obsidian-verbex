import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function entityNoteDescription(locale: ModelLocale): string {
  return L(
    {
      ko: 'Make an entity (person, organization, concept, place, product, law ...) linkable from a note. If a note with this name or alias already exists, only the link is added. Otherwise a new note titled with the entity name is created and the mention is linked. Pass mention_text exactly as written in the note, without Korean particles (e.g. 삼성전자, not 삼성전자는). Always asks for approval.',
      en: 'Make an entity (person, organization, concept, place, product, law ...) linkable from a note. If a note with this name or alias already exists, only the link is added. Otherwise a new note titled with the entity name is created and the mention is linked. Pass mention_text exactly as written in the note; for Korean text, omit particles (e.g. 삼성전자, not 삼성전자는). Always asks for approval.',
    },
    locale,
  )
}

export function splitNoteTitleDescription(locale: ModelLocale): string {
  return L(
    {
      ko: 'Title summarizing the current status, e.g. "X 이관 - PoC 완료, 예산 승인 대기".',
      en: 'Title summarizing the current status, e.g. "X handover - PoC done, awaiting budget approval".',
    },
    locale,
  )
}
