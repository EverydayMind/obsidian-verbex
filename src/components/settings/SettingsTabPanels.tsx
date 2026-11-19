import { App } from 'obsidian'

import { t } from '../../i18n'
import VerbexPlugin from '../../main'

import { AgentSection } from './sections/AgentSection'
import {
  ChatAdvancedSettings,
  ChatModelSetting,
  ChatSection,
} from './sections/ChatSection'
import { DocumentIndexSettings } from './sections/DocumentIndexSettings'
import { DocumentJobsSection } from './sections/DocumentJobsSection'
import { EtcSection } from './sections/EtcSection'
import { ChatModelsSubSection } from './sections/models/ChatModelsSubSection'
import { EmbeddingModelsSubSection } from './sections/models/EmbeddingModelsSubSection'
import { OpenSourceLicensesSection } from './sections/OpenSourceLicensesSection'
import { ProvidersSection } from './sections/ProvidersSection'
import {
  EmbeddingDbSetting,
  EmbeddingModelSettings,
  RAGAdvancedSettings,
  RetrievalEvaluationSetting,
} from './sections/RAGSection'
import { TemplateSection } from './sections/TemplateSection'
import { ToolManagementSection } from './sections/ToolManagementSection'
import {
  VerbexContextSection,
  VerbexPermissionsSection,
  VerbexRelatedNotesSetting,
  VerbexSearchAdvanced,
  VerbexSearchSection,
} from './sections/VerbexRuntimeSections'
import { SettingsAdvanced } from './SettingsAdvanced'
import { SettingsReadiness } from './SettingsReadiness'

type PanelProps = {
  app: App
  plugin: VerbexPlugin
}

export function GetStartedPanel({
  app,
  plugin,
  onShowToolManagement,
}: PanelProps & { onShowToolManagement: () => void }) {
  return (
    <>
      <SettingsReadiness
        app={app}
        plugin={plugin}
        onShowToolManagement={onShowToolManagement}
      />
      <ProvidersSection app={app} plugin={plugin} />
      <div className="verbex-settings-section">
        <h2 className="verbex-settings-header">
          {t('settings.chatModels.title')}
        </h2>
        <ChatModelsSubSection app={app} plugin={plugin} />
        <ChatModelSetting />
      </div>
    </>
  )
}

export function ToolManagementPanel({ app, plugin }: PanelProps) {
  return (
    <>
      <ToolManagementSection app={app} plugin={plugin} />
      <VerbexPermissionsSection />
    </>
  )
}

export function ChatPanel({ app, plugin }: PanelProps) {
  return (
    <>
      <ChatSection />
      <TemplateSection app={app} plugin={plugin} />
      <DocumentJobsSection />
      <SettingsAdvanced>
        <ChatAdvancedSettings />
        <AgentSection app={app} />
      </SettingsAdvanced>
    </>
  )
}

export function SearchPanel({ app, plugin }: PanelProps) {
  return (
    <>
      <VerbexSearchSection />
      <div className="verbex-settings-section">
        <h2 className="verbex-settings-header">
          {t('settings.documentSearch.title')}
        </h2>
        <DocumentIndexSettings app={app} part="basic" />
      </div>
      <div className="verbex-settings-section">
        <h2 className="verbex-settings-header">
          {t('settings.embeddingModels.title')}
        </h2>
        <EmbeddingModelSettings plugin={plugin} />
        <EmbeddingModelsSubSection app={app} plugin={plugin} />
        <EmbeddingDbSetting app={app} plugin={plugin} />
      </div>
      <div className="verbex-settings-section">
        <h2 className="verbex-settings-header">{t('views.related.title')}</h2>
        <VerbexRelatedNotesSetting />
      </div>
      <SettingsAdvanced>
        <DocumentIndexSettings app={app} part="advanced" />
        <RAGAdvancedSettings app={app} plugin={plugin} />
        <VerbexSearchAdvanced />
        <RetrievalEvaluationSetting app={app} plugin={plugin} />
      </SettingsAdvanced>
    </>
  )
}

export function AdvancedPanel({ app, plugin }: PanelProps) {
  return (
    <>
      <VerbexContextSection />
      <EtcSection app={app} plugin={plugin} />
      <OpenSourceLicensesSection />
    </>
  )
}
