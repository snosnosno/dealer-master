/**
 * 쇼다운에서 팟을 **누구에게** 주는가.
 *
 * 판정은 엔진에게만 묻는다(`evaluatorFor`). 여기서 랭크를 다시 세면 승자 판독 드릴과
 * 판정 사본이 둘이 되고, 한쪽만 고쳐지는 날이 온다.
 *
 * **폴드한 좌석은 후보가 아니다.** 로우가 더 좋아도 접은 손은 팟을 받지 못한다.
 */
import { cards, compareHands, compareLow, type LowRank, type TableView } from '@/lib/simulator'
import { evaluatorFor, type GameSpec } from '@/lib/games'
import { asksFor, type WinnerAsks } from '@/lib/drills/winner/types'

/** 좌석 번호 오름차순. 동률이면 여럿이고, 로우가 서지 않으면 `lo` 가 빈 배열이다 */
export type AwardAnswer = { hi: number[]; lo: number[] }

export function awardAsks(spec: GameSpec): WinnerAsks {
  return asksFor(spec)
}

export function awardAnswer(spec: GameSpec, table: TableView): AwardAnswer {
  const ev = evaluatorFor(spec)
  const alive = table.seats.flatMap((seat, i) => (seat.folded ? [] : [i]))
  const hole = (i: number) => cards(table.seats[i].hole)

  const hi = ev.rankHi === null ? [] : bestSeats(alive.map((i) => ({ i, r: ev.rankHi!(hole(i), table.board) })), compareHands)

  const rankLo = ev.rankLo
  const lows = rankLo === null
    ? []
    : alive.flatMap((i) => {
        const r = rankLo(hole(i), table.board)
        return r === null ? [] : [{ i, r }]
      })
  // 로우는 낮을수록 좋다 — 부호를 돌려 「클수록 좋다」 한 모양으로 센다
  const lo = bestSeats(lows, (a: LowRank, b: LowRank) => -compareLow(a, b))

  return { hi, lo }
}

/** 같은 좌석 집합인가. 순서는 보지 않는다 — 나눠 받는 좌석을 빠뜨리면 틀린다 */
export function awardMatches(answer: AwardAnswer, pick: AwardAnswer): boolean {
  return sameSet(answer.hi, pick.hi) && sameSet(answer.lo, pick.lo)
}

function bestSeats<T>(ranked: { i: number; r: T }[], cmp: (a: T, b: T) => number): number[] {
  if (ranked.length === 0) return []
  const top = ranked.reduce((a, b) => (cmp(b.r, a.r) > 0 ? b : a)).r
  return ranked.filter((x) => cmp(x.r, top) === 0).map((x) => x.i)
}

function sameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}
