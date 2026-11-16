import { getModelLocale } from '../../i18n/modelLocale'

import {
  parseCompactAnyProfileNote,
  parseCompactProfileNote,
} from './compactProfileNote'
import { parseNote, renderNote } from './noteCodec'
import {
  type ProfileV2,
  validateProfileV2,
  validateUpgradeableV1,
} from './profileV2'
import { unsupportedSummary } from './reportBounds'
import { validateProfile } from './schema'
import { spacerSummary } from './spacerFacts'
import type { ProfileMachine } from './types'

export function profileSummary(profile: ProfileMachine) {
  return {
    title: profile.title,
    revision: profile.revision,
    sourcePath: profile.sourcePath,
    sourceSha256: profile.snapshot.source.sha256,
    measurementSha256: profile.measurementSha256,
    sections: profile.snapshot.sections.slice(0, 4),
    sectionCount: profile.snapshot.sections.length,
    sectionsTruncated: profile.snapshot.sections.length > 4,
    paragraphs: profile.snapshot.paragraphs.length,
    tables: profile.snapshot.tables.length,
    characterStyles: profile.snapshot.characterStyles.length,
    paragraphStyles: profile.snapshot.paragraphStyles.length,
    bindings: profile.bindings.length,
    fixedRegions: profile.fixedRegions.length,
    template: profile.template,
    spacing: spacerSummary(profile.snapshot),
    ...unsupportedSummary(profile.snapshot.unsupported),
    layout: { state: 'not_measured' },
  }
}

export type ParsedProfileNote = {
  machine: ProfileMachine
  guidance: string
  newline: string
  compact?: boolean
}
export const parseProfileNote = (note: string) =>
  parseNote(note, validateProfile)
export const renderProfileNote = (
  profile: ProfileMachine,
  guidance: string,
  newline = '\n',
  locale = getModelLocale(),
) => renderNote(profile, guidance, newline, validateProfile, undefined, locale)
export const parseProfileV2Note = (note: string) =>
  parseNote(note, validateProfileV2)
export const parseProfileNoteForUpgrade = (note: string) =>
  /<!-- verbex:report-style:machine:start -->\r?\n```report-style-compact-profile-json\r?\n/.test(
    note,
  )
    ? parseCompactProfileNote(note).then((parsed) => ({
        ...parsed,
        compact: true as const,
      }))
    : parseNote(note, validateUpgradeableV1)
export const parseAnyProfileNote = (note: string) => {
  if (
    /<!-- verbex:report-style:machine:start -->\r?\n```report-style-compact-profile-json\r?\n/.test(
      note,
    )
  )
    return parseCompactAnyProfileNote(note).then((parsed) => ({
      ...parsed,
      compact: true as const,
    }))
  return parseNote<ProfileMachine | ProfileV2>(note, (input) => {
    if (
      input &&
      typeof input === 'object' &&
      'schema' in input &&
      input.schema === 'report-style-profile/2'
    )
      return validateProfileV2(input)
    return validateProfile(input)
  })
}
export const renderProfileV2Note = (
  profile: ProfileV2,
  guidance: string,
  newline = '\n',
  locale = getModelLocale(),
) =>
  renderNote(profile, guidance, newline, validateProfileV2, undefined, locale)
