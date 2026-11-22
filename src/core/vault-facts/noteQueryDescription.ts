import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function getQueryNotesDescription(locale: ModelLocale): string {
  return (
    L(
      {
        ko: 'Count, filter, group and sort Markdown notes across a folder or the whole vault in one call; the host scans every note in scope, so use the returned counts as they are instead of counting list rows yourself. Returns the number of matching notes, per-group note counts when group_by is set, and one page of rows. Fields: any frontmatter property name (date, status, kind, …), file.path, file.name, file.folder, file.top_folder, file.mtime, file.ctime, file.size, tag, tasks.open, tasks.done, and text_count (only with text); file.* names need the file. prefix (file.mtime, not mtime). Examples: notes per kind in a folder → {folder:"20 회의", group_by:"kind"}; notes whose body contains a word, per month → {folder:"20 회의", text:"갈륨", group_by:"date", group_date:"month"}; five oldest by date → {folder:"90 메모", sort_by:"date", order:"asc", limit:5, fields:["date"]}; notes with the most open tasks → {folder:"20 회의", sort_by:"tasks.open", order:"desc", limit:5}; date range → where:[{field:"date",op:"gte",value:"2026-10-16"},{field:"date",op:"lte",value:"2026-10-31"}]; notes with a tag per top folder → {where:[{field:"tag",op:"eq",value:"조기경보"}], group_by:"file.top_folder"}.',
        en: 'Count, filter, group and sort Markdown notes across a folder or the whole vault in one call; the host scans every note in scope, so use the returned counts as they are instead of counting list rows yourself. Returns the number of matching notes, per-group note counts when group_by is set, and one page of rows. Fields: any frontmatter property name (date, status, kind, …), file.path, file.name, file.folder, file.top_folder, file.mtime, file.ctime, file.size, tag, tasks.open, tasks.done, and text_count (only with text); file.* names need the file. prefix (file.mtime, not mtime). Examples: notes per kind in a folder → {folder:"20 Meetings", group_by:"kind"}; notes whose body contains a word, per month → {folder:"20 Meetings", text:"gallium", group_by:"date", group_date:"month"}; five oldest by date → {folder:"90 Notes", sort_by:"date", order:"asc", limit:5, fields:["date"]}; notes with the most open tasks → {folder:"20 Meetings", sort_by:"tasks.open", order:"desc", limit:5}; date range → where:[{field:"date",op:"gte",value:"2026-10-16"},{field:"date",op:"lte",value:"2026-10-31"}]; notes with a tag per top folder → {where:[{field:"tag",op:"eq",value:"early-warning"}], group_by:"file.top_folder"}.',
      },
      locale,
    ) +
    L(
      {
        ko: ' 개수·분포·정렬·과제 집계는 query_notes, 속성+낱말 OR·경로·태그·별칭 일치 노트 전부는 obsidian_query를 쓰세요.',
        en: ' Use query_notes for counts, distributions, sorting and task aggregates; use obsidian_query for all notes matching properties plus term OR, paths, tags or aliases.',
      },
      locale,
    )
  )
}
