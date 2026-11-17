import { CornerDownLeftIcon } from 'lucide-react'

import { t } from '../../../i18n'

export function SubmitButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="verbex-chat-user-input-submit-button" onClick={onClick}>
      <div className="verbex-chat-user-input-submit-button-icons">
        <CornerDownLeftIcon size={12} />
      </div>
      <div>{t('ui.Chat.chat')}</div>
    </div>
  )
}
