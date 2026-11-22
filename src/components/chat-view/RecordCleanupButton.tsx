import { Eraser } from 'lucide-react'

import { ProviderCheckpointStore } from '../../checkpoint/ProviderCheckpointStore'
import { useApp } from '../../contexts/app-context'
import { usePlugin } from '../../contexts/plugin-context'
import { t } from '../../i18n'
import { RecordCleanupModal } from '../modals/RecordCleanupModal'

/** Opens the window that deletes stored chats, run records and the like. */
export function RecordCleanupButton({
  conversationId,
  onChatsDeleted,
  onDeleting,
}: {
  conversationId: string
  onChatsDeleted: () => void | Promise<void>
  onDeleting?: () => void
}) {
  const app = useApp()
  const plugin = usePlugin()
  return (
    <button
      className="clickable-icon"
      aria-label={t('ui.RecordCleanupModal.open')}
      onClick={() =>
        new RecordCleanupModal(app, {
          onDeleting,
          loadKeep: async () => {
            const scanned = await new ProviderCheckpointStore(app).scan()
            const activeRun =
              plugin.verbexController.runLifecycle.getSnapshot().activeRun
            return {
              openConversationIds: [
                conversationId,
                ...plugin.nativeProviderHost.activeConversations,
              ],
              keepRunIds: [
                ...(activeRun ? [activeRun.id] : []),
                // Not settled, or unreadable: the record of what a plugin
                // was about to write must stay.
                ...scanned.records
                  .filter(
                    (record) =>
                      record.state === 'pending' || record.state === 'unknown',
                  )
                  .map((record) => record.runId),
                ...scanned.unreadable.map((record) => record.runId),
              ],
              keepAllProviderCheckpoints: scanned.listingFailed,
            }
          },
          onDeleted: async (result) => {
            const chats = new Set(
              result.deleted.flatMap((item) =>
                item.target === 'chats' && item.conversationId
                  ? [item.conversationId]
                  : [],
              ),
            )
            for (const chat of chats)
              void Promise.resolve(
                plugin.nativeProviderHost.releaseDocuments(chat),
              ).catch(() => undefined)
            if (chats.size > 0) await onChatsDeleted()
          },
        }).open()
      }
    >
      <Eraser size={18} />
    </button>
  )
}
