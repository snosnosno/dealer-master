import { describe, it, expect } from 'vitest'
import { ANY_FIVE_EVALUATOR } from './evaluate'
import { buildPots, awardPots } from './pots'
import { parseCard } from './cards'

const h = (...s: string[]) => s.map(parseCard)

describe('buildPots — 목업 핸드', () => {
  // 좌석: 0 김도현(폴드) 1 박서준 2 이민아 3 최우진 4 정하늘(폴드, BB 200) 5 강태호(폴드)
  const contributed = [0, 12500, 12500, 8000, 200, 0]
  const folded =      [true, false, false, false, true, true]

  it('메인팟은 24,200 이다', () => {
    const pots = buildPots(contributed, folded)
    expect(pots[0].amount).toBe(24200)
  })

  it('메인팟 참가자는 폴드하지 않은 세 명이다', () => {
    const pots = buildPots(contributed, folded)
    expect(pots[0].eligibleSeats.sort()).toEqual([1, 2, 3])
  })

  it('사이드팟은 9,000 이고 최우진은 참가할 수 없다', () => {
    const pots = buildPots(contributed, folded)
    expect(pots[1].amount).toBe(9000)
    expect(pots[1].eligibleSeats.sort()).toEqual([1, 2])
  })

  it('팟은 정확히 두 개다', () => {
    // 올인은 최우진(8,000) 하나뿐이므로 자격이 갈리는 지점도 하나다.
    // 폴드한 정하늘의 BB 200 은 메인팟에 얹히는 데드머니일 뿐 팟을 만들지 않는다.
    expect(buildPots(contributed, folded)).toHaveLength(2)
  })

  it('팟 합계가 총 투입액과 같다', () => {
    const pots = buildPots(contributed, folded)
    const total = contributed.reduce((a, b) => a + b, 0)
    expect(pots.reduce((a, p) => a + p.amount, 0)).toBe(total)
  })
})

describe('buildPots — 기타', () => {
  it('올인이 없으면 팟은 하나다', () => {
    const pots = buildPots([1000, 1000, 1000], [false, false, false])
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(3000)
  })

  it('폴드한 사람이 적게 내고 죽어도 사이드팟은 생기지 않는다', () => {
    // 데드머니는 참가 자격을 가르지 않는다. 팟은 하나다.
    const pots = buildPots([500, 1000, 1000], [true, false, false])
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(2500)
    expect(pots[0].eligibleSeats).toEqual([1, 2])
  })

  it('폴드한 블라인드 하나가 별도 팟을 만들지 않는다', () => {
    // 목업 핸드의 축소판: 폴드한 BB 200 + 살아 있는 두 명 1,000씩
    const pots = buildPots([200, 1000, 1000], [true, false, false])
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(2200)
  })

  it('서로 다른 세 올인은 팟 세 개를 만든다', () => {
    const pots = buildPots([1000, 2000, 3000], [false, false, false])
    expect(pots.map((p) => p.amount)).toEqual([3000, 2000, 1000])
  })
})

describe('awardPots — 목업 핸드의 핵심', () => {
  const board = h('Kd','9s','7h','2c','Qs')
  const hole: Record<number, ReturnType<typeof h>> = {
    1: h('As','Ks'), // K 원페어
    2: h('7c','7s'), // 트리플 7
    3: h('9h','9d'), // 트리플 9
  }
  const holeArr = [[], hole[1], hole[2], hole[3], [], []]

  const pots = buildPots([0, 12500, 12500, 8000, 200, 0], [true, false, false, false, true, true])
  const BUTTON = 2

  it('메인팟은 최우진(좌석 3)이 가져간다', () => {
    const awards = awardPots(pots, holeArr, board, BUTTON, ANY_FIVE_EVALUATOR)
    const main = awards.filter((a) => a.potIndex === 0)
    expect(main).toHaveLength(1)
    expect(main[0].seat).toBe(3)
    expect(main[0].amount).toBe(24200)
  })

  it('사이드팟은 이민아(좌석 2)가 가져간다 — 승자가 서로 다르다', () => {
    const awards = awardPots(pots, holeArr, board, BUTTON, ANY_FIVE_EVALUATOR)
    const side = awards.filter((a) => a.potIndex === 1)
    expect(side).toHaveLength(1)
    expect(side[0].seat).toBe(2)
    expect(side[0].amount).toBe(9000)
  })

  it('자격자가 한 명뿐이면 보드가 5장이 아니어도 지급된다', () => {
    // 전원 폴드로 끝난 핸드. 쇼다운이 없으므로 족보를 평가하면 안 된다.
    const onePot = buildPots([1000, 500], [false, true])
    const awards = awardPots(onePot, [[], []], [], 0, ANY_FIVE_EVALUATOR)
    expect(awards).toEqual([{ potIndex: 0, seat: 0, amount: 1500, half: 'hi' }])
  })
})

