import { L } from '../../../i18n/modelText'
import type { JsonObject } from '../../../provider/interop/protocol'

import { MD_DIALECT_V2 } from './dialectV2'

export function decompositionRoles(
  markers: string[],
  _dialect = MD_DIALECT_V2 as string,
): JsonObject {
  const roles: JsonObject = {}
  for (const marker of markers) {
    if (
      marker.startsWith('SPACE:') ||
      ['CONTENT', 'DECOMPOSITION', 'BODY_START'].includes(marker) ||
      marker.startsWith('META:')
    )
      continue
    const heading = marker.match(/^H([1-6])(?::(.+))?$/)
    {
      const name =
        heading?.[2] ?? (marker.startsWith('BODY:') ? marker.slice(5) : '')
      roles[marker] = L({
        ko: `${heading ? '#'.repeat(Number(heading[1])) + ' 제목' : '일반 본문'}${name ? `, 바로 앞에 <!--hwpx:${name}-->` : ''}`,
        en: `${heading ? '#'.repeat(Number(heading[1])) + ' heading' : 'plain body paragraph'}${name ? `, immediately preceded by <!--hwpx:${name}-->` : ''}`,
      })
      continue
    }
  }
  return roles
}
