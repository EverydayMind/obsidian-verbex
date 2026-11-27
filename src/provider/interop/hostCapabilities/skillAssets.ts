import { z } from 'zod'

import type {
  AssetsDescriptor,
  SkillAsset,
} from '../../../../contracts/agentinterop/host-capabilities-v1/protocol'
import {
  DESCRIPTOR_LIMITS,
  UnsafeValueError,
  copyJson,
} from '../descriptorReader'
import { PROVIDER_ID } from '../descriptorSchema'

import { jsonHasInvalidText } from './textRules'

export const MAX_SKILLS = 16
export const MAX_SKILLS_PER_LOCALE = 8
export const MAX_TOKENS_PER_LOCALE = 20_000

export type AssetsReason =
  | 'schema'
  // A well-formed version this host does not know: ignored, not a defect.
  | 'unsupported_version'
  | 'reserved_key'
  | 'duplicate_skill'
  | 'locale_switch_mismatch'
  | 'locale_limit'
  | 'foreign_required_tool'
  | 'invalid_text'
  | 'copy_limit'
  // Reserved for the caller that reads and times the member.
  | 'getter_member'
  | 'timeout'
  | 'error'

export type SkillAssetEntry = SkillAsset
export type AssetsDescriptorValue = AssetsDescriptor
export type AssetsParseResult =
  | { ok: true; value: AssetsDescriptorValue }
  | { ok: false; reason: AssetsReason; version?: number }

const toolName = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const toolList = z.array(toolName).max(32)
const skillSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/),
  locale: z.enum(['ko', 'en']),
  bodySha256: z.string().regex(/^[0-9a-f]{64}$/),
  bodyTokens: z.number().int().min(1).max(5000),
  frontmatter: z.strictObject({
    name: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[^\n\r]+$/),
    description: z.string().min(1).max(300),
    // 120: condition keywords (`a|b & c & !d`) are longer than plain phrases.
    trigger_keywords: z.array(z.string().min(1).max(120)).max(32).optional(),
    applies_to: z.array(z.string().min(1).max(32)).max(16).optional(),
    tools: toolList.optional(),
    'allowed-tools': toolList.optional(),
    'preferred-tools': toolList.optional(),
    'requires-host-tools': toolList.optional(),
    'required-plugins': z
      .array(z.string().regex(PROVIDER_ID))
      .max(8)
      .optional(),
    workflow: z.string().min(1).max(128).optional(),
    standalone: z.boolean().optional(),
    cross_document: z.boolean().optional(),
    'disable-model-invocation': z.boolean().optional(),
  }),
})
const assetsSchema = z.strictObject({
  version: z.literal(1),
  skills: z.array(skillSchema).max(MAX_SKILLS),
})

const SWITCH_LISTS = [
  'applies_to',
  'tools',
  'allowed-tools',
  'preferred-tools',
  'required-plugins',
  'requires-host-tools',
] as const
const SWITCH_FLAGS = [
  'standalone',
  'cross_document',
  'disable-model-invocation',
] as const

const fail = (reason: AssetsReason): AssetsParseResult => ({
  ok: false,
  reason,
})

function switchesDiffer(a: SkillAssetEntry, b: SkillAssetEntry): boolean {
  const x = a.frontmatter
  const y = b.frontmatter
  for (const key of SWITCH_LISTS) {
    const left = x[key] ?? []
    const right = y[key] ?? []
    if (left.length !== right.length || left.some((v, i) => v !== right[i]))
      return true
  }
  for (const key of SWITCH_FLAGS)
    if ((x[key] ?? false) !== (y[key] ?? false)) return true
  return x.workflow !== y.workflow
}

function crossRuleReason(
  skills: SkillAssetEntry[],
  pluginId: string,
): AssetsReason | null {
  const seen = new Set<string>()
  const perLocale = new Map<string, { count: number; tokens: number }>()
  for (const skill of skills) {
    const key = `${skill.id}\u0000${skill.locale}`
    if (seen.has(key)) return 'duplicate_skill'
    seen.add(key)
    const total = perLocale.get(skill.locale) ?? { count: 0, tokens: 0 }
    total.count++
    total.tokens += skill.bodyTokens
    perLocale.set(skill.locale, total)
  }
  for (const total of perLocale.values())
    if (
      total.count > MAX_SKILLS_PER_LOCALE ||
      total.tokens > MAX_TOKENS_PER_LOCALE
    )
      return 'locale_limit'
  const firstById = new Map<string, SkillAssetEntry>()
  for (const skill of skills) {
    const first = firstById.get(skill.id)
    if (!first) firstById.set(skill.id, skill)
    else if (switchesDiffer(first, skill)) return 'locale_switch_mismatch'
  }
  const ownPrefix = `plg__${pluginId}__`
  for (const skill of skills)
    for (const tool of skill.frontmatter.tools ?? [])
      if (tool.startsWith('plg__') && !tool.startsWith(ownPrefix))
        return 'foreign_required_tool'
  return null
}

/**
 * Pure judgement of a describeAssets() result: lossless copy, reserved keys,
 * text rules, closed schema, cross-entry rules, then the own-plugin rule for
 * required tools.
 */
export function parseAssetsDescriptor(
  raw: unknown,
  pluginId: string,
): AssetsParseResult {
  let copy
  try {
    copy = copyJson(raw, DESCRIPTOR_LIMITS)
  } catch (error) {
    if (error instanceof UnsafeValueError)
      return fail(error.code ? 'copy_limit' : 'schema')
    return fail('error')
  }
  if (copy && typeof copy === 'object' && !Array.isArray(copy)) {
    // A future shape is not validated at all.
    const version = (copy as { version?: unknown }).version
    if (
      typeof version === 'number' &&
      Number.isInteger(version) &&
      version !== 1
    )
      return { ok: false, reason: 'unsupported_version', version }
    if (Object.hasOwn(copy, 'workflows') || Object.hasOwn(copy, 'prompts'))
      return fail('reserved_key')
  }
  // Before the schema, so a CR in any string reports invalid_text.
  if (jsonHasInvalidText(copy)) return fail('invalid_text')
  const parsed = assetsSchema.safeParse(copy)
  if (!parsed.success) return fail('schema')
  const crossRule = crossRuleReason(parsed.data.skills, pluginId)
  if (crossRule) return fail(crossRule)
  return { ok: true, value: parsed.data }
}
