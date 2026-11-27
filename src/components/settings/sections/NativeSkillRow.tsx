import { Fragment } from 'react'

import { TOOL_REGISTRY } from '../../../core/tools/toolCatalogRegistry'
import { t } from '../../../i18n'
import type { SkillAssetEntry } from '../../../provider/interop/hostCapabilities/skillAssets'

import { NativeSkillBodyView, type ReadSkillBody } from './NativeSkillBodyView'

/** Frontmatter settings that widen what a Skill can expose or require. */
const EXPOSURE_KEYS = [
  'tools',
  'allowed-tools',
  'preferred-tools',
  'required-plugins',
  'requires-host-tools',
  'workflow',
  'standalone',
  'cross_document',
  'applies_to',
  'trigger_keywords',
] as const

/** Keys whose values are tool names. */
const TOOL_KEYS = new Set([
  'tools',
  'allowed-tools',
  'preferred-tools',
  'requires-host-tools',
])

/** A built-in tool that writes. Plugin tools (`plg__...`) show their effect elsewhere. */
export function isBuiltinWriteTool(name: string): boolean {
  return (
    !name.startsWith('plg__') &&
    Object.hasOwn(TOOL_REGISTRY, name) &&
    TOOL_REGISTRY[name].category === 'write'
  )
}

const frontmatterText = (value: unknown): string =>
  typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
function exposureLines(
  frontmatter: Record<string, unknown>,
): { key: string; items: string[] }[] {
  return EXPOSURE_KEYS.flatMap((key) => {
    const value = frontmatter[key]
    if (value === undefined) return []
    const items = (Array.isArray(value) ? value : [value]).map(frontmatterText)
    return items.join('') === '' ? [] : [{ key, items }]
  })
}

function ExposureLine({ line }: { line: { key: string; items: string[] } }) {
  return (
    <div>
      {line.key}:{' '}
      {line.items.map((item, index) => (
        <Fragment key={`${item}:${index}`}>
          {index > 0 && ', '}
          {TOOL_KEYS.has(line.key) && isBuiltinWriteTool(item) ? (
            <strong className="verbex-native-write-tool">
              {item} ({t('ui.nativeSkills.writeTool')})
            </strong>
          ) : (
            item
          )}
        </Fragment>
      ))}
    </div>
  )
}

/** One Skill of a provider under review: its facts, then an optional body view. */
export function NativeSkillRow({
  skill,
  readBody,
}: {
  skill: SkillAssetEntry
  readBody?: ReadSkillBody
}) {
  const lines = exposureLines(skill.frontmatter)
  return (
    <>
      <tr>
        <td>{skill.locale}</td>
        <td>{skill.frontmatter.name}</td>
        <td>{skill.frontmatter.description}</td>
        <td>{skill.bodyTokens}</td>
        <td>
          {lines.length === 0
            ? t('ui.nativeSkills.noExposure')
            : lines.map((line) => <ExposureLine key={line.key} line={line} />)}
        </td>
      </tr>
      {readBody && (
        <tr>
          <td colSpan={5}>
            <NativeSkillBodyView
              skill={{ id: skill.id, locale: skill.locale }}
              readBody={readBody}
            />
          </td>
        </tr>
      )}
    </>
  )
}
