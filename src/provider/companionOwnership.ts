import type { App } from 'obsidian'

import { L } from '../i18n/modelText'
import { assertUserVaultPath } from '../security/vaultPathPolicy'

import { normalizeProviderPath } from './contract'

const pendingQueries = new WeakMap<object, Promise<unknown>>()

/** Bound metadata reads by identity and time. A failed query is not an empty list. */
export async function companionOwnershipPaths(
  provider: object,
  current: () => boolean,
  app: App,
  timeoutMs = 2000,
): Promise<string[]> {
  let owner: object | null = provider
  let method: PropertyDescriptor | undefined
  while (owner && !method) {
    method = Object.getOwnPropertyDescriptor(owner, 'openDocumentPaths')
    owner = Object.getPrototypeOf(owner) as object | null
  }
  if (!method) return [] // Older protocol-1 providers lack idle ownership metadata.
  if (!('value' in method) || typeof method.value !== 'function')
    throw new Error(
      L({
        ko: '동반 편집 화면의 소유권 조회 함수를 확인하지 못했습니다.',
        en: 'Could not verify the companion editor view ownership query function.',
      }),
    )
  const callback = method.value as () => Promise<unknown>
  if (!current()) throw new Error(companionReplaced())
  let query = pendingQueries.get(provider)
  if (!query) {
    query = Promise.resolve().then(() => Reflect.apply(callback, provider, []))
    pendingQueries.set(provider, query)
    const clear = () => pendingQueries.delete(provider)
    void query.then(clear, clear)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const raw: unknown = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                L({
                  ko: '동반 편집 화면의 소유권 조회가 끝나지 않았습니다.',
                  en: 'The companion editor view ownership query has not finished.',
                }),
              ),
            ),
          timeoutMs,
        )
      }),
    ])
    if (!current()) throw new Error(companionReplaced())
    if (!Array.isArray(raw) || raw.length > 100)
      throw new Error(
        L({
          ko: '동반 편집 화면의 문서 목록이 올바르지 않습니다.',
          en: 'The companion editor view document list is invalid.',
        }),
      )
    const paths: string[] = []
    for (let index = 0; index < raw.length; index++) {
      const item = Object.getOwnPropertyDescriptor(raw, String(index))
      if (
        !item ||
        !('value' in item) ||
        typeof item.value !== 'string' ||
        item.value.length > 4096
      )
        throw new Error(
          L({
            ko: '동반 편집 화면의 문서 경로가 올바르지 않습니다.',
            en: 'The companion editor view document path is invalid.',
          }),
        )
      paths.push(assertUserVaultPath(app, normalizeProviderPath(item.value)))
    }
    return [...new Set(paths)]
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function companionReplaced(): string {
  return L({
    ko: '동반 편집 provider가 교체됐습니다.',
    en: 'The companion editing provider was replaced.',
  })
}
