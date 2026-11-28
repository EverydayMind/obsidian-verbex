import type { ToolArgs } from '../tools/localToolCommon'

import type { Condition } from './noteQueryArgs'
import * as modelText from './noteQueryConditionValidationText'

export function validateConditions(where: unknown[]) {
  for (const [index, item] of where.entries()) {
    const label = modelText.condition(index + 1)
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error(modelText.objectError(label))
    const c = item as Record<string, unknown>
    const key = Object.keys(c).find(
      (k) => !['field', 'op', 'value'].includes(k),
    )
    if (key) throw new Error(modelText.unknownKey(label, key))
    if (typeof c.field !== 'string' || !c.field.trim())
      throw new Error(modelText.missingField(label))
    const ops = ['eq', 'ne', 'contains', 'gte', 'lte', 'exists', 'missing']
    if (typeof c.op !== 'string' || !ops.includes(c.op))
      throw new Error(modelText.unknownOp(label, String(c.op), ops.join(', ')))
    if (!['exists', 'missing'].includes(c.op) && typeof c.value !== 'string')
      throw new Error(modelText.valueError(label))
  }
}

export function validateFields(
  args: ToolArgs,
  tasks: boolean,
  where: unknown[],
) {
  const reserved = [
    'file.path',
    'file.name',
    'file.folder',
    'file.top_folder',
    'file.mtime',
    'file.ctime',
    'file.size',
    'tasks.open',
    'tasks.done',
  ]
  const fields = [
    ...where.map((c) => (c as Condition).field),
    ...((args.fields ?? []) as string[]),
    ...[args.group_by, args.split_by, args.sort_by].filter(
      (v): v is string => typeof v === 'string',
    ),
  ]
  for (const field of fields) {
    const lower = field.toLowerCase()
    if (/^(file|tasks)\./.test(lower) && !reserved.includes(lower))
      throw new Error(modelText.unknownField(field, reserved.join(', ')))
    if (lower === 'text_count' && (!args.text || tasks))
      throw new Error(modelText.textCountError())
  }
}
