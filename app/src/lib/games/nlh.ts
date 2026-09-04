/**
 * 노리밋 홀덤. **이 종목의 칸 셋은 이미 차 있다** — 팟 판독 러시(`/rush`)가
 * 보드보기와 팟 분배를, 액션 판정 러시(`/action-rush`)가 액션 판정을 맡는다.
 * 격자는 기존 축 1·2 를 버리지 않고 자기 칸에 넣는다 (PRD §6).
 *
 * 스펙을 여기 적는 이유는 홈이 격자를 그리려면 이 종목의 데이터도 필요하기 때문이다.
 * 판정 메서드는 `lib/simulator/rulesets/nlh.ts` 에 따로 있다 — 데이터와 판정은 별개다.
 */
import type { GameSpec } from './types'

export const nlhSpec: GameSpec = {
  id: 'nlh',
  family: 'flop',
  betting: 'NL',
  raiseCap: null,
  holeCardCount: 2,
  forced: 'blinds',
  labels: {
    ko: '노리밋 홀덤',
    en: "No-Limit Hold'em",
    gameKo: '하이',
    familyKo: '플랍',
    bettingKo: '노 리밋',
  },
  streets: [
    {
      id: 'preflop',
      labels: { ko: '프리플랍', short: '프리플랍' },
      kind: 'deal',
      deal: { down: 2, up: 0, board: 0 },
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
  eval: { hi: 'standard', lo: null, mustUse: null },
}
