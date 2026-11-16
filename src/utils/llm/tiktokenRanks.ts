import { TiktokenBPE } from 'js-tiktoken/lite'
import { App, normalizePath, requestUrl } from 'obsidian'

const RANKS_FILE = 'cl100k_base.json'
const REMOTE_RANKS_URL = 'https://tiktoken.pages.dev/js/cl100k_base.json'

function parseRanks(raw: string): TiktokenBPE {
  const parsed = JSON.parse(raw) as Partial<TiktokenBPE>
  if (
    typeof parsed.pat_str !== 'string' ||
    typeof parsed.bpe_ranks !== 'string' ||
    !parsed.special_tokens ||
    typeof parsed.special_tokens !== 'object'
  ) {
    throw new Error('cl100k_base.json has an invalid tokenizer shape')
  }
  return parsed as TiktokenBPE
}

/**
 * Load tokenizer ranks from the installed plugin folder first. The network
 * fallback is intentionally inside the returned lazy loader, so startup never
 * performs a tokenizer request and offline installs remain local-first.
 */
export function createCl100kRanksLoader(
  app: App,
  pluginDir?: string,
): () => Promise<TiktokenBPE> {
  return async () => {
    let localError: unknown = null
    if (pluginDir) {
      const localPath = normalizePath(`${pluginDir}/${RANKS_FILE}`)
      try {
        if (await app.vault.adapter.exists(localPath)) {
          return parseRanks(await app.vault.adapter.read(localPath))
        }
        localError = new Error(`resource not found: ${localPath}`)
      } catch (error) {
        localError = error
      }
    } else {
      localError = new Error('plugin directory is unavailable')
    }

    try {
      const response = await requestUrl(REMOTE_RANKS_URL)
      return parseRanks(response.text)
    } catch (remoteError) {
      throw new Error(
        `Verbex tokenizer ranks are unavailable. Reinstall the plugin so ${RANKS_FILE} is present; local load failed (${formatError(localError)}), and remote fallback failed (${formatError(remoteError)}).`,
      )
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
