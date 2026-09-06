/**
 * 격자의 칸이 존재하는지를 정하는 곳.
 *
 * PRD §6 의 격자표에서 `—`(이 종목에 해당 없음)를 만드는 것이 이 파일이다.
 * **표를 사람이 관리하면 반드시 어긋난다** — 스펙을 읽어 여기서 낸다.
 *
 * **2026-09-06: 드릴이 일곱에서 여섯이 됐다.** `보드보기` 와 `로우 판독` 이 `승자 판독`
 * 하나로 합쳐졌다. 쇼다운에서 딜러가 하는 일은 임자를 가리는 것 하나이기 때문이다.
 * `eval.lo` 조건은 사라진 것이 아니라 **한 단계 내려갔다** — 이제 칸의 유무가 아니라
 * 문제의 모양을 가른다 (`lib/drills/winner/types.ts` 의 `asksFor`).
 */
import type { GameSpec } from './types'

export type DrillId =
  | 'procedure'
  | 'winner'
  | 'potlimit'
  | 'potaward'
  | 'incident'
  | 'action'

export const DRILL_LABEL: Record<DrillId, string> = {
  procedure: '진행절차',
  winner: '승자 판독',
  potlimit: '팟리밋 계산',
  potaward: '팟 분배',
  incident: '사고 처리',
  action: '액션 판정',
}

/** 이 종목에 있는 드릴. 순서는 `DRILL_LABEL` 의 선언 순서를 따른다. */
export function drillsFor(spec: GameSpec): DrillId[] {
  const all: DrillId[] = ['procedure', 'winner', 'potlimit', 'potaward', 'incident', 'action']
  // 승자 판독은 모든 종목에 있다 — 임자를 가리지 않는 포커는 없다
  return all.filter((id) => (id === 'potlimit' ? spec.betting === 'PL' : true))
}
