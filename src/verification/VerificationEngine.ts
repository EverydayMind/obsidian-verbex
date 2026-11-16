/**
 * Step output verification (PRD §15). After a step produces its draft and
 * changes, the engine mechanically checks the result against the step's
 * verification spec: required format sections, that cited sources actually
 * resolve to vault files, that required artifacts were produced, and that a
 * checkpoint was written when one was expected.
 *
 * Failures are returned (not thrown) so the executor can offer the user a
 * choice, or — when `self_correction` is on — trigger a single LLM rewrite.
 */

export type VerificationFailureType =
  | 'missing_section'
  | 'missing_artifact'
  | 'missing_citation'
  | 'broken_citation'
  | 'missing_checkpoint'

export type VerificationFailure = {
  type: VerificationFailureType
  message: string
}

export type VerificationSpec = {
  /** Markdown headings (without `#`) that must be present in the output. */
  requiredSections?: string[]
  /** Artifact keys the step must have produced. */
  requiredArtifacts?: string[]
  /** When true, every cited path must resolve to an existing vault file. */
  requireCitations?: boolean
  /** When true, a checkpoint must have been created before applying. */
  requireCheckpoint?: boolean
}

export type VerificationInput = {
  text: string
  artifacts: Record<string, string>
  /** Paths cited by the output (e.g. extracted from links). */
  citedPaths: string[]
  checkpointCreated: boolean
  /** Vault-relative paths that exist, used to validate citations. */
  vaultPaths: Set<string>
}

export type VerificationResult = {
  ok: boolean
  failures: VerificationFailure[]
}

/**
 * Blank out fenced code blocks (``` or ~~~ delimited) so their contents are not
 * scanned for structure. Otherwise a `#`-prefixed line inside a Markdown code
 * example would be mistaken for a real document heading. Fence lines are
 * replaced by empty lines rather than removed so line-based scanning downstream
 * keeps its positions.
 */
/**
 * Strip inline code spans (`...`) from a single line so that a `# heading`
 * inside backticks is never mistaken for a real document heading.
 */
function stripInlineCode(line: string): string {
  return line.replace(/`[^`\n]*`/g, '')
}

function stripFencedCodeBlocks(text: string): string {
  let inFence = false
  let fenceMarker = ''
  return text
    .split('\n')
    .map((line) => {
      const fence = /^\s*(`{3,}|~{3,})/.exec(line)
      if (fence) {
        if (!inFence) {
          inFence = true
          fenceMarker = fence[1][0]
          return ''
        }
        // Only a fence of the same kind closes the block.
        if (fence[1][0] === fenceMarker) {
          inFence = false
          fenceMarker = ''
        }
        return ''
      }
      return inFence ? '' : line
    })
    .join('\n')
}

function headingPresent(text: string, heading: string): boolean {
  const target = heading.trim().toLowerCase()
  return stripFencedCodeBlocks(text)
    .split('\n')
    .some((line) => {
      // Strip inline code first so `# heading` inside backticks is not matched.
      const match = /^#{1,6}\s+(.*)$/.exec(stripInlineCode(line).trim())
      return match ? match[1].trim().toLowerCase() === target : false
    })
}

function citationResolves(cited: string, vaultPaths: Set<string>): boolean {
  if (vaultPaths.has(cited)) return true
  // Wikilink-style citation without extension or folder: match by basename.
  const needle = cited.replace(/\.md$/i, '').toLowerCase()
  for (const path of vaultPaths) {
    const base = path.replace(/\.md$/i, '').toLowerCase()
    if (base === needle || base.endsWith(`/${needle}`)) return true
  }
  return false
}

export function verifyStepOutput(
  spec: VerificationSpec,
  input: VerificationInput,
): VerificationResult {
  const failures: VerificationFailure[] = []

  for (const section of spec.requiredSections ?? []) {
    if (!headingPresent(input.text, section)) {
      failures.push({
        type: 'missing_section',
        message: `Required section "${section}" is missing.`,
      })
    }
  }

  for (const key of spec.requiredArtifacts ?? []) {
    if (!(key in input.artifacts)) {
      failures.push({
        type: 'missing_artifact',
        message: `Required artifact "${key}" was not produced.`,
      })
    }
  }

  if (spec.requireCitations) {
    if (input.citedPaths.length === 0) {
      failures.push({
        type: 'missing_citation',
        message: 'At least one resolvable vault citation is required.',
      })
    }
    for (const cited of input.citedPaths) {
      if (!citationResolves(cited, input.vaultPaths)) {
        failures.push({
          type: 'broken_citation',
          message: `Cited source "${cited}" does not resolve to a vault file.`,
        })
      }
    }
  }

  if (spec.requireCheckpoint && !input.checkpointCreated) {
    failures.push({
      type: 'missing_checkpoint',
      message:
        'A checkpoint was required before applying but none was created.',
    })
  }

  return { ok: failures.length === 0, failures }
}