describe('awardPots — 동점 분배와 홀칩', () => {
  const board = h('Kd','9s','7h','2c','Qs')
  const tie = [h('Ah','Jd'), h('Ac','Jh')] // 완전 동일 족보
  // 셋·넷이 동시에 동점인 경우. 전부 A-J 하이카드로 완전히 같고,
  // 보드에 같은 수트가 2장뿐이라 누구도 플러시가 되지 않는다.
  // 마지막 좌석은 폴드해서 자격이 없으므로 홀카드가 필요 없다.
  const tie4 = [h('Ah','Jd'), h('Ac','Jh'), h('Ad','Jc'), []]
  const tie5 = [h('Ah','Jd'), h('Ac','Jh'), h('Ad','Jc'), h('As','Js'), []]

  it('동점이면 나눠 갖는다', () => {
    const pots = buildPots([1000, 1000], [false, false])
    const awards = awardPots(pots, tie, board, 0, ANY_FIVE_EVALUATOR)
    expect(awards).toHaveLength(2)
    expect(awards.map((a) => a.amount)).toEqual([1000, 1000])
  })

  it('홀칩은 버튼 왼쪽 첫 자격자에게 간다 — 좌석 번호가 기준이 아니다', () => {
    // 팟 2,100 을 둘이 나눈다. 50 칩은 존재하지 않으므로 1,100 / 1,000 이 정답이다.
    // 버튼이 좌석 0 이면 버튼 왼쪽 첫 자격자는 좌석 1 이다.
    const pots = buildPots([1050, 1050], [false, false])
    const awards = awardPots(pots, tie, board, 0, ANY_FIVE_EVALUATOR)
    const bySeat = new Map(awards.map((a) => [a.seat, a.amount]))
    expect(bySeat.get(1)).toBe(1100)
    expect(bySeat.get(0)).toBe(1000)
  })

  it('버튼이 옮겨가면 홀칩 수령자도 바뀐다', () => {
    const pots = buildPots([1050, 1050], [false, false])
    const awards = awardPots(pots, tie, board, 1, ANY_FIVE_EVALUATOR)
    const bySeat = new Map(awards.map((a) => [a.seat, a.amount]))
    expect(bySeat.get(0)).toBe(1100)
    expect(bySeat.get(1)).toBe(1000)
  })

  it('분배 총액은 팟과 정확히 같다', () => {
    const pots = buildPots([1050, 1050], [false, false])
    const awards = awardPots(pots, tie, board, 0, ANY_FIVE_EVALUATOR)
    expect(awards.reduce((a, x) => a + x.amount, 0)).toBe(2100)
  })

  it('셋이 나눠도 홀칩 하나가 버튼 왼쪽 첫 자격자에게 가고 총액이 보존된다', () => {
    // 팟 2,200 을 셋이 나눈다. 2,200 / 3 은 나눠떨어지지 않는다 —
    // 700 씩 주고 남는 홀칩 100 하나가 버튼 왼쪽 첫 자격자에게 간다.
    // 반올림(733 x 3 = 2,199)은 칩을 하나 잃고 733 은 존재하지도 않는 칩이다.
    // 좌석 3 은 폴드한 데드머니 100 이라 팟을 가르지 않는다.
    const pots = buildPots([700, 700, 700, 100], [false, false, false, true])
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(2200)

    // 버튼이 좌석 0 이면 배분 순서는 1 → 2 → 3 → 0 이다. 첫 자격자는 좌석 1.
    const awards = awardPots(pots, tie4, board, 0, ANY_FIVE_EVALUATOR)
    const bySeat = new Map(awards.map((a) => [a.seat, a.amount]))
    expect(bySeat.get(1)).toBe(800)
    expect(bySeat.get(2)).toBe(700)
    expect(bySeat.get(0)).toBe(700)
    expect(awards.reduce((a, x) => a + x.amount, 0)).toBe(2200)
  })

  it('넷이 나누고 홀칩이 둘이면 버튼 왼쪽부터 연속으로 하나씩 간다', () => {
    // 팟 2,600 을 넷이 나눈다. 600 씩 주고 홀칩 100 이 두 개 남는다.
    // 두 개가 한 사람에게 몰리지 않고 버튼 왼쪽부터 한 개씩 간다.
    const pots = buildPots([600, 600, 600, 600, 200], [false, false, false, false, true])
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(2600)

    // 버튼이 좌석 1 이면 배분 순서는 2 → 3 → 4 → 0 → 1 이다.
    // 자격자는 0~3 이므로 홀칩 두 개는 좌석 2 와 3 이 받는다 — 좌석 번호 순이 아니다.
    const awards = awardPots(pots, tie5, board, 1, ANY_FIVE_EVALUATOR)
    const bySeat = new Map(awards.map((a) => [a.seat, a.amount]))
    expect(bySeat.get(2)).toBe(700)
    expect(bySeat.get(3)).toBe(700)
    expect(bySeat.get(0)).toBe(600)
    expect(bySeat.get(1)).toBe(600)
    expect(awards.reduce((a, x) => a + x.amount, 0)).toBe(2600)
  })

  it('hole 이 좌석 수보다 짧으면 조용히 틀리지 않고 던진다', () => {
    // 4인 테이블에서 만든 팟에 2인분 hole 만 넘긴 경우.
    // 이대로 두면 seatCount 가 2 라 홀칩 순서가 조용히 틀어진다.
    const pots = [{ amount: 1000, eligibleSeats: [0, 3] }]
    expect(() => awardPots(pots, tie, board, 0, ANY_FIVE_EVALUATOR)).toThrow(/좌석 수 불일치/)
  })
})
