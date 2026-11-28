import type { ToolArgs } from '../tools/localToolCommon'

import { QUERY_ARGS, TASK_ARGS } from './noteQueryArgNames'
import * as modelText from './noteQueryArgsText'
import {
  validateConditions,
  validateFields,
} from './noteQueryConditionValidation'
import { normalizeShorthand } from './noteQueryShorthand'

export type Condition = { field: string; op: string; value?: string }
export type QueryArgs = {
  folder?: string
  path?: string
  where: Condition[]
  text?: string
  group_by?: string
  split_by?: string
  group_date?: string
  sort_by: string
  order: string
  fields: string[]
  limit: number
  offset: number
  status: string
  shorthand: { field: string; op: string }[]
}
export function parseNoteArgs(args: ToolArgs, tasks: boolean): QueryArgs {
  const allowed = tasks ? TASK_ARGS : QUERY_ARGS
  const unknown = Object.keys(args).find((k) => !allowed.includes(k))
  if (unknown)
    throw new Error(modelText.unknownArgument(unknown, allowed.join(', ')))
  for (const key of [
    'folder',
    'path',
    'text',
    'group_by',
    'split_by',
    'group_date',
    'sort_by',
    'order',
    'status',
  ]) {
    if (
      args[key] !== undefined &&
      (typeof args[key] !== 'string' || !args[key].trim())
    )
      throw new Error(modelText.stringError(key))
  }
  if (typeof args.text === 'string' && args.text.length > 200)
    throw new Error(modelText.textError())
  if (args.folder && args.path) throw new Error(modelText.pathConflict())
  if (args.split_by !== undefined && !args.group_by)
    throw new Error(modelText.splitByRequiresGroupBy())
  if (tasks && args.group_by !== undefined && args.group_by !== 'owner')
    throw new Error(modelText.allowedValues('group_by', 'owner'))
  for (const [key, values] of Object.entries({
    group_date: ['year', 'month', 'day'],
    order: ['asc', 'desc'],
    status: ['open', 'done', 'all'],
  })) {
    if (args[key] !== undefined && !values.includes(args[key] as string))
      throw new Error(modelText.allowedValues(key, values.join(', ')))
  }
  if (
    args.where !== undefined &&
    (!Array.isArray(args.where) || args.where.length > 8)
  )
    throw new Error(modelText.whereError())
  const { where, shorthand } = normalizeShorthand(
    (args.where ?? []) as unknown[],
  )
  validateConditions(where)
  if (
    args.fields !== undefined &&
    (!Array.isArray(args.fields) ||
      args.fields.length > 6 ||
      args.fields.some((v) => typeof v !== 'string' || !v.trim()))
  )
    throw new Error(modelText.fieldsError())
  for (const key of ['limit', 'offset'])
    if (
      args[key] !== undefined &&
      (typeof args[key] !== 'number' ||
        !Number.isSafeInteger(args[key]) ||
        args[key] < (key === 'limit' ? 1 : 0) ||
        (key === 'limit' && args[key] > (tasks ? 300 : 200)))
    )
      throw new Error(
        modelText.rangeError(
          key,
          key === 'limit'
            ? `1~${tasks ? 300 : 200}`
            : `0~${Number.MAX_SAFE_INTEGER}`,
        ),
      )
  validateFields(args, tasks, where)
  return {
    ...args,
    where: where as Condition[],
    shorthand,
    fields: (args.fields ?? []) as string[],
    sort_by: (args.sort_by as string) ?? 'file.path',
    order: (args.order as string) ?? 'asc',
    limit: (args.limit as number) ?? (tasks ? 100 : 50),
    offset: (args.offset as number) ?? 0,
    status: (args.status as string) ?? 'open',
  }
}
