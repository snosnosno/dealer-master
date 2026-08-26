/**
 * 생성기가 **명세대로 행동하는가**를 묻는 테스트.
 *
 * 룰셋을 판정자로 부르지 않는다 — "생성된 액션이 규칙에 맞는가"와 그 판정의
 * 입력(베팅 컨텍스트, 오픈 벳 플래그)은 `generate.rules.test.ts` 의 몫이다.
 * 여기 남은 것은 결정론, 이벤트 구조, require 계약, 쇼다운 절차, 팟 무결성이다.
 *
 * 대부분은 핸드 출력만 보면 답이 나오지만 require 계약은 예외다 — "그 종류의
 * 판단 지점이 나온다"는 약속이라 소비자인 `extractDecisions` 를 불러야 확인된다.
 * 이벤트 존재만 보는 형태로 쓰면 어떤 회귀도 잡지 못한다.
 */
import { describe, it, expect } from 'vitest'
import { generateHand } from './generate'
import { extractDecisions } from './decisions'
import { initialState, stateAt } from './reduce'
import { buildPots } from './pots'
import type { Hand } from './generate'

describe('generateHand — 결정론', () => {
  it('같은 시드는 같은 핸드를 만든다', () => {
    const a = generateHand({ seed: 'nlh-7f3a91' })
    const b = generateHand({ seed: 'nlh-7f3a91' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('다른 시드는 다른 핸드를 만든다', () => {
    const a = generateHand({ seed: 'seed-a' })
    const b = generateHand({ seed: 'seed-b' })
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('좌석 수와 옵션이 달라도 같은 시드는 두 번 다 같은 이벤트 배열을 만든다', () => {
    // 골든값(시드 X 는 이런 배열)이 아니라 두 번 호출 비교로 본다.
    // 골든값은 구현 출력을 베낀 것이라 구현이 바뀌면 같이 바뀌어 회귀를 못 잡는다.
    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (const require of [undefined, ['calculation'] as const]) {
        const seed = `det-${seatCount}-${require ? 'calc' : 'plain'}`
        const a = generateHand({ seed, seatCount, require: require ? [...require] : undefined })
        const b = generateHand({ seed, seatCount, require: require ? [...require] : undefined })
        expect(a.events).toEqual(b.events)
        expect(a.seats).toEqual(b.seats)
        expect(a.buttonSeat).toBe(b.buttonSeat)
      }
    }
  })
})

describe('generateHand — 구조', () => {
  const hand = generateHand({ seed: 'structure-1' })

  it('기본 좌석 수는 6이다', () => {
    expect(hand.seats).toHaveLength(6)
  })

  it('모든 좌석이 홀카드 2장을 받는다', () => {
    const dealt = hand.events.filter((e) => e.type === 'deal_hole')
    expect(dealt).toHaveLength(12)
  })

  it('블라인드 두 개가 포스팅된다', () => {
    const blinds = hand.events.filter((e) => e.type === 'post_blind')
    expect(blinds).toHaveLength(2)
  })

  it('같은 카드가 두 번 나오지 않는다', () => {
    const seen = new Set<string>()
    for (const e of hand.events) {
      if (e.type === 'deal_hole') seen.add(e.card.rank + e.card.suit)
      if (e.type === 'deal_board') e.cards.forEach((c) => seen.add(c.rank + c.suit))
    }
    const total =
      hand.events.filter((e) => e.type === 'deal_hole').length +
      hand.events
        .filter((e) => e.type === 'deal_board')
        .reduce((n, e) => n + (e.type === 'deal_board' ? e.cards.length : 0), 0)
    expect(seen.size).toBe(total)
  })

  it('라운드가 끝나면 살아 있는 좌석의 벳이 모두 같다', () => {
    // bet > 0 으로 거르면 "아직 한 푼도 안 낸 채 남아 있는 좌석"을 놓친다.
    // 그게 정확히 잡아야 할 위반이므로 필터를 두지 않는다.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hd = generateHand({ seed: 'settle-' + n })
      const init = initialState(hd.seats, hd.buttonSeat)
      hd.events.forEach((e, i) => {
        if (e.type !== 'collect_bets') return
        const s = stateAt(init, hd.events, i)
        const live = s.seats.filter((x) => !x.folded && !x.allIn)
        expect(new Set(live.map((x) => x.bet)).size).toBeLessThanOrEqual(1)
      })
    }
  })

  it('생존자가 한 명이 된 뒤에는 보드를 깔지 않는다', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hd = generateHand({ seed: 'dead-' + n })
      const init = initialState(hd.seats, hd.buttonSeat)
      hd.events.forEach((e, i) => {
        if (e.type !== 'deal_board') return
        const before = stateAt(init, hd.events, i)
        expect(before.seats.filter((x) => !x.folded).length).toBeGreaterThanOrEqual(2)
      })
    }
  })

  it('전원 폴드로 끝난 핸드는 카드를 공개하지 않는다', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hd = generateHand({ seed: 'muck-' + n })
      const init = initialState(hd.seats, hd.buttonSeat)
      const final = stateAt(init, hd.events, hd.events.length)
      if (final.seats.filter((x) => !x.folded).length >= 2) continue
      expect(hd.events.some((e) => e.type === 'showdown_reveal')).toBe(false)
    }
  })

  it('스택이 칩 단위 표준의 배수다', () => {
    hand.seats.forEach((s) => expect(s.stack % 100).toBe(0))
  })

  it('핸드가 끝나면 팟이 비고 스택 합계가 시작 합계와 같다', () => {
    const init = initialState(hand.seats, hand.buttonSeat)
    const final = stateAt(init, hand.events, hand.events.length)
    const start = hand.seats.reduce((a, s) => a + s.stack, 0)
    expect(final.pot).toBe(0)
    expect(final.seats.reduce((a, s) => a + s.stack, 0)).toBe(start)
  })

  it('좌석 수가 범위를 벗어나면 던진다', () => {
    // 헤즈업은 블라인드 규칙이 달라 이 생성기로는 옳은 핸드가 안 나온다.
    expect(() => generateHand({ seed: 'hu', seatCount: 2 })).toThrow()
    expect(() => generateHand({ seed: 'big', seatCount: 10 })).toThrow()
  })

  it('좌석 수 3~9 전 구간에서 핸드가 끝까지 만들어진다', () => {
    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 25; n++) {
        const hd = generateHand({ seed: `seats-${seatCount}-${n}`, seatCount })
        expect(hd.seats).toHaveLength(seatCount)
        const init = initialState(hd.seats, hd.buttonSeat)
        const final = stateAt(init, hd.events, hd.events.length)
        expect(final.pot).toBe(0)
        expect(final.seats.reduce((a, s) => a + s.stack, 0)).toBe(
          hd.seats.reduce((a, s) => a + s.stack, 0),
        )
      }
    }
  })
})

