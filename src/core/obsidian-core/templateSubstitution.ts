import { moment } from 'obsidian'

type MomentValue = ReturnType<typeof moment>

const TOKEN_RE = /\{\{(title|date|time)(?::([^}]+))?\}\}/g

export type DailyNoteTemplateContext = {
  /** Basename of the daily note (last path segment without `.md`). */
  title: string
  /** Target note date. */
  date: MomentValue
  /** Current clock time for `{{time}}` and `{{time:...}}`. */
  now?: MomentValue
}

export type TemplateSubstitutionContext = {
  /** Basename of the new note (without `.md`). */
  title: string
  /** Templates core plugin date format (default `YYYY-MM-DD`). */
  dateFormat?: string
  /** Templates core plugin time format (default `HH:mm`). */
  timeFormat?: string
  /** Reference date/time for substitution (default now). */
  now?: MomentValue
}

/**
 * Substitutes documented Obsidian Daily notes tokens only:
 * `{{date}}`, `{{title}}`, `{{time}}`, `{{date:format}}`, `{{time:format}}`.
 * Unknown tokens are preserved verbatim.
 */
export function substituteDailyNoteTemplate(
  template: string,
  ctx: DailyNoteTemplateContext,
): string {
  const current = ctx.now ?? moment()
  return template.replace(
    TOKEN_RE,
    (full, token: string, customFormat?: string) => {
      if (token === 'title') {
        return customFormat === undefined ? ctx.title : full
      }
      if (token === 'date') {
        return customFormat === undefined
          ? ctx.title
          : ctx.date.format(customFormat)
      }
      if (token === 'time') {
        return customFormat === undefined
          ? current.format('HH:mm')
          : current.format(customFormat)
      }
      return full
    },
  )
}

/**
 * Substitutes documented Obsidian Templates tokens only:
 * `{{title}}`, `{{date}}`, `{{time}}`, `{{date:format}}`, `{{time:format}}`.
 * Unknown tokens are preserved verbatim.
 */
export function substituteTemplate(
  template: string,
  ctx: TemplateSubstitutionContext,
): string {
  const ref = ctx.now ?? moment()
  const dateFormat = ctx.dateFormat?.trim()
    ? ctx.dateFormat.trim()
    : 'YYYY-MM-DD'
  const timeFormat = ctx.timeFormat?.trim() ? ctx.timeFormat.trim() : 'HH:mm'
  return template.replace(
    TOKEN_RE,
    (full, token: string, customFormat?: string) => {
      if (token === 'title') {
        return customFormat === undefined ? ctx.title : full
      }
      if (token === 'date') {
        return ref.format(customFormat ?? dateFormat)
      }
      if (token === 'time') {
        return ref.format(customFormat ?? timeFormat)
      }
      return full
    },
  )
}
