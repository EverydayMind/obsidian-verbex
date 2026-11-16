import { readDataMember } from './descriptorReader'
import type { ProviderHandle } from './discovery'

export function readProviderCapabilities(
  provider: object,
): Pick<
  ProviderHandle,
  'hasResolveTarget' | 'hasCommit' | 'resolveTarget' | 'commit' | 'editor'
> {
  const commit = readDataMember(provider, 'commit')
  const editor = readDataMember(provider, 'editor')
  const member = (name: string) =>
    editor && typeof editor === 'object'
      ? readDataMember(editor, name)
      : undefined
  const [capture, openDocuments, reveal, release, discard] = [
    'capture',
    'openDocuments',
    'reveal',
    'release',
    'discardAgentChanges',
  ].map((name) => member(name)) as (
    | ((...args: unknown[]) => unknown)
    | undefined
  )[]
  const resolveTarget = readDataMember(provider, 'resolveTarget')
  const capability = commit && typeof commit === 'object' ? commit : undefined
  const [prepare, execute, status] = ['prepare', 'execute', 'status'].map(
    (name) => (capability ? readDataMember(capability, name) : undefined),
  ) as (((...args: unknown[]) => unknown) | undefined)[]
  const canCommit = [prepare, execute, status].every(
    (item) => typeof item === 'function',
  )
  return {
    hasResolveTarget: typeof resolveTarget === 'function',
    resolveTarget:
      typeof resolveTarget === 'function'
        ? (resolveTarget as (...args: unknown[]) => unknown)
        : undefined,
    hasCommit: canCommit,
    commit:
      capability && prepare && execute && status && canCommit
        ? { receiver: capability, prepare, execute, status }
        : undefined,
    editor:
      typeof capture === 'function'
        ? {
            receiver: editor as object,
            capture,
            openDocuments:
              typeof openDocuments === 'function' ? openDocuments : undefined,
            reveal: typeof reveal === 'function' ? reveal : undefined,
            release: typeof release === 'function' ? release : undefined,
            discardAgentChanges:
              typeof discard === 'function' ? discard : undefined,
          }
        : undefined,
  }
}
