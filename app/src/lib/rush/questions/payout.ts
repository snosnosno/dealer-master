/**
 * 유형 3 — 메인팟 지급.
 *
 * 사이드팟과 쇼다운을 한 번에 묻는다: **참가 자격**과 **핸드 강도**가 둘 다 맞아야 답이 나온다.
 * 가장 센 패를 든 사람이 메인팟 자격자가 아닐 수도 있다 — 그게 이 유형의 함정이다.
 *
 * 정답은 `buildPots` 로 자격자를 얻고 그 안에서 `evaluateHand` 로 고른다.
 */
import { CATEGORY_LABEL, buildPots, compareHands, evaluateHand, type Rng } from '@/lib/simulator'
import { createShoe, pickNames, shuffled } from '../deal'
import { LIMIT_SEC, KIND_LABEL, type RushQuestion, type RushSeat } from '../types'

const BASE_UNITS = [1000, 2000, 3000, 5000]

const fmt = (n: number) => n.toLocaleString('ko-KR')

export function makePayout(rng: Rng): RushQuestion | null {
  const seatCount = 3 + rng.int(2) // 3~4명
  const shoe = createShoe(rng)
  const board = shoe.draw(5)
  const names = pickNames(rng, seatCount)
  const base = rng.pick(BASE_UNITS)

  /*
   * 올인 좌석의 자리를 섞는다. 프로토타입은 늘 0번 좌석이 올인이었는데,
   * 그러면 "왼쪽 위 사람이 올인"이라는 화면 패턴을 외우게 된다 — 판정 훈련이 아니다.
   */
  const bets = shuffled(
    [
      { bet: base + 100 * rng.int(9), allIn: true },
      ...Array.from({ length: seatCount - 1 }, () => ({
        bet: base * (2 + rng.int(2)) + 100 * rng.int(9),
        allIn: false,
      })),
    ],
    rng,
  )

  const seats: RushSeat[] = bets.map((b, i) => ({
    ...b,
    name: names[i],
    hole: shoe.draw(2),
  }))

  const pots = buildPots(
    seats.map((s) => s.bet ?? 0),
    seats.map(() => false),
  )
  const main = pots[0]
  if (pots.length < 2 || main.eligibleSeats.length < 2) return null

  const ranked = main.eligibleSeats.map((seat) => ({
    seat,
    rank: evaluateHand([...(seats[seat].hole ?? []), ...board]),
  }))
  const best = ranked.reduce((a, r) => (compareHands(r.rank, a.rank) > 0 ? r : a))
  if (ranked.filter((r) => compareHands(r.rank, best.rank) === 0).length > 1) return null

  return {
    kind: 'payout',
    label: KIND_LABEL.payout,
    prompt: `메인팟 ${fmt(main.amount)} 은 누구에게 가나?`,
    limitSec: LIMIT_SEC.payout,
    seats,
    board,
    buttonSeat: rng.int(seatCount),
    answerSeat: best.seat,
    why:
      `${seats[best.seat].name} — ${CATEGORY_LABEL[best.rank.category]}` +
      ` · 메인팟 참가 자격은 ${main.eligibleSeats.length}명이다`,
  }
}
