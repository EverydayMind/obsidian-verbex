import { L } from '../../i18n/modelText'

export function noOwner() {
  return L({ ko: '(담당자 없음)', en: '(no owner)' })
}

export function moreOwners(n: number) {
  return L({ ko: `… 외 ${n}개`, en: `… and ${n} more` })
}

export function ownerGroups(n: number, summary: string) {
  return L({
    ko: `\n담당자별 묶음 ${n}개(담당자 = 할 일 줄의 "담당" 뒤 이름, 없으면 줄 앞 "이름:", 없으면 @이름, 없으면 첫 [[링크]]): ${summary}`,
    en: `\nGrouped by owner: ${n} groups (owner = the name after an owner label such as "Owner:", else a leading "Name:", else an @name, else the first [[link]] in the task line): ${summary}`,
  })
}
