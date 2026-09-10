/**
 * 업카드로 만든 **부분 핸드**를 비교한다 — 1~4장.
 *
 * 비유: 다섯 장이 다 모이기 전에도 "지금 누구 판이 세 보이나"는 말할 수 있다.
 * 테이블에 뜬 것만 보고 하는 그 판단이 스터드의 액션 순서를 정한다.
 *
 * **5장 평가기(`evaluate.ts`)를 쓸 수 없다.** `evaluateHand` 는 다섯 장 이상을 요구하고
 * (`cards.length < 5` 면 throw), 스트레이트·플러시를 센다. 업카드는 최대 넉 장이라 애초에
 * 넘길 수도 없고, 그 둘도 성립하지 않는다 — 기준 문서도 업카드 서열을
 * "포카드 > 트리플 > 투페어 > 원페어 > 하이카드"로 적었다
 * (mixgame-facts §2 7-Card Stud 절, 사용자 확인 2026-09-02).
 *
 * **무늬는 보지 않는다.** 같은 절이 "동률의 무늬 우열은 7카드 스터드 기준으로 자료에 없다"고
 * 적고 프로토타입이 동률 상황을 출제하지 않기로 했다. 여기서 0 을 돌려주고, 그런 판을
 * 아예 만들지 않는 것이 생성기의 몫이다. (무늬 서열이 자료에 있는 곳은 Hi/Lo Regular
 * 하나다 — "스페이드 K 최고". 그 종목이 붙으면 그때 따로 다룬다.)
 */
import { RANK_VALUE, type Card, type Rank } from './cards'
import { LOW_VALUE } from './lowball'

/*
 * 로우 잣대(A=1)는 `lowball.ts` 에 이미 있다. **여기에 다시 적지 마라** —
 * 같은 표가 두 곳에 있으면 한쪽만 고쳐지는 날이 온다(판정 사본 금지, 전역 제약).
 * 그래서 `lowball.ts` 의 `LOW_VALUE` 를 export 로 열어 그것을 import 한다.
 */

/**
 * 묶음을 「개수 많은 순 → 값 큰 순」으로 세운 키.
 *
 * 하이와 로우가 **같은 모양의 키**를 쓰고 비교 방향만 반대다. 페어는 하이에서 좋고
 * 로우에서 나쁘지만, 어느 쪽이든 **먼저 읽히는 요소**라는 점은 같다.
 *
 * 입력을 정렬하지 않는다 — `counts` 에서 새로 만든 배열만 세운다(불변).
 */
function groupKey(hand: readonly Card[], value: (rank: Rank) => number): number[] {
  const counts = new Map<number, number>()
  for (const card of hand) {
    const v = value(card.rank)
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([v, n]) => ({ v, n }))
    .sort((a, b) => b.n - a.n || b.v - a.v)
    .flatMap((g) => [g.n, g.v])
}

/**
 * 사전식 비교. 짧은 키는 0 으로 메운다.
 *
 * 메우기가 실제로 갈리는 것은 **장수가 다른 두 손**을 견줄 때뿐이다. 같은 스트릿에서는
 * 살아 있는 좌석이 업카드를 같은 수로 들고 있으니 정상 호출에서는 길이가 같다.
 */
function compareKeys(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

/**
 * 보드에 뜬 족보가 높은 쪽. `a` 가 높으면 양수.
 *
 * 라즈 3번가의 브링인을 정한다 — **가장 높은 업카드가 브링인이다**
 * (7카드 스터드와 반대. 사용자 확인 2026-09-03).
 */
export function compareUpcardsHi(a: readonly Card[], b: readonly Card[]): number {
  return compareKeys(
    groupKey(a, (r) => RANK_VALUE[r]),
    groupKey(b, (r) => RANK_VALUE[r]),
  )
}

/**
 * 보드 로우가 좋은(낮은) 쪽. `a` 가 낮으면 **음수**.
 *
 * 라즈 4번가 이후의 첫 액션을 정한다 — **보드 로우가 가장 좋은 좌석**이 먼저 말한다
 * (사용자 확인 2026-09-03). 페어는 로우를 망치므로 나쁜 요소로 먼저 읽힌다.
 */
export function compareUpcardsLo(a: readonly Card[], b: readonly Card[]): number {
  return compareKeys(
    groupKey(a, (r) => LOW_VALUE[r]),
    groupKey(b, (r) => LOW_VALUE[r]),
  )
}
