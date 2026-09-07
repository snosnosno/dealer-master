/**
 * 사이드팟 분리와 팟 지급 계산.
 *
 * 딜러 실무에서 가장 자주 틀리는 계산이고, 이 서비스가 가르치려는 바로 그 내용이다.
 * 여기가 틀리면 사용자가 틀린 분할을 정답으로 배우게 되므로
 * 팟의 "금액"뿐 아니라 "개수"와 "자격자 집합"까지 규칙 그대로여야 한다.
 */
import type { Card } from './cards'
import { compareHands, type HandEvaluator } from './evaluate'
import { compareLow } from './lowball'

export type Pot = { amount: number; eligibleSeats: number[] }
export type PotAward = { potIndex: number; seat: number; amount: number; half: 'hi' | 'lo' }

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
   * 사이드팟은 "올인으로 더 적게 낸 사람 때문에 참가 자격이 갈릴 때"만 생긴다.
   * 폴드한 사람이 만든 층은 자격자 집합을 바꾸지 않으므로 팟을 새로 만들지 않고
   * 앞 팟에 얹히는 데드머니일 뿐이다.
   * TDA 2024 규정집 원문 대조 완료 — "21: Side Pots / 각 사이드 팟은 분리해서 두어야 합니다"
   * (영문 Longform v1.0, 한글 번역본 둘 다 21번). 다만 조항 본문은 "분리해서 둔다"는
   * 한 문장이고, 아래 층 자르기·데드머니 병합 절차 자체를 규정하지는 않는다.
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
  evaluator: HandEvaluator,
): PotAward[] {
  const awards: PotAward[] = []
  const seatCount = hole.length

  // hole 이 좌석 수보다 짧으면 seatCount 가 작아져 홀칩 순서가 조용히 틀어지고,
  // 자격 좌석의 홀카드도 없는 채로 평가에 들어간다. 통합 단계에서 증상으로 나타나면
  // 원인 추적이 가장 비싼 종류라 여기서 크게 실패시킨다.
  // buildPots 의 좌석 수 가드와 같은 계열 — 없는 정보라 유도로는 풀 수 없다.
  for (const pot of pots) {
    for (const seat of pot.eligibleSeats) {
      if (seat < 0 || seat >= seatCount) {
        throw new Error(`좌석 수 불일치: 자격 좌석 ${seat}, hole ${seatCount}`)
      }
    }
  }

  pots.forEach((pot, potIndex) => {
    if (pot.eligibleSeats.length === 0) return

    /*
     * 자격자가 한 명이면 쇼다운이 없다. 보드가 5장이 아닌 채로 끝난 핸드
     * (전원 폴드) 에서 평가기를 부르면 카드가 모자라 던진다.
     * 반으로 가르지도 않는다 — 나눌 상대가 없다.
     */
    if (pot.eligibleSeats.length === 1) {
      awards.push({ potIndex, seat: pot.eligibleSeats[0], amount: pot.amount, half: 'hi' })
      return
    }

    // **팟마다 다시 구한다** — 팟마다 자격자가 다르므로 임자도 다르다
    const hiSet = hiSeats(pot.eligibleSeats, hole, board, evaluator)
    const loSet = loSeats(pot.eligibleSeats, hole, board, evaluator)

    // 로우 성립자가 없으면 하이가 전부 가져간다 (가이드 p5)
    if (loSet.length === 0) {
      pushShare(awards, potIndex, 'hi', pot.amount, hiSet, buttonSeat, seatCount)
      return
    }

    const half = splitHalf(pot.amount)
    pushShare(awards, potIndex, 'hi', half.hi, hiSet, buttonSeat, seatCount)
    pushShare(awards, potIndex, 'lo', half.lo, loSet, buttonSeat, seatCount)
  })

  return awards
}

/** 이 팟 자격자 중 하이 최고 동률 좌석들. **동점이면 여럿이다** — 걸러내지 않는다 */
function hiSeats(
  eligible: number[], hole: Card[][], board: Card[], ev: HandEvaluator,
): number[] {
  const ranked = eligible.map((seat) => ({ seat, rank: ev.rankHi(hole[seat], board) }))
  let best = ranked[0].rank
  for (const r of ranked) if (compareHands(r.rank, best) > 0) best = r.rank
  return ranked.filter((r) => compareHands(r.rank, best) === 0).map((r) => r.seat)
}

/** 자격을 통과한 것 중 최저 동률 좌석들. 자격자가 없으면 빈 배열이고 그것이 「로우 없음」이다 */
function loSeats(
  eligible: number[], hole: Card[][], board: Card[], ev: HandEvaluator,
): number[] {
  const rankLo = ev.rankLo
  if (rankLo === null) return []
  const ranked = eligible.flatMap((seat) => {
    const low = rankLo(hole[seat], board)
    return low === null ? [] : [{ seat, low }]
  })
  if (ranked.length === 0) return []
  let best = ranked[0].low
  for (const r of ranked) if (compareLow(r.low, best) < 0) best = r.low
  return ranked.filter((r) => compareLow(r.low, best) === 0).map((r) => r.seat)
}

/**
 * 팟을 하이/로우 절반으로 가른다 — **홀칩 1차.**
 *
 * 칩 단위로 못 가르는 나머지는 **하이 쪽**이다. 8,100 은 4,050 씩이 아니라
 * 4,100 / 4,000 이다 — 테이블에 50 칩이 없다.
 * 출처: docs/references/mixgame-facts.md 「홀칩은 Hi 승자에게」(가이드 p5).
 */
function splitHalf(amount: number): { hi: number; lo: number } {
  const units = Math.floor(amount / ODD_CHIP_UNIT)
  const lo = Math.floor(units / 2) * ODD_CHIP_UNIT
  return { hi: amount - lo, lo }
}

/**
 * 한 절반을 그 집합 안에서 나눈다 — **홀칩 2차.**
 *
 * 남는 칩은 버튼 왼쪽 첫 자격자부터 한 칩씩. 낮은 좌석 인덱스부터 주면 좌석 번호가
 * 규칙인 것처럼 가르치게 된다 — 실제 기준은 버튼이다.
 * TDA 2024 「20: Awarding Odd Chips」 대조 완료.
 */
function pushShare(
  awards: PotAward[],
  potIndex: number,
  half: 'hi' | 'lo',
  amount: number,
  winners: number[],
  buttonSeat: number,
  seatCount: number,
): void {
  if (amount === 0 || winners.length === 0) return
  const ordered = orderFromButton(winners, buttonSeat, seatCount)
  const units = Math.floor(amount / ODD_CHIP_UNIT)
  const base = Math.floor(units / ordered.length) * ODD_CHIP_UNIT
  let remainder = amount - base * ordered.length

  ordered.forEach((seat) => {
    const extra = Math.min(remainder, ODD_CHIP_UNIT)
    remainder -= extra
    awards.push({ potIndex, seat, amount: base + extra, half })
  })
}
