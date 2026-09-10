/**
 * 라즈 — **격자의 판정용 스파이크다.** (2026-09-11)
 *
 * PRD §10 5단계: "라즈를 스펙 파일 하나로 붙인다 ← 격자의 판정". 이 파일이 그 시도다.
 * 엔진과 화면은 한 줄도 고치지 않고 스펙만 놓았을 때 무엇이 서고 무엇이 터지는지가
 * 곧 판정 결과다.
 *
 * **자료 근거**: `docs/references/mixgame-facts.md` §2 Razz 절. 그 절 자체가
 * 「자료가 아니라 사용자 확정(2026-09-03)」이라고 밝히고 있다 — 첫 액션 두 줄이
 * 그렇다. 나머지(앤티+브링인·베팅 5회·번카드·5번가부터 2배)는 7카드 스터드에서 온다.
 */
import type { GameSpec } from './types'

export const razz: GameSpec = {
  id: 'razz',
  family: 'stud',
  betting: 'FL',
  // 1벳 + 4레이즈 = 5 (mixgame-facts §1)
  raiseCap: 5,
  // 스터드는 7장을 받는다. 그중 진짜 감춰지는 것은 3장(1st·2nd·7th)이다 —
  // 이 필드가 「받는 장수」인지 「감춰지는 장수」인지 스펙이 말하지 않는다. 스파이크가 물을 것.
  holeCardCount: 7,
  forced: 'ante+bringin',
  labels: {
    ko: '라즈',
    en: 'Razz',
    gameKo: '라즈',
    familyKo: '스터드',
    bettingKo: '픽스 리밋',
  },
  streets: [
    {
      id: 'third',
      labels: { ko: '3번가', short: '3rd' },
      kind: 'deal',
      // 한 스트릿이 다운 2 + 업 1 을 함께 내린다 — `deal` 을 셋으로 가른 이유가 이 줄이다
      deal: { down: 2, up: 1, board: 0 },
      burn: false,
      betting: true,
      // 라즈는 **가장 높은** 업카드가 브링인이다 — 7카드 스터드와 반대 (사용자 확인 2026-09-03)
      firstToAct: 'highest-upcard',
      sizeMultiplier: 1,
    },
    {
      id: 'fourth',
      labels: { ko: '4번가', short: '4th' },
      kind: 'deal',
      deal: { down: 0, up: 1, board: 0 },
      burn: true,
      betting: true,
      // 4번가부터는 보드 로우가 가장 좋은 좌석이 먼저 (사용자 확인 2026-09-03)
      firstToAct: 'lowest-hand',
      sizeMultiplier: 1,
    },
    {
      id: 'fifth',
      labels: { ko: '5번가', short: '5th' },
      kind: 'deal',
      deal: { down: 0, up: 1, board: 0 },
      burn: true,
      betting: true,
      firstToAct: 'lowest-hand',
      // 스터드는 5번가부터 빅벳 (mixgame-facts §1)
      sizeMultiplier: 2,
    },
    {
      id: 'sixth',
      labels: { ko: '6번가', short: '6th' },
      kind: 'deal',
      deal: { down: 0, up: 1, board: 0 },
      burn: true,
      betting: true,
      firstToAct: 'lowest-hand',
      sizeMultiplier: 2,
    },
    {
      id: 'seventh',
      labels: { ko: '7번가', short: '7th' },
      kind: 'deal',
      // 7번가는 페이스 다운 (mixgame-facts §2 7-Card Stud)
      deal: { down: 1, up: 0, board: 0 },
      burn: true,
      betting: true,
      firstToAct: 'lowest-hand',
      sizeMultiplier: 2,
    },
  ],
  eval: {
    // 로우 전용 종목이다 — 하이가 없다
    hi: null,
    // A-5 로우볼, 자격 없음. A 가 최저, 스트레이트·플러시 무시
    lo: { kind: 'a5', qualifier: null },
    mustUse: null,
  },
}
