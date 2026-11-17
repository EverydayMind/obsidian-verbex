import { t } from '../../i18n'

export default function DotLoader() {
  return (
    <span
      className="verbex-dot-loader"
      aria-label={t('ui.DotLoader.loading')}
    ></span>
  )
}
