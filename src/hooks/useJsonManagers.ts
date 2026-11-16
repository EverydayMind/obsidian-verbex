import { usePlugin } from '../contexts/plugin-context'

export function useTemplateManager() {
  return usePlugin().jsonStorage.templateManager
}

export function useChatManager() {
  return usePlugin().jsonStorage.chatManager
}
