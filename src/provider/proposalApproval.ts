import { t } from '../i18n'

import type { BinaryProposalSummary, KordocSemanticChange } from './contract'

/**
 * Human-readable, whole-proposal approval text. This deliberately contains
 * semantic before/after values and hashes, but never the binary draft bytes.
 */
export function formatBinaryProposalApproval(
  proposal: BinaryProposalSummary,
): string {
  const changes =
    proposal.changes.length > 0
      ? proposal.changes.map(formatChange).join('\n')
      : t('providerR13.noChanges')
  return [
    t('providerR13.target', { path: proposal.targetPath }),
    t('providerR13.count', { count: proposal.applied }),
    t('providerR13.sourceHash', { hash: proposal.sourceHash }),
    t('providerR13.resultHash', { hash: proposal.resultHash }),
    t('providerR13.sizes', {
      source: proposal.sourceSizeBytes,
      result: proposal.resultSizeBytes,
    }),
    t('providerR13.expires', { date: proposal.expiresAt }),
    '',
    t('providerR13.changes'),
    changes,
    '',
    t('providerR13.confirm'),
    t('providerR13.wholeOnly'),
  ].join('\n')
}

function formatChange(change: KordocSemanticChange): string {
  const location =
    change.kind === 'cell'
      ? t('providerR13.cell', {
          block: change.blockIndex + 1,
          row: (change.row ?? 0) + 1,
          col: (change.col ?? 0) + 1,
        })
      : t('providerR13.block', { block: change.blockIndex + 1 })
  return `- ${location}: ${JSON.stringify(change.beforePreview)} → ${JSON.stringify(change.afterPreview)}`
}
