/**
 * 유형 4 — 스플릿 팟 판정.
 *
 * 동점은 자연 발생 확률이 낮아 **유도한다**. 유도한 배치가 진짜 동점인지는
 * 반드시 `evaluateHand` 로 확인하고, 아니면 버린다 (설계 §5.1).
 * "동점일 것 같은" 배치를 정답으로 삼으면 훈련생이 틀린 것을 배운다.
 *
 * 유도 방식 둘:
 * - **보드로 플레이** — 보드 5장이 완성 핸드라 홀카드가 킥커로도 안 걸린다 → 전원 분할
 * - **거울 배치** — 같은 랭크 두 개를 서로 다른 무늬로 두 좌석에 준다 → 킥커까지 같아진다
 */
import { CATEGORY_LABEL, compareHands, evaluateHand, type Card, type Rank, type Rng } from '@/lib/simulator'
import { createShoe, pickNames, shuffled, straightBoard, type Shoe } from '../deal'
import { LIMIT_SEC, KIND_LABEL, type RushQuestion, type RushSeat } from '../types'

/** 보드플레이를 몇 번에 한 번 쓰나. 넷 중 하나 — 나머지는 거울 배치다. */
const BOARD_PLAY_ODDS = 4

const fmt = (n: number) => n.toLocaleString('ko-KR')

/** 거울 두 좌석의 홀카드. 보드에 없는 랭크 두 개를 골라 무늬만 다르게 나눠 준다. */
function mirrorHoles(shoe: Shoe, board: Card[], rng: Rng): [Card[], Card[]] | null {
  const onBoard = new Set(board.map((c) => c.rank))
  const byRank = new Map<Rank, Card[]>()
  for (const card of shoe.rest()) {
    if (onBoard.has(card.rank)) continue
    byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), card])
  }

  const pairable = [...byRank.values()].filter((cards) => cards.length >= 2)
  if (pairable.length < 2) return null

  const [first, second] = shuffled(pairable, rng).slice(0, 2)
  const a = shoe.take([first[0], second[0]])
  const b = shoe.take([first[1], second[1]])
  return a === null || b === null ? null : [a, b]
}

/**
 * 거울 두 좌석보다 **약한** 패로 나머지 좌석을 채운다.
 *
 * 랜덤으로 채우면 그중 하나가 더 강해서 단독 승자가 되는 판이 절반을 넘고,
 * 그만큼 재생성이 보드플레이로 쏠린다 — 프로토타입 실측으로 "전원 분할"이 59%까지 갔다.
 */
function weakerHole(shoe: Shoe, board: Card[], target: ReturnType<typeof evaluateHand>, rng: Rng): Card[] | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const rest = shoe.rest()
    if (rest.length < 2) return null
    const i = rng.int(rest.length)
    let j = rng.int(rest.length)
    if (i === j) j = (j + 1) % rest.length
    const candidate = [rest[i], rest[j]]
    if (compareHands(evaluateHand([...candidate, ...board]), target) < 0) {
      return shoe.take(candidate)
    }
  }
  return null
}

export function makeSplit(rng: Rng): RushQuestion | null {
  const seatCount = 3 + rng.int(2) // 3~4명
  const shoe = createShoe(rng)
  const byBoard = rng.int(BOARD_PLAY_ODDS) === 0

  let board: Card[] | null
  const holes: Card[][] = []

  if (byBoard) {
    board = straightBoard(shoe, rng)
    if (board === null) return null
    for (let i = 0; i < seatCount; i++) holes.push(shoe.draw(2))
  } else {
    board = shoe.draw(5)
    const mirror = mirrorHoles(shoe, board, rng)
    if (mirror === null) return null
    holes.push(mirror[0], mirror[1])

    const target = evaluateHand([...mirror[0], ...board])
    for (let i = 2; i < seatCount; i++) {
      const filler = weakerHole(shoe, board, target, rng)
      if (filler === null) return null
      holes.push(filler)
    }
  }

  // 정답 좌석이 늘 0·1번이 되지 않게 자리를 섞는다
  const names = pickNames(rng, seatCount)
  const seats: RushSeat[] = shuffled(holes, rng).map((hole, i) => ({ name: names[i], hole }))

  const ranks = seats.map((s) => evaluateHand([...(s.hole ?? []), ...board]))
  const best = ranks.reduce((a, r) => (compareHands(r, a) > 0 ? r : a))
  const winners = ranks
    .map((rank, seat) => ({ rank, seat }))
    .filter((r) => compareHands(r.rank, best) === 0)
    .map((r) => r.seat)

  // 유도했다고 동점이 되는 게 아니다. 실제로 동점이 아니면 버린다.
  if (winners.length < 2) return null

  // 나눠떨어지는 팟만 낸다 — 홀칩은 다음 유형이 다룬다
  const share = (4 + rng.int(12)) * 1000
  const pot = share * winners.length

  return {
    kind: 'split',
    label: KIND_LABEL.split,
    prompt: `쇼다운이다. 팟 ${fmt(pot)} 은 누가 나눠 갖나?`,
    limitSec: LIMIT_SEC.split,
    seats,
    board,
    buttonSeat: rng.int(seatCount),
    pot,
    answerSeats: winners,
    why:
      `${winners.map((i) => seats[i].name).join(' · ')} 동점 — ${CATEGORY_LABEL[best.category]}` +
      `${winners.length === seatCount ? ' (전원 분할)' : ''} · 각 ${fmt(share)} 씩`,
  }
}
