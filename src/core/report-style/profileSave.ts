import type { App } from 'obsidian'

import { DEFAULT_PROFILE_FOLDER } from '../../constants'
import { runtimeGlobal } from '../../platform/runtime'
import { type ToolArgs, changeHelper } from '../tools/localToolCommon'

import { renderCompactProfileNote } from './compactProfileNote'
import { measureCompactStyle } from './compactStyleApi'
import {
  type StyleApi,
  StyleMeasurementError,
  measureStyle,
} from './kordocStyleApi'
import { renderProfileNote } from './note'
import type { ProfileMachine } from './types'

export async function prepareProfileSave(input: {
  app: App
  args: ToolArgs
  path: (path: string) => string
  byteHash: (path: string) => Promise<string>
  api: () => StyleApi
  signal?: AbortSignal
}) {
  const { app, args, path: validatePath, byteHash, api, signal } = input
  const sourcePath = args.source_path as string,
    hash = await byteHash(sourcePath)
  if (args.expected_source_sha256 && args.expected_source_sha256 !== hash)
    throw new Error('Source changed.')
  const styleApi = api()
  let compact = false
  let measurement
  try {
    measurement = await measureStyle(styleApi, sourcePath, hash, signal)
  } catch (error) {
    if (
      !(error instanceof StyleMeasurementError) ||
      error.code !== 'too_large' ||
      !styleApi.extractCompact
    )
      throw error
    measurement = await measureCompactStyle(styleApi, sourcePath, hash, signal)
    compact = true
  }
  const id = runtimeGlobal().crypto.randomUUID(),
    path = validatePath(
      (args.profile_path as string) ?? `${DEFAULT_PROFILE_FOLDER}/${id}.md`,
    )
  if (!path.endsWith('.md'))
    throw new Error(
      `profile_path must end with .md (got ${path}). Add .md or omit profile_path to use ${DEFAULT_PROFILE_FOLDER}/<id>.md.`,
    )
  if (await app.vault.adapter.exists(path))
    throw new Error(
      `Profile ${path} already exists; overwrite forbidden. Reuse it with read_style_profile, or pass a new .md path.`,
    )
  const now = new Date().toISOString()
  const machine: ProfileMachine = {
    schema: 'report-style-profile/1',
    id,
    revision: 1,
    created: now,
    updated: now,
    title: (args.title as string) ?? sourcePath.split('/').pop() ?? sourcePath,
    sourcePath,
    ...measurement,
    bindings: [],
    fixedRegions: [],
    template: null,
  }
  const after = await (compact
    ? renderCompactProfileNote(machine, '')
    : renderProfileNote(machine, ''))
  if (signal?.aborted) throw new Error('Report style operation cancelled.')
  return changeHelper('save_style_profile', {
    op: 'create',
    kind: 'create',
    path,
    before: null,
    after,
    approvalMode: 'whole_change',
    binarySourceDependencies: [{ path: sourcePath, sha256Before: hash }],
  })
}
