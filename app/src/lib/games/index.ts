/**
 * 게임 레지스트리 — 격자의 행이 여기서 나온다.
 *
 * 바깥에서는 이 파일 하나만 import 한다 (`lib/simulator/index.ts` 와 같은 관례).
 */
import { nlhSpec } from './nlh'
import { plo8 } from './plo8'
import type { GameId, GameSpec } from './types'

export const GAMES: Record<GameId, GameSpec> = { nlh: nlhSpec, plo8 }

/** 홈에 보이는 순서. 패밀리별로 묶어 보여줄 때도 이 순서를 유지한다. */
export const GAME_ORDER: GameId[] = ['nlh', 'plo8']

export function isGameId(value: string): value is GameId {
  return value in GAMES
}

export { drillsFor, DRILL_LABEL, type DrillId } from './drills'
export { drillHref } from './routes'
export type { GameId, GameSpec, Street, EvalSpec, FirstToAct } from './types'
