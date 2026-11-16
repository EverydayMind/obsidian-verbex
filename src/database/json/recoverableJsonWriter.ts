import type { DataAdapter } from 'obsidian'

// Failure-tolerant replacement of one JSON record using only adapter
// exists/read/write/remove. Obsidian does not document rename-over-existing
// behaviour, so no rename or fsync/atomicity is assumed: after a crash the
// canonical file may be missing or torn, but a verified copy of the new
// content (`.tmp`) and of the previous valid content (`.bak`) is on disk.
//
// Both siblings deliberately do not end in `.json`, so listings and the
// canonical file-name patterns never mistake them for records.

export type JsonWriterAdapter = Pick<
  DataAdapter,
  'exists' | 'read' | 'write' | 'remove'
>

export const TEMP_SUFFIX = '.tmp'
export const BACKUP_SUFFIX = '.bak'

export class RecoverableWriteError extends Error {
  // True when the canonical file may be damaged but .tmp/.bak hold verified
  // content that can be inspected for recovery.
  readonly candidatesRetained: boolean

  constructor(message: string, candidatesRetained: boolean) {
    super(message)
    this.name = 'RecoverableWriteError'
    this.candidatesRetained = candidatesRetained
  }
}

async function writeVerified(
  adapter: JsonWriterAdapter,
  filePath: string,
  content: string,
): Promise<void> {
  await adapter.write(filePath, content)
  if ((await adapter.read(filePath)) !== content) {
    throw new Error('readback mismatch')
  }
}

async function removeQuietly(
  adapter: JsonWriterAdapter,
  filePath: string,
): Promise<void> {
  try {
    await adapter.remove(filePath)
  } catch {
    // The original failure is the one worth reporting.
  }
}

/**
 * `content` must already be sanitized/redacted: the same bytes are written to
 * the temp file, so secrets never reach disk through the recovery path.
 * `validate` throws if text is not an acceptable record.
 */
export async function writeJsonRecoverable(
  adapter: JsonWriterAdapter,
  filePath: string,
  content: string,
  validate: (text: string) => void,
): Promise<void> {
  const tempPath = `${filePath}${TEMP_SUFFIX}`
  const backupPath = `${filePath}${BACKUP_SUFFIX}`

  validate(content)

  // 1. Verified temp copy of the new content. Nothing canonical is touched yet.
  try {
    await writeVerified(adapter, tempPath, content)
  } catch (error) {
    await removeQuietly(adapter, tempPath)
    throw error
  }

  // 2. Verified backup of the existing valid record (never of a corrupt one,
  //    so an older good backup is not replaced by garbage).
  if (await adapter.exists(filePath)) {
    const previous = await adapter.read(filePath)
    let previousValid = true
    try {
      validate(previous)
    } catch {
      previousValid = false
    }
    if (previousValid) {
      try {
        await writeVerified(adapter, backupPath, previous)
      } catch (error) {
        // Canonical is still untouched; drop the temp and fail the save.
        await removeQuietly(adapter, tempPath)
        throw error
      }
    }
  }

  // 3. Replace the canonical file and verify it.
  try {
    await writeVerified(adapter, filePath, content)
    validate(await adapter.read(filePath))
  } catch (error) {
    throw new RecoverableWriteError(
      `Failed to replace ${filePath}; verified copies were retained (${error instanceof Error ? error.message : 'unknown error'})`,
      true,
    )
  }

  // 4. Cleanup. A failure here is not a save failure.
  try {
    await adapter.remove(tempPath)
  } catch (error) {
    console.warn('Failed to remove temporary JSON copy', tempPath, error)
  }
}

export function isRecoverySibling(fileName: string): boolean {
  return fileName.endsWith(TEMP_SUFFIX) || fileName.endsWith(BACKUP_SUFFIX)
}
