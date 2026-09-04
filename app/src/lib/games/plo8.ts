/**
 * PLO8 — 오마하 하이로우 8. **드릴 일곱이 전부 해당되는 유일한 종목**이라
 * 격자의 첫 칸으로 골랐다 (PRD §10).
 *
 * 로우도 보드에서 3장을 써야 하므로 **보드에 8 이하가 3장 없으면 로우 자체가
 * 불가능하다.** 그것이 로우 판독 드릴의 첫 문제 유형이다.
 */
import type { GameSpec } from './types'

export const plo8: GameSpec = {
  id: 'plo8',
  family: 'flop',
  betting: 'PL',
  raiseCap: null,
  holeCardCount: 4,
  forced: 'blinds',
  labels: {
    ko: 'PLO8',
    en: 'Pot-Limit Omaha Hi/Lo 8',
    gameKo: '오마하 하이로우 8',
    familyKo: '플랍',
    bettingKo: '팟 리밋',
  },
  streets: [
    {
      id: 'preflop',
      labels: { ko: '프리플랍', short: '프리플랍' },
      kind: 'deal',
      deal: { down: 4, up: 0, board: 0 },
      burn: false,
      betting: true,
      firstToAct: 'left-of-bb',
      sizeMultiplier: 1,
    },
    {
      id: 'flop',
      labels: { ko: '플랍', short: '플랍' },
      kind: 'deal',
      deal: { down: 0, up: 0, board: 3 },
      burn: true,
      betting: true,
      firstToAct: 'left-of-button',
      sizeMultiplier: 1,
    },
    {
      id: 'turn',
      labels: { ko: '턴', short: '턴' },
      kind: 'deal',
      deal: { down: 0, up: 0, board: 1 },
      burn: true,
      betting: true,
      firstToAct: 'left-of-button',
      sizeMultiplier: 1,
    },
    {
      id: 'river',
      labels: { ko: '리버', short: '리버' },
      kind: 'deal',
      deal: { down: 0, up: 0, board: 1 },
      burn: true,
      betting: true,
      firstToAct: 'left-of-button',
      sizeMultiplier: 1,
    },
  ],
  eval: {
    hi: 'standard',
    lo: { kind: 'a5', qualifier: 8 },
    mustUse: { hole: 2, board: 3 },
  },
}
