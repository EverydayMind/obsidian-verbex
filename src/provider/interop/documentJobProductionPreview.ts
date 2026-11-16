import { oversizedPreviewFact } from './documentJobGuardText'
import { PreviewResultTooLarge, previewDerivedExport } from './documentJobPorts'
import {
  type PreviewInput,
  documentJobPreviewFailure,
} from './documentJobPreviewFailure'
import { templatePreviewSchema } from './documentJobPreviewSchema'
import { hostInternalRead } from './hostInternalRead'
import type { JsonObject } from './protocol'

/** Both production paths share the error boundary and sent-hash observations. */
export async function documentJobProductionPreview<T>(
  input: PreviewInput,
  call: () => Promise<T>,
): Promise<{ preview: T } | { fact: JsonObject }> {
  try {
    return { preview: await call() }
  } catch (error) {
    if (error instanceof PreviewResultTooLarge)
      return { fact: oversizedPreviewFact() }
    return { fact: await documentJobPreviewFailure(error, input) }
  }
}

export function templateProductionPreview(input: PreviewInput) {
  return documentJobProductionPreview(input, async () => {
    const raw = await hostInternalRead(
      input.host,
      'md-to-hwpx',
      'preview_derived_export',
      {
        note_path: input.request.draft_path,
        expected_note_sha256: input.draftSha,
        expected_template_sha256: input.sourceSha,
      },
      input.signal,
    )
    const preview = templatePreviewSchema.parse(raw)
    if (preview.templateSha256 !== input.sourceSha)
      throw new Error('Template preview binding mismatch.')
    return preview
  })
}

export function sampleProductionPreview(
  input: PreviewInput,
  bundle: JsonObject,
  derivationSha: string,
) {
  return documentJobProductionPreview(input, () =>
    previewDerivedExport(
      input.host,
      {
        derive_from: bundle,
        note_path: input.request.draft_path,
        expected_note_sha256: input.draftSha,
      },
      derivationSha,
      input.signal,
    ),
  )
}
