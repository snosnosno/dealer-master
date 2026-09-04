/**
 * 격자의 칸이 존재하는지를 정하는 곳.
 *
 * PRD §6 의 격자표에서 `—`(이 종목에 해당 없음)를 만드는 것이 이 파일이다.
 * **표를 사람이 관리하면 반드시 어긋난다** — 스펙을 읽어 여기서 낸다.
 * 종목을 추가하면 격자표가 저절로 늘어난다.
 */
import type { GameSpec } from './types'

export type DrillId =
  | 'procedure'
  | 'boardreading'
  | 'potlimit'
  | 'potaward'
  | 'lowreading'
  | 'incident'
  | 'action'

export const DRILL_LABEL: Record<DrillId, string> = {
  procedure: '진행절차',
  boardreading: '보드보기',
  potlimit: '팟리밋 계산',
  potaward: '팟 분배',
  lowreading: '로우 판독',
  incident: '사고 처리',
  action: '액션 판정',
}

/** 이 종목에 있는 드릴. 순서는 `DRILL_LABEL` 의 선언 순서를 따른다. */
export function drillsFor(spec: GameSpec): DrillId[] {
  const all: DrillId[] = [
    'procedure',
    'boardreading',
    'potlimit',
    'potaward',
    'lowreading',
    'incident',
    'action',
  ]
  return all.filter((id) => {
    if (id === 'lowreading') return spec.eval.lo !== null
    if (id === 'potlimit') return spec.betting === 'PL'
    return true
  })
}
