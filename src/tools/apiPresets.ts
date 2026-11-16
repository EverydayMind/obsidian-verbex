import type { App } from 'obsidian'

import { t } from '../i18n'
import { tasksConnectorPreset } from '../provider/connectors/presets'
import {
  dataProperty,
  resolveConnectorTarget,
} from '../provider/connectors/targetResolver'
import { KORDOC_PROVIDER_ID } from '../provider/contract'

import { nativeToolReady } from './nativeCatalog'

export type ApiPreset = {
  id: 'tasks' | 'dataview' | 'kordoc'
  title: string
  status: string
  ready: boolean
  description: string
}
export function apiPresets(
  app: App,
  registeredTools: readonly string[],
): ApiPreset[] {
  const plugins = (
    app as App & {
      plugins?: {
        manifests?: Record<string, unknown>
        enabledPlugins?: Set<string>
      }
    }
  ).plugins
  const status = (id: string, ready: boolean) =>
    ready
      ? t('ui.apiPresets.aPIReady')
      : !plugins?.manifests?.[id]
        ? t('ui.apiPresets.notInstalled')
        : !plugins.enabledPlugins?.has(id)
          ? t('ui.apiPresets.disabled')
          : t('ui.apiPresets.aPINotReadyCheckCompatibility')
  let tasksReady = false
  try {
    const target = resolveConnectorTarget(app, tasksConnectorPreset(), () => 1)
    tasksReady =
      typeof dataProperty(target.object, 'executeToggleTaskDoneCommand') ===
      'function'
  } catch {
    /* unavailable */
  }
  const dataviewReady = nativeToolReady(app, 'dataview_query')
  const kordocReady = registeredTools.some((name) =>
    name.startsWith('kordoc__'),
  )
  return [
    {
      id: 'tasks',
      title: 'Tasks',
      ready: tasksReady,
      status: status('obsidian-tasks-plugin', tasksReady),
      description: t(
        'ui.apiPresets.calculateTaskLineStatusRequiresRegistrationAnd',
      ),
    },
    {
      id: 'dataview',
      title: 'Dataview',
      ready: dataviewReady,
      status: status('dataview', dataviewReady),
      description: t(
        'ui.apiPresets.providesDQLQueriesAndBlockRenderingConnects',
      ),
    },
    {
      id: 'kordoc',
      title: 'KORDOC',
      ready: kordocReady,
      status: status(KORDOC_PROVIDER_ID, kordocReady),
      description: t('ui.apiPresets.useHWPXDocumentBlockInspectionAndEditing'),
    },
  ]
}
