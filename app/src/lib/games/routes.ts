/**
 * 격자의 칸 하나가 어디로 가는가. **`null` 이면 아직 없다**(화면에 「준비 중」).
 *
 * 노리밋 홀덤의 칸 셋이 기존 라우트를 가리킨다 — 축 1·2 를 옮기지 않기로 했다.
 * 팟 판독 러시 하나가 승자 판독과 팟 분배 두 칸을 함께 다루므로 둘이 같은 곳을
 * 가리킨다. **그것이 지금의 사실이고, 격자는 사실을 감추지 않는다.**
 */
import type { DrillId } from './drills'
import type { GameId } from './types'

const ROUTES: Record<GameId, Partial<Record<DrillId, string>>> = {
  nlh: {
    winner: '/rush',
    potaward: '/rush',
    action: '/action-rush',
  },
  plo8: {
    procedure: '/games/plo8/procedure',
    winner: '/games/plo8/winner',
  },
}

export function drillHref(gameId: GameId, drillId: DrillId): string | null {
  return ROUTES[gameId][drillId] ?? null
}
