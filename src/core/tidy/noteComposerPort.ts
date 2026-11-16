import type { App, TFile } from 'obsidian'

import { L } from '../../i18n/modelText'

/**
 * Boundary for Obsidian's Note Composer core plugin. Its instance methods are
 * not public API, so every use goes through feature detection here and an
 * absent plugin or method means "unavailable", never a Verbex reimplementation.
 */
export type NoteComposer = {
  mergeFile(
    target: TFile,
    source: TFile,
    position: 'append' | 'prepend',
  ): Promise<void>
  extractSection(
    source: TFile,
    target: TFile,
    start: number,
    end: number,
    position: 'append' | 'prepend',
  ): Promise<void>
  applyTemplate(
    content: string,
    fromTitle: string,
    newTitle: string,
  ): Promise<string>
  /** What extractSection leaves in the source: link, embed or nothing. */
  replacementText: 'link' | 'embed' | 'none'
  hasTemplate: boolean
}

type ComposerInstance = {
  mergeFile?: NoteComposer['mergeFile']
  extractSection?: NoteComposer['extractSection']
  applyTemplate?: NoteComposer['applyTemplate']
  options?: { replacementText?: string; template?: string }
}

export function noteComposerUnavailable() {
  return L({
    ko: 'Obsidian 노트 작성기(Note Composer) 코어 플러그인이 꺼져 있거나 이 Obsidian 버전에서 병합·추출 기능을 찾지 못했습니다. 설정 → 코어 플러그인 → 노트 작성기를 켠 뒤 다시 시도하세요.',
    en: 'The Obsidian Note Composer core plugin is disabled, or merge/extract features could not be found in this Obsidian version. Enable Note Composer under Settings → Core plugins, then try again.',
  })
}

export function noteComposer(app: App): NoteComposer | null {
  const internal = (
    app as App & {
      internalPlugins?: {
        getEnabledPluginById?: (id: string) => ComposerInstance | null
      }
    }
  ).internalPlugins
  const instance = internal?.getEnabledPluginById?.('note-composer')
  if (
    !instance ||
    typeof instance.mergeFile !== 'function' ||
    typeof instance.extractSection !== 'function' ||
    typeof instance.applyTemplate !== 'function'
  )
    return null
  const replacement = instance.options?.replacementText
  return {
    mergeFile: instance.mergeFile.bind(instance) as NoteComposer['mergeFile'],
    extractSection: instance.extractSection.bind(
      instance,
    ) as NoteComposer['extractSection'],
    applyTemplate: instance.applyTemplate.bind(
      instance,
    ) as NoteComposer['applyTemplate'],
    replacementText:
      replacement === 'embed' || replacement === 'none' ? replacement : 'link',
    hasTemplate: Boolean(instance.options?.template),
  }
}