describe('generateHand — 제약', () => {
  it('calculation 을 요구하면 실제로 사이드팟이 생긴다', () => {
    // "올인 이벤트가 2번" 은 사이드팟의 대리 지표일 뿐이다.
    // 계약은 팟 구조이므로 팟 구조로 검증한다.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hand = generateHand({ seed: 'calc-' + n, require: ['calculation'] })
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
      expect(pots.length).toBeGreaterThanOrEqual(2)
    }
  })
})

/*
 * 아래 두 묶음은 브리프의 13개에 더해, 통합 태스크가 지켜야 한다고 넘겨받은
 * 항목들을 좁게 겨냥한다. 골든값(시드 X 는 이런 배열)을 쓰지 않는다 —
 * 그건 구현 출력을 베낀 것이라 회귀를 못 잡는다.
 */

/**
 * 마지막으로 "베팅이 있었던" 라운드의 마지막 공격자를 이벤트 열에서 되찾는다.
 * 생성기 내부 변수를 믿지 않고 상태 델타로만 판정한다 — 어떤 액션이 공격이었나는
 * "그 좌석의 벳이 직전 최고 벳을 넘겼나"로 결정된다.
 * 라운드에 액션이 하나도 없었으면(전원 올인) 앞 라운드의 값을 덮어쓰지 않는다.
 */
function lastRoundAggressor(hand: Hand): number | null {
  const init = initialState(hand.seats, hand.buttonSeat)
  let settled: number | null = null
  let roundHasAction = false
  let roundAggressor: number | null = null

  hand.events.forEach((e, i) => {
    if (e.type === 'collect_bets') {
      if (roundHasAction) settled = roundAggressor
      roundHasAction = false
      roundAggressor = null
      return
    }
    if (e.type !== 'player_action') return
    roundHasAction = true
    const before = stateAt(init, hand.events, i)
    const maxBefore = Math.max(...before.seats.map((x) => x.bet))
    const after = stateAt(init, hand.events, i + 1)
    if (after.seats[e.seat].bet > maxBefore) roundAggressor = e.seat
  })
  return settled
}

