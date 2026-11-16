import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function mcpSettingsMissing(locale?: ModelLocale) {
  return L(
    {
      ko: 'MCP 서버 설정이 사라졌습니다.',
      en: 'MCP server settings are no longer available.',
    },
    locale,
  )
}
export function mcpSettingsChanged(locale?: ModelLocale) {
  return L(
    {
      ko: 'MCP 서버 설정이 바뀌었습니다. 다시 확인하세요.',
      en: 'MCP server settings changed. Check them again.',
    },
    locale,
  )
}
