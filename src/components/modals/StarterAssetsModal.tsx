import { App } from 'obsidian'
import { useCallback, useEffect, useState } from 'react'

import { t } from '../../i18n'
import { getModelLocale } from '../../i18n/modelLocale'
import {
  STARTER_PACK_IDS,
  StarterFolders,
  StarterLocale,
  StarterPackId,
  StarterPackStatus,
  installStarterPacks,
  starterStatus,
} from '../../verbex/starterAssets'
import { ReactModal } from '../common/ReactModal'

export type StarterAssetsOptions = {
  /** Where the vault keeps skills, workflows and prompts right now. */
  getFolders: () => StarterFolders
  /** Called after files were written, so lists can be read again. */
  onInstalled: () => void
}

type Props = StarterAssetsOptions & { app: App; onClose: () => void }

export class StarterAssetsModal extends ReactModal<Props> {
  constructor(app: App, options: StarterAssetsOptions) {
    super({
      app,
      Component: StarterAssets,
      props: { app, ...options },
      options: { title: t('ui.StarterAssets.title') },
    })
    this.modalEl.addClass('verbex-starter-assets-modal')
  }
}

const packText = (id: StarterPackId) =>
  ({
    writing: {
      name: t('ui.StarterAssets.writing'),
      desc: t('ui.StarterAssets.writingDesc'),
    },
    obsidian: {
      name: t('ui.StarterAssets.obsidian'),
      desc: t('ui.StarterAssets.obsidianDesc'),
    },
    documents: {
      name: t('ui.StarterAssets.documents'),
      desc: t('ui.StarterAssets.documentsDesc'),
    },
  })[id]

/** Sets most people can use at once; the other needs companion plugins. */
const PRESELECTED: readonly StarterPackId[] = ['writing', 'obsidian']

export function StarterAssets({
  app,
  getFolders,
  onInstalled,
  onClose,
}: Props) {
  // Skills are instructions for the model, so they follow its language.
  const [locale, setLocale] = useState<StarterLocale>(() =>
    getModelLocale() === 'ko' ? 'ko' : 'en',
  )
  const [packs, setPacks] = useState<StarterPackStatus[] | null>(null)
  const [selected, setSelected] = useState<StarterPackId[]>([...PRESELECTED])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const failed = (error: unknown) =>
    setMessage(
      t('ui.StarterAssets.failed', {
        p0: error instanceof Error ? error.message : String(error),
      }),
    )

  const load = useCallback(async () => {
    try {
      setPacks(await starterStatus(app, getFolders(), locale))
    } catch (error) {
      setPacks([])
      failed(error)
    }
  }, [app, getFolders, locale])

  useEffect(() => {
    void load()
  }, [load])

  /** Offered in this language and not complete yet. */
  const open = (pack: StarterPackStatus) =>
    pack.files > 0 && pack.existing < pack.files

  const install = async () => {
    setBusy(true)
    try {
      const wanted = selected.filter((id) =>
        (packs ?? []).some((pack) => pack.id === id && open(pack)),
      )
      const result = await installStarterPacks(
        app,
        getFolders(),
        wanted,
        locale,
      )
      setMessage(
        result.failed.length > 0
          ? t('ui.StarterAssets.partly', {
              p0: result.written.length,
              p1: result.failed.length,
              p2: result.failed[0].error,
            })
          : result.written.length > 0
            ? t('ui.StarterAssets.done', {
                p0: result.written.length,
                p1: result.kept.length,
              })
            : t('ui.StarterAssets.nothingNew'),
      )
      if (result.written.length > 0) onInstalled()
    } catch (error) {
      failed(error)
    } finally {
      await load()
      setBusy(false)
    }
  }

  if (!packs) return <div>{t('ui.StarterAssets.loading')}</div>

  const folders = getFolders()
  return (
    <div className="verbex-starter-assets">
      <p>{t('ui.StarterAssets.intro')}</p>
      <label className="verbex-starter-assets-language">
        {t('ui.StarterAssets.language')}
        <select
          className="dropdown"
          value={locale}
          disabled={busy}
          onChange={(event) => {
            setMessage(null)
            // Counts belong to a language; show none until they are read.
            setPacks(null)
            setLocale(event.target.value === 'ko' ? 'ko' : 'en')
          }}
        >
          <option value="ko">{t('ui.StarterAssets.korean')}</option>
          <option value="en">{t('ui.StarterAssets.english')}</option>
        </select>
      </label>
      {STARTER_PACK_IDS.map((id) => {
        const pack = packs.find((item) => item.id === id)
        if (!pack) return null
        const text = packText(id)
        const offered = pack.files > 0
        const complete = offered && pack.existing === pack.files
        return (
          <div className="verbex-starter-assets-row" key={id}>
            <label className="verbex-starter-assets-pack">
              <input
                type="checkbox"
                checked={selected.includes(id) && open(pack)}
                disabled={busy || !open(pack)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, id]
                      : current.filter((item) => item !== id),
                  )
                }
              />
              <span>
                <strong>{text.name}</strong>
                <span className="verbex-starter-assets-desc">{text.desc}</span>
                <span className="verbex-starter-assets-count">
                  {!offered
                    ? t('ui.StarterAssets.koreanOnly')
                    : t('ui.StarterAssets.counts', {
                        p0: pack.skills,
                        p1: pack.workflows,
                        p2: pack.prompts,
                      })}
                  {complete
                    ? ` · ${t('ui.StarterAssets.allInstalled')}`
                    : pack.existing > 0
                      ? ` · ${t('ui.StarterAssets.someInstalled', { p0: pack.files, p1: pack.existing })}`
                      : ''}
                </span>
              </span>
            </label>
            {offered ? (
              <details className="verbex-starter-assets-list">
                <summary>{t('ui.StarterAssets.showSkills')}</summary>
                {pack.skillNames.join(', ')}
              </details>
            ) : null}
          </div>
        )
      })}
      <p className="verbex-starter-assets-note">
        {t('ui.StarterAssets.location', {
          p0: [
            folders.skillsFolder,
            folders.workflowsFolder,
            folders.promptsFolder,
          ].join(', '),
        })}
      </p>
      {message ? (
        <p className="verbex-starter-assets-message" role="status">
          {message}
        </p>
      ) : null}
      <div className="modal-button-container">
        <button
          className="mod-cta"
          disabled={
            busy ||
            !packs.some((pack) => selected.includes(pack.id) && open(pack))
          }
          onClick={() => void install()}
        >
          {busy
            ? t('ui.StarterAssets.installing')
            : t('ui.StarterAssets.install')}
        </button>
        <button className="mod-cancel" disabled={busy} onClick={onClose}>
          {t('ui.StarterAssets.close')}
        </button>
      </div>
    </div>
  )
}