describe('generateHand — 쇼다운 절차', () => {
  it('공개 순서는 마지막 공격자부터, 공격자가 없으면 버튼 왼쪽부터 시계방향이다', () => {
    let withAggressor = 0
    let withoutAggressor = 0

    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 60; n++) {
        const hand = generateHand({ seed: `order-${seatCount}-${n}`, seatCount })
        const revealed = hand.events.filter((e) => e.type === 'showdown_reveal').map((e) => e.seat)
        if (revealed.length === 0) continue

        const aggressor = lastRoundAggressor(hand)
        if (aggressor === null) withoutAggressor++
        else withAggressor++

        const start = aggressor ?? (hand.buttonSeat + 1) % seatCount
        const final = stateAt(initialState(hand.seats, hand.buttonSeat), hand.events, hand.events.length)
        const expected: number[] = []
        for (let i = 0; i < seatCount; i++) {
          const seat = (start + i) % seatCount
          if (!final.seats[seat].folded) expected.push(seat)
        }
        expect(revealed, `시드 order-${seatCount}-${n}`).toEqual(expected)
      }
    }

    // 양쪽 갈래를 다 밟지 않으면 이 테스트는 절반만 검증한 것이다.
    expect(withAggressor).toBeGreaterThan(0)
    expect(withoutAggressor).toBeGreaterThan(0)
  })

  it('액션이 끝난 뒤에 보드를 마저 깔 때는 카드를 먼저 공개한다', () => {
    let runouts = 0

    // 런아웃은 액션이 올인으로 닫힌 핸드에서만 생긴다. 배역 없는 핸드에는
    // 올인이 사실상 없으므로(§ 사이드팟 빈도) calculation 시드를 함께 쓴다.
    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 60; n++) {
        const hand = generateHand({
          seed: `runout-${seatCount}-${n}`,
          seatCount,
          require: ['calculation'],
        })
        const init = initialState(hand.seats, hand.buttonSeat)
        const first = hand.events.findIndex((e) => e.type === 'showdown_reveal')
        if (first < 0) continue

        const boardAfter = hand.events.findIndex((e, i) => i > first && e.type === 'deal_board')
        if (boardAfter < 0) continue
        runouts++

        // 공개 뒤에 보드가 더 깔린다면, 그 시점에 아무도 액션할 수 없어야 한다.
        // 액션할 사람이 남아 있는데 카드를 먼저 깠다면 그건 절차 위반이다.
        const at = stateAt(init, hand.events, first)
        const actable = at.seats.filter((x) => !x.folded && !x.allIn).length
        expect(actable, `시드 runout-${seatCount}-${n}`).toBeLessThan(2)
      }
    }

    // 런아웃 핸드를 하나도 안 만났다면 위 단언은 공허하다.
    expect(runouts).toBeGreaterThan(0)
  })
})

