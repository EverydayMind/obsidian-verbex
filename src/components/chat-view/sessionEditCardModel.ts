import { t } from '../../i18n'
import type { SessionEditFact } from '../../provider/interop/sessionProtocol'

export const MAX_CARD_CHANGES = 5

/**
 * The facts a person needs about one working-copy edit, taken from the
 * provider's typed receipt. Nothing here is parsed from the text the model saw.
 */
export function sessionEditCardModel(fact: SessionEditFact): {
  title: string
  notes: string[]
  changes: { handle: string; before: string; after: string }[]
  more: number
} {
  const name = fact.path.split('/').pop() ?? fact.path
  if (fact.refused)
    return {
      title: t('ui.sessionEditCardModel.manualEditingNeeded', { p0: name }),
      notes: [
        t(
          'ui.sessionEditCardModel.protectedObjectsPreventedEditingOpenTheLocation',
        ),
      ],
      changes: [],
      more: 0,
    }
  const notes = [t('ui.sessionEditCardModel.thisEditWasAppliedToTheWorking')]
  if (fact.visible === false)
    notes.unshift(
      t('ui.sessionEditCardModel.thisDocumentWasOffScreenWhenEdited'),
    )
  if (fact.changedPages.length)
    notes.push(
      t('ui.sessionEditCardModel.redrawnFromPage', {
        p0: fact.changedPages[0],
      }),
    )
  return {
    title: t('ui.sessionEditCardModel.workingCopyEdit', { p0: name }),
    notes,
    changes:
      fact.tool === 'rewrite_paragraphs'
        ? fact.preview
        : fact.preview.slice(0, MAX_CARD_CHANGES),
    more:
      fact.tool === 'rewrite_paragraphs'
        ? 0
        : Math.max(0, fact.preview.length - MAX_CARD_CHANGES),
  }
}
