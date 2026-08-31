/**
 * 유형 2 — 승자 판정.
 *
 * 쇼다운 한 장면. 정답은 `evaluateHand` + `compareHands` 가 낸다.
 * 동점이 나오면 버린다 — 그건 스플릿 유형이 다룬다.
 */
import { CATEGORY_LABEL, compareHands, evaluateHand, type Rng } from '@/lib/simulator'
import { createShoe, pickNames } from '../deal'
import { LIMIT_SEC, KIND_LABEL, type RushQuestion, type RushSeat } from '../types'

export function makeWinner(rng: Rng): RushQuestion | null {
  const seatCount = 2 + rng.int(3) // 2~4명
  const shoe = createShoe(rng)
  const board = shoe.draw(5)
  const names = pickNames(rng, seatCount)

  const seats: RushSeat[] = names.map((name) => ({ name, hole: shoe.draw(2) }))
  const ranks = seats.map((s) => evaluateHand([...(s.hole ?? []), ...board]))

  let best = 0
  for (let i = 1; i < ranks.length; i++) {
    if (compareHands(ranks[i], ranks[best]) > 0) best = i
  }
  const tied = ranks.filter((r) => compareHands(r, ranks[best]) === 0)
  if (tied.length > 1) return null

  const runnerUp = ranks
    .map((rank, seat) => ({ rank, seat }))
    .filter((r) => r.seat !== best)
    .reduce((a, r) => (compareHands(r.rank, a.rank) > 0 ? r : a))

  return {
    kind: 'winner',
    label: KIND_LABEL.winner,
    prompt: '쇼다운이다. 이 팟을 가져가는 좌석은?',
    limitSec: LIMIT_SEC.winner,
    seats,
    board,
    buttonSeat: rng.int(seatCount),
    answerSeat: best,
    why:
      `${seats[best].name} — ${CATEGORY_LABEL[ranks[best].category]}` +
      ` · 2위는 ${seats[runnerUp.seat].name} ${CATEGORY_LABEL[runnerUp.rank.category]}`,
  }
}
