import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemView, WorkspaceLeaf } from 'obsidian'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'

import Chat, { ChatProps, ChatRef } from './components/chat-view/Chat'
import { CHAT_VIEW_TYPE } from './constants'
import { AppProvider } from './contexts/app-context'
import { ChatViewProvider } from './contexts/chat-view-context'
import { DarkModeProvider } from './contexts/dark-mode-context'
import { DatabaseProvider } from './contexts/database-context'
import { DialogContainerProvider } from './contexts/dialog-container-context'
import { McpProvider } from './contexts/mcp-context'
import { PluginProvider } from './contexts/plugin-context'
import { shouldWarmUpProviders } from './contexts/providerWarmup'
import { RAGProvider } from './contexts/rag-context'
import { SettingsProvider } from './contexts/settings-context'
import { t } from './i18n'
import { VERBEX_CHAT_ICON } from './icons'
import VerbexPlugin from './main'
import type {
  ChatSubmissionResult,
  VerbexChatSubmissionOptions,
} from './provider/contract'
import { MentionableBlockData } from './types/mentionable'

export class ChatView extends ItemView {
  private root: Root | null = null
  private initialChatProps?: ChatProps
  private chatRef: React.RefObject<ChatRef> = React.createRef()

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: VerbexPlugin,
  ) {
    super(leaf)
    this.initialChatProps = plugin.initialChatProps
  }

  getViewType() {
    return CHAT_VIEW_TYPE
  }

  getIcon() {
    return VERBEX_CHAT_ICON
  }

  getDisplayText() {
    return 'Verbex chat'
  }

  async onOpen() {
    await this.render()

    // Consume chatProps
    this.initialChatProps = undefined
  }

  async onClose() {
    this.root?.unmount()
  }

  async render() {
    if (!this.root) {
      this.root = createRoot(this.containerEl.children[1])
    }

    const warmUpProviders = shouldWarmUpProviders()
    this.plugin.recordStartupDiagnostic('chat-view:mount', {
      warmUpProviders,
      searchMode: this.plugin.settings.verbex.search.mode,
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 0, // Immediately garbage collect queries. It prevents memory leak on ChatView close.
        },
        mutations: {
          gcTime: 0, // Immediately garbage collect mutations. It prevents memory leak on ChatView close.
        },
      },
    })

    this.root.render(
      <ChatViewProvider chatView={this}>
        <PluginProvider plugin={this.plugin}>
          <AppProvider app={this.app}>
            <SettingsProvider
              settings={this.plugin.settings}
              setSettings={(newSettings) =>
                this.plugin.setSettings(newSettings)
              }
              addSettingsChangeListener={(listener) =>
                this.plugin.addSettingsChangeListener(listener)
              }
            >
              <DarkModeProvider containerEl={this.containerEl}>
                <DatabaseProvider
                  getDatabaseManager={() =>
                    this.plugin.getDbManager('chat-demand')
                  }
                  // A restored ChatView must not initialize the large vector
                  // database. Explicit retrieval/index operations own that
                  // initialization; ordinary chat can use BM25 meanwhile.
                  warmUp={false}
                >
                  <RAGProvider
                    getRAGEngine={() => this.plugin.getRAGEngine('chat-demand')}
                    getRAGEngineIfReady={() =>
                      this.plugin.getRAGEngineIfReady()
                    }
                    warmUp={warmUpProviders}
                  >
                    <McpProvider
                      getMcpManager={() =>
                        this.plugin.getMcpManager('chat-view-mount')
                      }
                    >
                      <QueryClientProvider client={queryClient}>
                        <React.StrictMode>
                          <DialogContainerProvider
                            container={
                              this.containerEl.children[1] as HTMLElement
                            }
                          >
                            <Chat
                              ref={this.chatRef}
                              {...this.initialChatProps}
                            />
                          </DialogContainerProvider>
                        </React.StrictMode>
                      </QueryClientProvider>
                    </McpProvider>
                  </RAGProvider>
                </DatabaseProvider>
              </DarkModeProvider>
            </SettingsProvider>
          </AppProvider>
        </PluginProvider>
      </ChatViewProvider>,
    )
  }

  openNewChat(selectedBlock?: MentionableBlockData) {
    this.chatRef.current?.openNewChat(selectedBlock)
  }

  addSelectionToChat(selectedBlock: MentionableBlockData) {
    this.chatRef.current?.addSelectionToChat(selectedBlock)
  }

  focusMessage() {
    this.chatRef.current?.focusMessage()
  }

  /** Submit a message through the mounted Chat component's normal input path. */
  async sendMessage(message: string): Promise<boolean> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const chat = this.chatRef.current
      if (chat) return await chat.sendMessage(message)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
    throw new Error(t('ui.ChatView.theVerbexChatViewIsNotReady'))
  }

  async sendMessageV2(
    message: string,
    options?: VerbexChatSubmissionOptions,
  ): Promise<ChatSubmissionResult> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const chat = this.chatRef.current
      if (chat) return await chat.sendMessageV2(message, options)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
    throw new Error(t('ui.ChatView.theVerbexChatViewIsNotReady2'))
  }
}
