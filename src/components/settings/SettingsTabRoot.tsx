import { App } from 'obsidian'
import React from 'react'

import { t } from '../../i18n'
import VerbexPlugin from '../../main'

import { AgentSection } from './sections/AgentSection'
import { ChatSection } from './sections/ChatSection'
import { DocumentJobsSection } from './sections/DocumentJobsSection'
import { EtcSection } from './sections/EtcSection'
import { ChatModelsSubSection } from './sections/models/ChatModelsSubSection'
import { EmbeddingModelsSubSection } from './sections/models/EmbeddingModelsSubSection'
import { OpenSourceLicensesSection } from './sections/OpenSourceLicensesSection'
import { ProvidersSection } from './sections/ProvidersSection'
import { RAGSection } from './sections/RAGSection'
import { TemplateSection } from './sections/TemplateSection'
import { ToolManagementSection } from './sections/ToolManagementSection'
import {
  VerbexContextSection,
  VerbexPermissionsSection,
  VerbexSearchSection,
} from './sections/VerbexRuntimeSections'

type SettingsTabRootProps = {
  app: App
  plugin: VerbexPlugin
}

// Top-level grouping that mirrors PRD section 16 settings:
// LLM / Embedding / Search / Permissions / Tools / Context / Advanced.
function GroupHeading({ label }: { label: string }) {
  return <div className="verbex-settings-group-heading">{label}</div>
}

export function SettingsTabRoot({ app, plugin }: SettingsTabRootProps) {
  return (
    <>
      <GroupHeading label={t('settings.groups.llm')} />
      <ChatSection />
      <AgentSection app={app} />
      <ProvidersSection app={app} plugin={plugin} />
      <div className="verbex-settings-section">
        <div className="verbex-settings-header">
          {t('settings.chatModels.title')}
        </div>
        <ChatModelsSubSection app={app} plugin={plugin} />
      </div>

      <GroupHeading label={t('settings.groups.embedding')} />
      <div className="verbex-settings-section">
        <div className="verbex-settings-header">
          {t('settings.embeddingModels.title')}
        </div>
        <EmbeddingModelsSubSection app={app} plugin={plugin} />
      </div>
      <RAGSection app={app} plugin={plugin} />

      <GroupHeading label={t('settings.groups.search')} />
      <VerbexSearchSection />

      <GroupHeading label={t('settings.groups.permissions')} />
      <VerbexPermissionsSection />

      <GroupHeading label={t('settings.groups.tools')} />
      <ToolManagementSection app={app} plugin={plugin} />

      <GroupHeading label={t('settings.groups.context')} />
      <VerbexContextSection />
      <DocumentJobsSection />

      <GroupHeading label={t('settings.groups.advanced')} />
      <TemplateSection app={app} plugin={plugin} />
      <EtcSection app={app} plugin={plugin} />
      <OpenSourceLicensesSection />
    </>
  )
}
