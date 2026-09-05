/**
 * 로우 판독 문제를 만든다.
 *
 * **먼저 만들고 그다음 보여준다.** 판을 하나 돌린 뒤 엔진에게 로우를 물어보고,
 * 그 답이 문제로 성립하면 채택하고 아니면 다시 돌린다. 화면에 뜬 뒤에 답이
 * 바뀌는 일이 생길 자리가 없다.
 *
 * 무작위는 `Rng` 로만 얻는다 — 여기서 `Math.random()` 을 쓰면 시드가 무의미해진다.
 */
import {
  bestOmahaLow, compareLow, createRng, makeDeck, shuffle,
  type Card, type LowRank, type Rng,
} from '@/lib/simulator'
import { LOW_KIND_LABEL, LOW_LIMIT_SEC, type LowKind, type LowQuestion, type LowSeat } from './types'

const SEAT_COUNT = 4
const NAMES = ['1번', '2번', '3번', '4번']
const QUALIFIER = 8

/** 10문제의 유형 배분. 승자 판정이 가장 어려워서 넷, 나머지가 셋씩이다. */
const QUOTA: LowKind[] = [
  'lo-possible', 'lo-possible', 'lo-possible',
  'lo-qualified', 'lo-qualified', 'lo-qualified',
  'lo-best', 'lo-best', 'lo-best', 'lo-best',
]

type Board = { seats: LowSeat[]; board: Card[]; lows: (LowRank | null)[] }

function dealBoard(rng: Rng): Board {
  const deck = shuffle(makeDeck(), rng)
  const board = deck.slice(0, 5)
  const seats = NAMES.map((name, i) => ({ name, hole: deck.slice(5 + i * 4, 9 + i * 4) }))
  return { seats, board, lows: seats.map((s) => bestOmahaLow(s.hole, board, QUALIFIER)) }
}

/** 이 판이 그 유형의 문제로 성립하는가. 성립하지 않으면 다시 돌린다. */
function fits(kind: LowKind, deal: Board): boolean {
  const qualified = deal.lows.filter((l) => l !== null).length
  if (kind === 'lo-possible') return true
  if (kind === 'lo-qualified') return qualified >= 1
  // 승자 문제는 자격자가 둘 이상이어야 비교가 생기고, 단독 승자여야 답이 하나다
  if (qualified < 2) return false
  return bestSeats(deal).length === 1
}

/** 가장 낮은 로우를 가진 좌석들. 동점이면 여럿이다. */
function bestSeats(deal: Board): number[] {
  let best: LowRank | null = null
  let seats: number[] = []
  deal.lows.forEach((low, i) => {
    if (low === null) return
    if (best === null || compareLow(low, best) < 0) {
      best = low
      seats = [i]
    } else if (compareLow(low, best) === 0) {
      seats = [...seats, i]
    }
  })
  return seats
}

function build(kind: LowKind, deal: Board, buttonSeat: number): LowQuestion {
  const base = {
    label: LOW_KIND_LABEL[kind],
    limitSec: LOW_LIMIT_SEC[kind],
    seats: deal.seats,
    board: deal.board,
    buttonSeat,
  }

  if (kind === 'lo-possible') {
    return {
      ...base,
      kind,
      prompt: '이 판에 로우가 성립합니까?',
      answerYes: deal.lows.some((l) => l !== null),
    }
  }
  if (kind === 'lo-qualified') {
    return {
      ...base,
      kind,
      prompt: '로우 자격이 있는 좌석을 모두 고르세요.',
      answerSeats: deal.lows.flatMap((l, i) => (l === null ? [] : [i])),
    }
  }
  return { ...base, kind, prompt: '로우 승자는 누구입니까?', answerSeat: bestSeats(deal)[0] }
}

export function generateLowRun(seed: string): LowQuestion[] {
  const rng = createRng(seed)

  // 유형 순서를 섞는다. 늘 같은 순서면 세 번째 문제부터 답을 유형으로 짐작한다
  const kinds = [...QUOTA]
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = kinds[i]
    kinds[i] = kinds[j]
    kinds[j] = tmp
  }

  return kinds.map((kind) => {
    // 성립할 때까지 다시 돌린다. 상한을 두는 이유는 조건이 잘못됐을 때
    // 무한 루프 대신 명확한 실패로 드러나게 하기 위해서다
    for (let tries = 0; tries < 400; tries++) {
      const deal = dealBoard(rng)
      if (fits(kind, deal)) return build(kind, deal, rng.int(SEAT_COUNT))
    }
    throw new Error(`${kind} 문제를 400번 안에 만들지 못함 — 성립 조건을 다시 보라`)
  })
}