describe('generateHand — require 계약', () => {
  it("showdown 을 요구하면 모든 시드에서 쇼다운이 나온다", () => {
    let hands = 0
    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 40; n++) {
        const seed = `sd-${seatCount}-${n}`
        const hand = generateHand({ seed, seatCount, require: ['showdown'] })
        const final = stateAt(initialState(hand.seats, hand.buttonSeat), hand.events, hand.events.length)
        expect(final.seats.filter((s) => !s.folded).length, seed).toBeGreaterThanOrEqual(2)
        expect(hand.events.some((e) => e.type === 'showdown_reveal'), seed).toBe(true)
        expect(final.board, seed).toHaveLength(5)
        hands++
      }
    }
    expect(hands).toBe(280)
  })

  it('calculation 과 showdown 을 함께 요구해도 배역이 서로를 깨지 않는다', () => {
    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 20; n++) {
        const seed = `both-${seatCount}-${n}`
        const hand = generateHand({ seed, seatCount, require: ['calculation', 'showdown'] })
        const final = stateAt(initialState(hand.seats, hand.buttonSeat), hand.events, hand.events.length)
        const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
        expect(pots.length, seed).toBeGreaterThanOrEqual(2)
        expect(hand.events.some((e) => e.type === 'showdown_reveal'), seed).toBe(true)
      }
    }
  })

  it("require:['procedure'] 는 판단 지점이 실제로 나오는 것까지 보장한다", () => {
    /*
     * require 는 "핸드에 그런 이벤트가 있다"가 아니라 "그 종류의 판단 지점이
     * 나온다"는 약속이므로 소비자인 extractDecisions 로 확인한다. deal_hole·
     * collect_bets·player_action 의 존재만 보면 모든 핸드가 구조적으로 통과해
     * require 처리를 어떻게 망가뜨려도 빨개지지 않는다 (그 형태의 테스트가
     * action_validity 의 미이행을 계약 이행처럼 보이게 하고 있었다).
     *
     * 반증하는 구현 변경: 딜링 판단 지점의 오답 게이트(`decisions.ts` 의
     * `distractors.length >= 2`)를 3~9인 중 한 좌석 수에서라도 못 넘게 조이거나,
     * 첫 홀카드 이벤트를 빼면 빨개진다.
     */
    let checked = 0
    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 20; n++) {
        const seed = `req-proc-${seatCount}-${n}`
        const dps = extractDecisions(generateHand({ seed, seatCount, require: ['procedure'] }))
        expect(dps.some((d) => d.kind === 'procedure'), seed).toBe(true)
        checked++
      }
    }
    expect(checked).toBe(140)
  })

  it("require:['action_validity'] 는 최선 노력이고 보장이 아니다", () => {
    /*
     * 이 축은 배역으로 심을 수 없다. 판단 지점이 나오려면 자발적 bet/raise 가
     * 있어야 하고(올인은 해당하지 않는다), 그 금액에서 정답과도 서로와도 겹치지
     * 않는 오답을 둘 만들 수 있어야 한다. 둘째 조건은 금액이 정한다.
     *
     * 시드 'av-0' 이 걸리는 곳은 둘째 조건이다. 첫 자발적 벳이 직전 최고 벳 0 위에
     * 빅블라인드와 같은 200 으로 깔리므로 정답은 200 + max(200, 200) = 400 이고,
     * 오답 후보 넷이 전부 무너진다 — 200+200=400(정답과 겹침), 200×2=400(겹침),
     * 200+0=200(정답보다 크지 않음), 200+⌊200/2⌋=300(유일하게 살아남음).
     * 하나뿐이면 문제가 성립하지 않으므로 이 핸드는 출제하지 않는다.
     *
     * 반증하는 구현 변경: 배역을 심어 이 축을 보장으로 올리면 마지막 단언이
     * 빨개진다(계약을 올리는 것은 의도적 설계 변경이므로 이 테스트를 같이 고쳐야
     * 한다). 오답 겹침 게이트를 없애도 마찬가지로 빨개진다. 생성기가 바뀌어
     * 이 시드의 첫 벳이 더는 빅블라인드 크기가 아니게 되면 앞의 모양 단언이 먼저
     * 빨개져 증인 시드를 새로 고르라고 알려 준다 — 시드는 출력을 베낀 기대값이
     * 아니라 규칙이 예측한 모양의 증인이다.
     */
    const hand = generateHand({ seed: 'av-0', require: ['action_validity'] })
    const idx = hand.events.findIndex(
      (e) => e.type === 'player_action' && (e.action.kind === 'bet' || e.action.kind === 'raise'),
    )
    expect(idx).toBeGreaterThanOrEqual(0)
    const e = hand.events[idx]
    if (e.type !== 'player_action' || !('to' in e.action)) throw new Error('첫 벳/레이즈가 금액을 갖지 않는다')

    const before = stateAt(initialState(hand.seats, hand.buttonSeat), hand.events, idx)
    expect(Math.max(...before.seats.map((s) => s.bet))).toBe(0)
    expect(e.action.to).toBe(hand.blinds.bb)

    expect(extractDecisions(hand).some((d) => d.kind === 'action_validity')).toBe(false)
  })
})

describe('generateHand — 팟 무결성', () => {
  it('미콜 벳은 팟에 남지 않고 되돌아간다', () => {
    // 한 라운드가 정산될 때, 아무도 맞추지 않은 초과분이 남아 있으면 안 된다.
    let seenReturns = 0
    for (let n = 0; n < 120; n++) {
      const hand = generateHand({ seed: 'uncalled-' + n })
      const init = initialState(hand.seats, hand.buttonSeat)
      hand.events.forEach((e, i) => {
        if (e.type === 'return_uncalled') seenReturns++
        if (e.type !== 'collect_bets') return
        const bets = stateAt(init, hand.events, i).seats.map((x) => x.bet)
        const desc = [...bets].sort((a, b) => b - a)
        expect(desc[0] - desc[1]).toBe(0)
      })
    }
    // 미콜 벳이 한 번도 안 나왔다면 위 단언은 공허하다 (전원 폴드 승리가 흔하다).
    expect(seenReturns).toBeGreaterThan(0)
  })

  it('모든 팟이 자격자를 가지고 금액이 칩 단위의 배수다', () => {
    for (let n = 0; n < 120; n++) {
      const hand = generateHand({ seed: 'potint-' + n, require: ['calculation'] })
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
      for (const p of pots) {
        expect(p.eligibleSeats.length).toBeGreaterThan(0)
        expect(p.amount % 100).toBe(0)
      }
    }
  })
})
