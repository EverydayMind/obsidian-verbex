// Provisional v1 profile envelope. A distinct fenced block makes old readers fail closed.
import { getModelLocale } from '../../i18n/modelLocale'

import { decodeCompactEvidence, encodeCompactEvidence } from './compactEvidence'
import { decodeCompactSnapshot } from './compactSnapshot'
import { encodeCompactSnapshot } from './compactSnapshotEncode'
import { retainCompactSnapshot } from './compactSnapshotMemo'
import { validateExpandedProfile } from './expandedProfile'
import { type CompactNoteCodec, parseNote, renderNote } from './noteCodec'
import { type ProfileV2, validateExpandedProfileV2 } from './profileV2'
import type { ProfileMachine } from './types'

const codec: CompactNoteCodec<ProfileMachine> = {
  async encode(profile) {
    return {
      ...profile,
      snapshot: await encodeCompactSnapshot(
        profile.snapshot,
        profile.measurementSha256,
        profile.snapshot.source.sha256,
      ),
    }
  },
  async decode(value, frontmatter) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof frontmatter.measurement_sha256 !== 'string' ||
      typeof frontmatter.source_sha256 !== 'string'
    )
      throw new Error('Invalid compact profile envelope.')
    const wire = value as Record<string, unknown>
    const snapshot = await decodeCompactSnapshot(
      wire.snapshot,
      frontmatter.measurement_sha256,
      frontmatter.source_sha256,
    )
    return validateExpandedProfile({ ...wire, snapshot })
  },
}

export async function renderCompactProfileNote(
  profile: ProfileMachine,
  guidance: string,
  newline = '\n',
  locale = getModelLocale(),
): Promise<string> {
  const note = await renderNote(
    profile,
    guidance,
    newline,
    validateExpandedProfile,
    codec,
    locale,
  )
  if (new TextEncoder().encode(note).byteLength > 6 * 1024 * 1024)
    throw new Error('Profile note exceeds 6 MiB.')
  return note
}

export function parseCompactProfileNote(note: string) {
  return parseNote(note, validateExpandedProfile, codec)
}

const v2Codec: CompactNoteCodec<ProfileV2> = {
  async encode(profile) {
    return {
      ...profile,
      ...(profile.semanticReplay
        ? {
            semanticReplay: {
              ...profile.semanticReplay,
              evidence: encodeCompactEvidence(profile.semanticReplay.evidence),
            },
          }
        : {}),
      snapshot: await encodeCompactSnapshot(
        profile.snapshot,
        profile.measurementSha256,
        profile.snapshot.source.sha256,
      ),
    }
  },
  async decode(value, frontmatter) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof frontmatter.measurement_sha256 !== 'string' ||
      typeof frontmatter.source_sha256 !== 'string'
    )
      throw new Error('Invalid compact profile envelope.')
    const wire = value as Record<string, unknown>
    const snapshot = await decodeCompactSnapshot(
      wire.snapshot,
      frontmatter.measurement_sha256,
      frontmatter.source_sha256,
    )
    const replay = wire.semanticReplay
    const semanticReplay =
      replay && typeof replay === 'object' && !Array.isArray(replay)
        ? {
            ...replay,
            evidence: decodeCompactEvidence(
              (replay as Record<string, unknown>).evidence,
            ),
          }
        : replay
    const profile = await validateExpandedProfileV2({
      ...wire,
      snapshot,
      ...(replay === undefined ? {} : { semanticReplay }),
    })
    retainCompactSnapshot(profile.snapshot, wire.snapshot)
    return profile
  },
}

export async function renderCompactProfileV2Note(
  profile: ProfileV2,
  guidance: string,
  newline = '\n',
  locale = getModelLocale(),
) {
  const note = await renderNote(
    profile,
    guidance,
    newline,
    validateExpandedProfileV2,
    v2Codec,
    locale,
  )
  if (new TextEncoder().encode(note).byteLength > 6 * 1024 * 1024)
    throw new Error('Profile note exceeds 6 MiB.')
  return note
}

export function parseCompactAnyProfileNote(note: string) {
  return parseNote<ProfileMachine | ProfileV2>(
    note,
    async (value) => {
      if (
        value &&
        typeof value === 'object' &&
        'schema' in value &&
        value.schema === 'report-style-profile/2'
      )
        return validateExpandedProfileV2(value)
      return validateExpandedProfile(value)
    },
    {
      async encode() {
        throw new Error('Read-only compact codec.')
      },
      async decode(value, frontmatter) {
        if (
          value &&
          typeof value === 'object' &&
          'schema' in value &&
          value.schema === 'report-style-profile/2'
        )
          return v2Codec.decode(value, frontmatter)
        return codec.decode(value, frontmatter)
      },
    },
  )
}
