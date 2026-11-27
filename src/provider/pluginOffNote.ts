import { corePluginLabel } from '../core/obsidian-core/corePluginMeta'
import { TOOL_REGISTRY } from '../core/tools/toolDefinitions'
import { L } from '../i18n/modelText'

export function pluginOffNote(
  names: readonly string[],
  pluginIds?: readonly string[],
): string {
  if (!names.length) return ''
  const ids = [
    ...new Set(
      pluginIds ??
        names
          .map((name) => TOOL_REGISTRY[name]?.requiresCorePlugin)
          .filter((id): id is string => Boolean(id)),
    ),
  ]
  const plugins = ids.length
    ? ids.map((id) =>
        L({
          ko: `${corePluginLabel(id, 'ko')} 코어 플러그인`,
          en: `${corePluginLabel(id, 'en')} core plugin`,
        }),
      )
    : [
        L({
          ko: '필요한 코어 플러그인',
          en: 'the required core plugin',
        }),
      ]
  const verb = plugins.length > 1 ? 'are' : 'is'
  return L({
    ko: `[호스트 기능 상태] ${names.join(', ')} 도구는 ${plugins.join('·')}이 꺼져 있어 이번 요청에 노출하지 않았다. Skill 지침이 이 도구를 안내해도 호출할 수 없고, 다른 도구로 같은 변경을 흉내 내지 않는다. 그 작업이 필요하면 사용자에게 Obsidian 설정에서 플러그인을 켜도록 안내한다.`,
    en: `[Host capability status] Tools ${names.join(', ')} were not exposed in this request because ${plugins.join(', ')} ${verb} disabled. They cannot be called even if Skill instructions mention them; do not imitate the same changes with other tools. If needed, ask the user to enable the plugin in Obsidian settings.`,
  })
}
