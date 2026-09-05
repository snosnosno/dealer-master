/**
 * 핸드를 **딜 전에 통째로** 만든다. 리듀서는 이것을 드러내기만 한다.
 *
 * 비유: 연극 대본이다. 배우가 무대에서 즉흥으로 대사를 지어내지 않는다 —
 * 대본이 먼저 있고 무대는 그것을 보여줄 뿐이다.
 *
 * 프로토타입은 반대로 했다. 카드가 착지한 **뒤에** 동률을 발견하고 업카드를 바꿔서,
 * 화면에 뜬 카드가 다른 카드로 바뀌었다. 먼저 만들면 그 결함이 생길 자리가 없다.
 * `lib/rush/deal.ts` 가 이미 그 본보기다.
 *
 * **무작위는 `Rng` 로만 얻는다.** 여기서 `Math.random()` 을 한 번이라도 쓰면
 * 같은 시드가 다른 핸드를 만들어 재현이 불가능해진다.
 */
import { createRng, makeDeck, shuffle, type Card, type Rng } from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'
import type { BettingAction, HandScript } from './types'

export const SEAT_COUNT = 6
export const SMALL_BLIND = 500
export const BIG_BLIND = 1000

const NAMES = ['1번', '2번', '3번', '4번', '5번', '6번']

/** 강제 베팅이 없는 라운드가 체크로 열릴 확률. 첫 액션이 늘 벳이면 상황이 하나뿐이다. */
const CHECK_OPEN_RATE = 0.45

export function dealHand(spec: GameSpec, seed: string): HandScript {
  const rng = createRng(seed)
  const deck = shuffle(makeDeck(), rng)
  let cursor = 0
  const take = (n: number): Card[] => deck.slice(cursor, (cursor += n))

  const buttonSeat = rng.int(SEAT_COUNT)

  const seats = NAMES.map((name) => ({
    name,
    hole: [] as Card[],
    // 20~99 BB. 스택이 다르면 좌석마다 화면이 달라져 판이 하나로 안 보인다
    stack: BIG_BLIND * (20 + rng.int(80)),
  }))

  const board: Record<string, Card[]> = {}
  const betting: Record<string, BettingAction[]> = {}
  const folded = new Array<boolean>(SEAT_COUNT).fill(false)

  spec.streets.forEach((street, index) => {
    // 번카드는 화면에 안 보이지만 덱에서는 빠진다 — 안 빼면 같은 카드가 두 번 나온다
    if (street.burn) take(1)

    for (let i = 0; i < SEAT_COUNT; i++) {
      const n = street.deal.down + street.deal.up
      if (n > 0) seats[i].hole = [...seats[i].hole, ...take(n)]
    }
    board[street.id] = take(street.deal.board)

    if (!street.betting) {
      betting[street.id] = []
      return
    }
    betting[street.id] = makeRound({
      rng,
      folded,
      isForced: index === 0,
      buttonSeat,
    })
  })

  return { buttonSeat, blinds: { sb: SMALL_BLIND, bb: BIG_BLIND }, seats, board, betting }
}

/**
 * 한 라운드의 액션을 만든다. `folded` 를 **제자리에서 갱신한다** — 이 함수는
 * `dealHand` 안에서만 쓰이는 지역 헬퍼이고, 밖으로 나가는 값은 새 배열이다.
 */
function makeRound({
  rng,
  folded,
  isForced,
  buttonSeat,
}: {
  rng: Rng
  folded: boolean[]
  isForced: boolean
  buttonSeat: number
}): BettingAction[] {
  const alive = () => folded.filter((f) => !f).length

  // 강제 베팅이 걸린 첫 라운드는 늘 콜할 금액이 있다. 나머지는 45% 가 체크로 열린다
  const checkRound = !isForced && rng.next() < CHECK_OPEN_RATE
  const order: number[] = []
  for (let i = 0; i < SEAT_COUNT; i++) {
    const seat = (buttonSeat + (isForced ? 3 : 1) + i) % SEAT_COUNT
    if (!folded[seat]) order.push(seat)
  }

  if (checkRound) {
    return order.map((seat) => ({ seat, act: 'check' as const, to: 0 }))
  }

  const amount = isForced ? BIG_BLIND : BIG_BLIND * (2 + rng.int(3))
  const out: BettingAction[] = []
  let opened = false

  for (const seat of order) {
    // 마지막 두 좌석이 남았으면 더 접지 않는다 — 쇼다운이 사라지면 판이 성립하지 않는다
    const mayFold = alive() > 2 && rng.next() < 0.35
    if (mayFold) {
      folded[seat] = true
      out.push({ seat, act: 'fold', to: 0 })
      continue
    }
    out.push({ seat, act: opened ? 'call' : isForced ? 'call' : 'bet', to: amount })
    opened = true
  }
  return out
}
