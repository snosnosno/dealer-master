/**
 * 사이드팟 분리와 팟 지급 계산.
 *
 * 딜러 실무에서 가장 자주 틀리는 계산이고, 이 서비스가 가르치려는 바로 그 내용이다.
 * 여기가 틀리면 사용자가 틀린 분할을 정답으로 배우게 되므로
 * 팟의 "금액"뿐 아니라 "개수"와 "자격자 집합"까지 규칙 그대로여야 한다.
 */
import type { Card } from './cards'
import { compareHands, evaluateHand } from './evaluate'

export type Pot = { amount: number; eligibleSeats: number[] }
export type PotAward = { potIndex: number; seat: number; amount: number }

/**
 * 투입액을 층(layer)으로 잘라 메인팟과 사이드팟을 만든다.
 *
 * 비유: 여러 사람이 서로 다른 높이까지 물을 부은 통들이 있고,
 * 가장 낮은 수면 높이로 한 번 자르면 그게 메인팟, 그 위층이 사이드팟이다.
 *
 * 폴드한 사람의 투입액은 팟에 그대로 남지만(데드머니) 어느 팟도 가져갈 수 없다.
 * 블라인드를 낸 사람이 그대로 올인했다면 그 블라인드는 데드머니가 아니라
 * 그 사람의 투입액에 이미 포함돼 있다 — contributed 를 쓰면 자동으로 맞는다.
 */
export function buildPots(contributed: number[], folded: boolean[]): Pot[] {
  // folded 가 짧으면 뒤쪽 좌석이 조용히 "살아 있는" 것으로 취급돼
  // 자격자 집합이 틀어진다. 팟 분할은 틀려도 그럴듯해 보이므로 여기서 막는다.
  if (folded.length !== contributed.length) {
    throw new Error(`좌석 수 불일치: contributed ${contributed.length}, folded ${folded.length}`)
  }

  const levels = Array.from(
    new Set(contributed.filter((c) => c > 0)),
  ).sort((a, b) => a - b)

  const pots: Pot[] = []
  let prev = 0

  for (const level of levels) {
    const layer = level - prev
    let amount = 0
    const eligible: number[] = []

    contributed.forEach((c, seat) => {
      const take = Math.min(Math.max(c - prev, 0), layer)
      amount += take
      if (c >= level && !folded[seat]) eligible.push(seat)
    })

    if (amount > 0) pots.push({ amount, eligibleSeats: eligible })
    prev = level
  }

  /*
   * 층을 자른 것만으로는 팟이 되지 않는다.
   * 사이드팟은 "올인으로 더 적게 낸 사람 때문에 참가 자격이 갈릴 때"만 생긴다 (TDA Rule 21).
   * 폴드한 사람이 만든 층은 자격자 집합을 바꾸지 않으므로 팟을 새로 만들지 않고
   * 앞 팟에 얹히는 데드머니일 뿐이다.
   *
   * 이 병합을 빼면 폴드한 빅블라인드의 200 하나가 별도 팟을 만들어
   * 목업 핸드가 [800, 23400, 9000] 세 팟이 된다 (정답은 [24200, 9000]).
   * 팟의 "개수"가 곧 유저에게 물어볼 입력칸 개수라 이건 그대로 오답 출제로 이어진다.
   */
  const merged: Pot[] = []
  for (const p of pots) {
    const last = merged[merged.length - 1]
    // eligibleSeats 는 양쪽 다 좌석 오름차순으로 쌓이므로 순서대로 비교하면 집합 비교가 된다.
    const sameEligible =
      last !== undefined &&
      last.eligibleSeats.length === p.eligibleSeats.length &&
      last.eligibleSeats.every((s, i) => s === p.eligibleSeats[i])

    if (last !== undefined && (p.eligibleSeats.length === 0 || sameEligible)) {
      merged[merged.length - 1] = { ...last, amount: last.amount + p.amount }
    } else {
      merged.push({ ...p })
    }
  }
  return merged
}

/** 테이블에 존재하는 가장 작은 칩. 분할은 이 단위 아래로 쪼갤 수 없다. */
export const ODD_CHIP_UNIT = 100

/**
 * 버튼 왼쪽 첫 좌석부터 시계방향 순서로 정렬한다. 홀칩 배분 순서의 기준이다.
 * 버튼 자신은 이 순서의 맨 뒤다 (가장 좋은 포지션이 홀칩을 마지막에 받는다).
 */
function orderFromButton(seats: number[], buttonSeat: number, seatCount: number): number[] {
  // JS 의 % 는 음수를 그대로 음수로 돌려주므로 한 번 더 접어 0 이상으로 만든다.
  const dist = (s: number) => (((s - buttonSeat - 1) % seatCount) + seatCount) % seatCount
  return [...seats].sort((a, b) => dist(a) - dist(b))
}

export function awardPots(
  pots: Pot[],
  hole: Card[][],
  board: Card[],
  buttonSeat: number,
): PotAward[] {
  const awards: PotAward[] = []
  const seatCount = hole.length

  pots.forEach((pot, potIndex) => {
    if (pot.eligibleSeats.length === 0) return

    // 자격자가 한 명이면 쇼다운이 없다. 보드가 5장이 아닌 채로 끝난 핸드
    // (전원 폴드) 에서 evaluateHand 를 부르면 카드가 모자라 던진다.
    let winners: number[]
    if (pot.eligibleSeats.length === 1) {
      winners = [...pot.eligibleSeats]
    } else {
      const ranked = pot.eligibleSeats.map((seat) => ({
        seat,
        rank: evaluateHand([...hole[seat], ...board]),
      }))
      let best = ranked[0].rank
      for (const r of ranked) if (compareHands(r.rank, best) > 0) best = r.rank
      winners = ranked.filter((r) => compareHands(r.rank, best) === 0).map((r) => r.seat)
    }

    /*
     * 홀칩은 "가장 작은 칩" 단위로 남고, 버튼 왼쪽 첫 자격자부터 한 칩씩 간다.
     * 낮은 좌석 인덱스부터 주면 좌석 번호가 규칙인 것처럼 가르치게 된다 —
     * 실제 기준은 버튼이다. 그리고 8,100 을 둘로 나눠 4,050 씩 주는 것은
     * 테이블에 50 칩이 없으므로 현장에서 불가능하다. 4,100 / 4,000 이 정답이다.
     * ⚠️ 조항 번호는 TDA 2024 PDF 원문으로 확인해 채울 것 (기존 "Rule 20" 표기는 미검증).
     */
    const ordered = orderFromButton(winners, buttonSeat, seatCount)
    const units = Math.floor(pot.amount / ODD_CHIP_UNIT)
    const base = Math.floor(units / ordered.length) * ODD_CHIP_UNIT
    let remainder = pot.amount - base * ordered.length

    ordered.forEach((seat) => {
      const extra = Math.min(remainder, ODD_CHIP_UNIT)
      remainder -= extra
      awards.push({ potIndex, seat, amount: base + extra })
    })
  })

  return awards
}
