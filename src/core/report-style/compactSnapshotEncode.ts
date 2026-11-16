// Provisional inverse of compactSnapshot; it does not define snapshot/2.
import { copyJson } from '../../provider/interop/descriptorReader'
import type { JsonValue } from '../../provider/interop/protocol'

import { decodeCompactSnapshot } from './compactSnapshot'
import { validateExpandedSnapshot } from './expandedSnapshot'

const LIMIT = 16 * 1024 * 1024
const sides = ['left', 'right', 'top', 'bottom'] as const
const languages = [
  'hangul',
  'latin',
  'hanja',
  'japanese',
  'other',
  'symbol',
  'user',
] as const
const fields = ['fonts', 'ratioPct', 'spacingPct'] as const
const canonical = (value: JsonValue): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`
}

/** Input is copied and checked before encoding; the returned transport is bounded. */
export async function encodeCompactSnapshot(
  input: unknown,
  expectedMeasurementSha256: string,
  expectedSourceSha256: string,
): Promise<unknown> {
  const value = copyJson(input, {
    maxDepth: 32,
    maxNodes: 1500000,
    maxBytes: 4 * LIMIT,
  })
  const snapshot = await validateExpandedSnapshot(
    value,
    expectedMeasurementSha256,
    expectedSourceSha256,
  )
  const styles: JsonValue[] = [],
    styleIndices = new Map<string, number>()
  const atoms: JsonValue[] = [],
    atomIndices = new Map<string, number>()
  const intern = (
    item: JsonValue,
    entries: JsonValue[],
    indices: Map<string, number>,
    max: number,
  ) => {
    const key = canonical(item),
      existing = indices.get(key)
    if (existing !== undefined) return existing
    if (entries.length >= max)
      throw new Error('Compact dictionary exceeds limit.')
    const index = entries.length
    entries.push(item)
    indices.set(key, index)
    return index
  }
  const characterStyles = snapshot.characterStyles.map((style) => {
    const result: Record<string, unknown> = { ...style }
    for (const field of fields)
      result[field] = Object.fromEntries(
        languages.map((language) => [
          language,
          intern(
            style[field][language] as unknown as JsonValue,
            atoms,
            atomIndices,
            4096 * 7 * 3,
          ),
        ]),
      )
    return result
  })
  const tables = snapshot.tables.map((table) => ({
    ...table,
    cells: table.cells.map((cell) => {
      const { borders, fillRgb, paddingPt, ...rest } = cell
      const atom = (item: typeof fillRgb) => ({
        ...item,
        evidenceRef:
          item.evidenceRef === cell.ref ? { cell: true } : item.evidenceRef,
      })
      const style = {
        borders: Object.fromEntries(
          sides.map((side) => [
            side,
            atom(borders[side] as unknown as typeof fillRgb),
          ]),
        ),
        fillRgb: atom(fillRgb),
        paddingPt: Object.fromEntries(
          sides.map((side) => [
            side,
            atom(paddingPt[side] as unknown as typeof fillRgb),
          ]),
        ),
      }
      return {
        ...rest,
        styleIndex: intern(style, styles, styleIndices, 4096),
      }
    }),
  }))
  const packed = {
    format: 'kordoc-style-intern-experiment/0.2',
    measurementSha256: expectedMeasurementSha256,
    snapshot: { ...snapshot, characterStyles, tables },
    styles,
    languageAtoms: atoms,
  }
  if (
    new TextEncoder().encode(JSON.stringify(packed)).byteLength >
    4 * 1024 * 1024
  )
    throw new Error('Packed snapshot exceeds 4 MiB.')
  // Cross-check the inverse and hash before this value can be persisted.
  await decodeCompactSnapshot(
    packed,
    expectedMeasurementSha256,
    expectedSourceSha256,
  )
  return packed
}
