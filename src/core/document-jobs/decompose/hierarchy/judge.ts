import type { HierarchyJudgement } from '../dialectV2'

import { HIERARCHY_RULES, type HierarchyFeature } from './features'
import { classifyMarker, sectionNumber } from './markers'
import { required } from './required'
import { isAppendix, isNoteLabel, reporterScore } from './roleCatalog'

type Node = { f: HierarchyFeature; j: HierarchyJudgement; kind: string }
export function judgeHierarchy(
  features: HierarchyFeature[],
): HierarchyJudgement[] {
  let stack: Node[] = [],
    prev: Node | undefined,
    beforeObject: Node | undefined,
    titleSeen = false
  const result: HierarchyJudgement[] = []
  for (const f of features) {
    if (f.object) {
      if (prev) beforeObject = prev
      continue
    }
    const marker = classifyMarker(f.text)
    const { rank, symbol } = marker
    let depth = 1,
      kind = 'plain',
      rule: HierarchyJudgement['rule'] = 'R6',
      reason = '',
      semanticRole: string | null = null
    if (!titleSeen && f.titleCandidate) {
      depth = 1
      kind = 'title'
      rule = 'R0'
      reason = 'first unique unnumbered title'
      titleSeen = true
    } else if (
      prev?.kind === 'title' &&
      f.sizePt !== null &&
      prev.f.sizePt !== null &&
      f.sizePt < prev.f.sizePt &&
      reporterScore(f.text) >= 2
    ) {
      depth = prev.j.depth + 1
      rule = 'R1'
      reason = 'R1a reporter'
      semanticRole = '보고자'
    } else if (rank === null && isAppendix(f.text)) {
      depth = 2
      kind = 'section'
      rule = 'R1'
      reason = 'R1b appendix'
      semanticRole = '별첨'
    } else if (
      f.faceClass === 'sans' &&
      f.sizePt !== null &&
      f.sizePt >= HIERARCHY_RULES.sectionMinPt &&
      !symbol &&
      (f.box1x1 || sectionNumber(f.text) || (f.outlineLevel ?? 0) >= 1)
    ) {
      depth = 2
      kind = 'section'
      rule = 'R2'
      reason = 'section'
    } else if (beforeObject && rank === null) {
      depth = beforeObject.j.depth
      rule = 'R3'
      reason = 'after object'
    } else if (rank !== null) {
      kind = 'ranked'
      rule = 'R4'
      const floor = [...stack]
        .reverse()
        .find((n) => ['title', 'section'].includes(n.kind))
      const ranked = stack.filter(
        (n) => n.j.depth > (floor?.j.depth ?? 0) && n.j.marker.rank !== null,
      )
      const same = [...ranked].reverse().find((n) => n.j.marker.rank === rank)
      const shallower = [...ranked]
        .reverse()
        .find((n) => required(n.j.marker.rank) < rank)
      depth = same
        ? same.j.depth
        : shallower
          ? shallower.j.depth + 1
          : (floor?.j.depth ?? 0) + 1
      reason = same ? 'same rank' : shallower ? 'shallower rank' : 'floor child'
    } else {
      kind = symbol ? 'attached' : 'plain'
      rule = symbol ? 'R5' : 'R6'
      const same = [...stack]
        .reverse()
        .find((n) => n.f.sizePt === f.sizePt && n.f.faceClass === f.faceClass)
      const size = [...stack].reverse().find((n) => n.f.sizePt === f.sizePt)
      if (
        prev &&
        f.sizePt !== null &&
        prev.f.sizePt !== null &&
        f.sizePt <= prev.f.sizePt - HIERARCHY_RULES.smallerPt
      ) {
        depth = prev.j.depth + 1
        reason = 'smaller'
      } else if (same) {
        const indent =
          rule === 'R6' &&
          f.leftPt !== null &&
          same.f.leftPt !== null &&
          f.leftPt >= same.f.leftPt + HIERARCHY_RULES.indentPt
        depth = same.j.depth + (indent ? 1 : 0)
        reason = indent ? 'indent' : 'same size+face'
      } else if (size?.f.faceClass === 'sans' && f.faceClass === 'serif') {
        depth = size.j.depth + 1
        reason = 'sans->serif'
      } else {
        depth = (prev?.j.depth ?? 0) + 1
        reason = 'child of previous'
      }
    }
    if (semanticRole === null && rule !== 'R0' && rule !== 'R2') {
      if (symbol?.startsWith('*')) semanticRole = '주석'
      else if (symbol === '※' || isNoteLabel(f.text)) semanticRole = '참고표'
      else if (marker.series) semanticRole = '번호_매기기_제목'
    }
    stack = stack.filter((n) => n.j.depth < depth)
    const j: HierarchyJudgement = {
      ref: f.ref,
      depth,
      parentRef: stack[stack.length - 1]?.j.ref ?? null,
      rule,
      reason,
      marker,
      semanticRole,
      applicationKey: 'BODY',
    }
    prev = { f, j, kind }
    stack.push(prev)
    beforeObject = undefined
    result.push(j)
  }
  return result
}
