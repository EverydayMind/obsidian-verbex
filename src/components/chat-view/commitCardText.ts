import { t } from '../../i18n'

export const commitStateLabels = {
  pending: t('ui.CommitCard.saveResultNeedsVerification'),
  written: t('ui.CommitCard.saved'),
  not_written: t('ui.CommitCard.notSaved'),
  partial: t('ui.CommitCard.partiallySaved'),
  unknown: t('ui.CommitCard.unexpectedContents'),
  unchanged: t('ui.CommitCard.noChanges'),
}

/** Shown only on the live result of a save that created a document from a template. */
export const commitTemplateLine = (template: string): string =>
  t('ui.CommitCard.template', { p0: template })
