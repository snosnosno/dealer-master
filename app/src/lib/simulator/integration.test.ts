import { describe, it, expect } from 'vitest'
import {
  generateHand, extractDecisions, scoreDecision, scoreHand, gradeFrom,
  buildPots, cardToString, initialState, stateAt, nlh, ODD_CHIP_UNIT,
} from './index'
import type { BettingContext, Hand } from './index'

describe('엔진 통합 — 핸드 100개', () => {
  const seeds = Array.from({ length: 100 }, (_, i) => `int-${i}`)

  it('모든 핸드가 예외 없이 생성된다', () => {
    seeds.forEach((seed) => {
      expect(() => generateHand({ seed })).not.toThrow()
    })
  })

  it('모든 핸드에서 칩 총액이 보존된다', () => {
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const start = hand.seats.reduce((a, s) => a + s.stack, 0)
      const end = final.seats.reduce((a, s) => a + s.stack, 0) + final.pot
      expect(end).toBe(start)
    })
  })

  it('스택이 음수가 되는 핸드가 없다', () => {
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      for (let i = 0; i <= hand.events.length; i++) {
        const s = stateAt(init, hand.events, i)
        s.seats.forEach((seat) => expect(seat.stack).toBeGreaterThanOrEqual(0))
      }
    })
  })

  it('모든 핸드에서 판단 지점 추출이 예외 없이 된다', () => {
    seeds.forEach((seed) => {
      expect(() => extractDecisions(generateHand({ seed }))).not.toThrow()
    })
  })

  /*
   * 이 검사는 "팟이 깔끔하게 끝난다"보다 강한 것을 지킨다.
   * awardPots 는 자격자가 없는 팟을 그냥 건너뛰므로(pots.ts), 그런 팟이 생기면
   * 그 칩이 아무에게도 가지 않고 pot 에 남는다. 즉 잔여 팟 0 이 곧 "자격자 없는 팟이
   * 생기지 않았다"의 증거다 (컨트롤러 판정 R18). 아래 팟 구조 테스트가 같은 것을
   * 팟에 대고 직접 단언하고, 이쪽은 지급 경로까지 포함해 다시 잡는다.
   */
  it('핸드가 끝나면 팟이 남지 않는다', () => {
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      expect(stateAt(init, hand.events, hand.events.length).pot).toBe(0)
    })
  })

  /*
   * 아무도 맞추지 않은 벳은 팟에 들어가지 않는다 — 딜러는 팟을 끌어오기 전에
   * 초과분을 벳한 사람에게 밀어 돌려준다 (types.ts 의 return_uncalled).
   * 그래서 정산 직전에는 최고 벳이 반드시 다른 좌석 하나 이상과 같아야 한다.
   *
   * 이 단언이 따로 필요한 이유: 미콜 벳이 그대로 팟에 섞여도 칩 총액은 보존되고
   * 잔여 팟도 0 이다 — 그 칩이 벳한 사람만 자격자인 사이드팟이 되어 되돌아가기 때문이다.
   * 즉 위의 두 검사로는 잡히지 않는다(실측: return_uncalled 를 꺼도 15개 전부 초록).
   * 대신 있지도 않은 사이드팟이 하나 생겨 "팟을 나누세요" 문제가 틀린 개수로 출제된다.
   */
  it('정산 직전에 아무도 맞추지 않은 벳이 남아 있지 않다', () => {
    let rounds = 0
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      hand.events.forEach((e, i) => {
        if (e.type !== 'collect_bets') return
        const bets = stateAt(init, hand.events, i).seats.map((s) => s.bet).sort((a, b) => b - a)
        if (bets[0] === 0) return
        expect(bets[1], `${seed} #${i}: 최고 벳 ${bets[0]} 을 아무도 맞추지 않았다`).toBe(bets[0])
        rounds++
      })
    })
    expect(rounds).toBeGreaterThan(0)
  })

  it('한 핸드 안에 같은 카드가 두 번 나오지 않는다', () => {
    let dealt = 0
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const cards = hand.events.flatMap((e) => {
        if (e.type === 'deal_hole') return [e.card]
        if (e.type === 'deal_board') return e.cards
        return []
      })
      expect(new Set(cards.map(cardToString)).size, `${seed}: 중복 카드`).toBe(cards.length)
      dealt += cards.length
    })
    expect(dealt).toBeGreaterThan(0)
  })

  it('모든 좌석이 룰셋이 정한 장수만큼 홀카드를 받는다', () => {
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      expect(final.seats.length).toBe(hand.seats.length)
      final.seats.forEach((s, i) => {
        expect(s.hole.length, `${seed} 좌석 ${i}`).toBe(nlh.holeCardCount)
      })
    })
  })

  /*
   * 팟 구조 세 가지를 한 번에 본다.
   * (1) 자격자가 없는 팟이 없다 — R18 을 잔여 팟이 아니라 팟 자체에 대고 묻는다.
   * (2) 팟 금액이 칩 단위로 떨어진다 — 테이블에 없는 칩으로는 지급할 수 없다.
   * (3) 팟마다 지급 합계가 팟 금액과 정확히 같다 — buildPots 와 awardPots 가 어긋나면
   *     칩 보존 검사는 통과하면서(칩이 팟에 남으므로) 지급만 조용히 틀어질 수 있다.
   */
  it('자격자 없는 팟이 없고, 팟 금액이 칩 단위로 전액 지급된다', () => {
    let pots = 0
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const built = buildPots(final.contributed, final.seats.map((s) => s.folded))
      const paid = new Map<number, number>()
      hand.events.forEach((e) => {
        if (e.type !== 'award_pot') return
        expect(e.amount % ODD_CHIP_UNIT, `${seed}: 지급액 ${e.amount}`).toBe(0)
        paid.set(e.potIndex, (paid.get(e.potIndex) ?? 0) + e.amount)
      })
      built.forEach((p, i) => {
        expect(p.eligibleSeats.length, `${seed} 팟 ${i}: 자격자 없음`).toBeGreaterThan(0)
        expect(p.amount % ODD_CHIP_UNIT, `${seed} 팟 ${i}: ${p.amount}`).toBe(0)
        expect(paid.get(i) ?? 0, `${seed} 팟 ${i} 지급 합계`).toBe(p.amount)
      })
      pots += built.length
    })
    expect(pots).toBeGreaterThan(0)
  })
})

/**
 * 이벤트 로그만 보고 BettingContext 를 규칙 문면 그대로 다시 세운 뒤,
 * 액션 하나하나를 룰셋에게 되물어 합법인지 확인한다. 검사한 액션 수를 돌려준다.
 *
 * generate.ts 의 헬퍼를 부르지 않는 것이 이 함수의 존재 이유다 (컨트롤러 판정 R21(4)).
 * 생성기와 검산기가 같은 코드로 같은 값을 만들면, 둘이 같은 방향으로 규칙을 오해했을 때
 * 초록으로 지나간다 — 그건 검증이 아니라 메아리다. 로직 중복은 그 값으로 치른 비용이다.
 *
 * 근거는 전부 규칙 쪽 문서다: 레이즈 폭과 그 하한은 Rule 43-A(`nlh.minRaiseTo`),
 * 라운드 시작 시 폭의 초기값과 리오픈 권리는 `rulesets/types.ts` 의 BettingContext 주석,
 * 오픈 벳의 정의는 Rule 51-B(`nlh.validateAction` 의 call 분기)다.
 */
function verifyActionsLegal(hand: Hand): number {
  const init = initialState(hand.seats, hand.buttonSeat)
  let checked = 0

  let currentBet = 0
  let lastRaiseSize = 0
  /** 이번 라운드에 오픈 벳 위로 레이즈가 얹혔는가. 얹히는 순간 오픈 벳이 아니게 된다. */
  let raiseSeen = false
  /** 마지막 풀 레이즈 이후 이미 액션한 좌석 — 이들에게는 레이즈 권리가 없다. */
  let actedSinceFullRaise = new Set<number>()

  hand.events.forEach((e, i) => {
    // 라운드 경계. 벳이 팟으로 들어가고 레이즈 폭은 다시 빅블라인드 하한만 남는다
    // (types.ts: "라운드 시작 시 프리플랍은 bigBlind, 그 외는 0").
    if (e.type === 'collect_bets' || e.type === 'deal_board') {
      currentBet = 0
      lastRaiseSize = 0
      raiseSeen = false
      actedSinceFullRaise = new Set()
      return
    }

    if (e.type === 'post_blind') {
      // 블라인드는 액션이 아니라 강제 투입이다. amount 는 총액이 아니라 가산액이므로
      // (reduce.ts post_blind 주석) 이벤트를 접은 뒤의 좌석 벳에서 최고 벳을 다시 읽는다.
      const after = stateAt(init, hand.events, i + 1)
      currentBet = Math.max(...after.seats.map((s) => s.bet))
      lastRaiseSize = hand.blinds.bb
      return
    }

    if (e.type !== 'player_action') return

    const before = stateAt(init, hand.events, i)
    const st = before.seats[e.seat]
    expect(st.folded, `${hand.seed} #${i}: 폴드한 좌석 ${e.seat} 이 액션했다`).toBe(false)
    expect(st.allIn, `${hand.seed} #${i}: 올인한 좌석 ${e.seat} 이 액션했다`).toBe(false)

    const ctx: BettingContext = {
      currentBet,
      lastRaiseSize,
      bigBlind: hand.blinds.bb,
      seatBet: st.bet,
      seatStack: st.stack,
      /*
       * "이번 라운드의 첫 벳인지"는 지금 마주한 벳이 그 라운드의 오픈 벳인가를 묻는다.
       * 오픈 벳 위로 레이즈가 한 번이라도 얹히면 더는 오픈 벳이 아니다.
       * (nlh.test.ts:134 의 픽스처도 currentBet 8,000 을 마주한 채 isOpenBet: true 다.)
       */
      isOpenBet: !raiseSeen,
      canRaise: !actedSinceFullRaise.has(e.seat),
    }

    const r = nlh.validateAction(ctx, e.action)
    expect(
      r.valid,
      `${hand.seed} #${i} 좌석 ${e.seat} ${e.action.kind}: ${r.valid ? '' : r.reason}`,
    ).toBe(true)
    checked++

    // 액션 뒤의 벳은 리듀서에게 묻는다. 스택이 모자라면 올인으로 잘리므로
    // action.to 를 그대로 믿으면 현재 벳이 실제보다 부풀려진다.
    const after = stateAt(init, hand.events, i + 1)
    const newBet = after.seats[e.seat].bet
    actedSinceFullRaise.add(e.seat)

    if (newBet > currentBet) {
      const size = newBet - currentBet
      // 벳이 없던 자리에 처음 얹히는 것이 오픈 벳이고, 그 위에 얹히는 것부터가 레이즈다.
      if (currentBet > 0) raiseSeen = true
      currentBet = newBet
      // 풀 레이즈만 베팅을 다시 연다. 못 미치는 올인은 폭도 갱신하지 않는다 —
      // 갱신하면 뒷사람의 최소 레이즈가 규정보다 작아진다.
      if (size >= Math.max(lastRaiseSize, hand.blinds.bb)) {
        lastRaiseSize = size
        actedSinceFullRaise = new Set([e.seat])
      }
    }
  })

  return checked
}

describe('엔진 통합 — 생성된 핸드가 규칙에 맞는가', () => {
  /*
   * 이 블록이 이 계획서에서 가장 중요한 테스트다.
   * 생성기가 만든 액션 하나하나를 룰셋에게 되물어 합법인지 확인한다.
   * 생성기와 룰셋이 서로를 검산하므로, 한쪽만 틀리면 여기서 걸린다.
   * (수정 전 구현은 이 검사에서 대량으로 걸렸다 — 300 시드 중 119 핸드가
   *  전원 폴드 후에도 보드를 깔았고, 150 핸드가 승자의 카드를 공개했다.)
   */
  const seeds = Array.from({ length: 100 }, (_, i) => `rule-${i}`)

  it('모든 플레이어 액션이 그 시점에 합법이다', () => {
    // 검사한 액션이 0 개면 위 단언들은 한 번도 실행되지 않는다.
    // 표본이 빈 채로 초록이 되는 것을 막는다 — 핸드마다 최소 한 번은 액션이 있다.
    const checked = seeds.reduce((sum, seed) => sum + verifyActionsLegal(generateHand({ seed })), 0)
    expect(checked).toBeGreaterThan(seeds.length)
  })

  it('생존자가 한 명이 된 뒤에는 보드도 공개도 없다', () => {
    let checked = 0
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      hand.events.forEach((e, i) => {
        if (e.type !== 'deal_board' && e.type !== 'showdown_reveal') return
        const before = stateAt(init, hand.events, i)
        expect(
          before.seats.filter((s) => !s.folded).length,
          `${seed} #${i} ${e.type}`,
        ).toBeGreaterThanOrEqual(2)
        checked++
      })
    })
    expect(checked).toBeGreaterThan(0)
  })
})

describe('엔진 통합 — 전체 플레이 루프', () => {
  // 주의: 이 테스트는 채점 배선이 이어져 있는지를 보는 것이지
  // 판단 지점의 정답이 규칙에 맞는지를 보는 것이 아니다.
  // 정답 자체의 검증은 Task 8 의 픽스처 테스트가 한다.
  it('생성 → 판단 추출 → 전부 정답 → 만점', () => {
    const hand = generateHand({ seed: 'loop-perfect', require: ['calculation'] })
    const dps = extractDecisions(hand)
    expect(dps.length).toBeGreaterThan(0)

    const results = dps.map((dp) => {
      if (dp.input.type === 'choice') return scoreDecision(dp, { type: 'choice', index: dp.input.correctIndex })
      if (dp.input.type === 'seat') return scoreDecision(dp, { type: 'seat', seats: dp.input.correctSeats })
      return scoreDecision(dp, { type: 'number', values: dp.input.fields.map((f) => f.answer) })
    })

    const score = scoreHand(results)
    expect(score.average).toBe(100)
  })

  it('생성 → 전부 시간 초과 → 0점, 등급 junior', () => {
    const hand = generateHand({ seed: 'loop-timeout' })
    const dps = extractDecisions(hand)
    const results = dps.map((dp) => scoreDecision(dp, { type: 'timeout' }))
    const score = scoreHand(results)
    expect(score.average).toBe(0)
    expect(gradeFrom([score])).toBe('junior')
  })
})

describe('엔진 통합 — 결정성과 require 계약', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => `det-${i}`)

  it('같은 시드가 같은 핸드와 같은 판단 지점을 만든다', () => {
    seeds.forEach((seed) => {
      const a = generateHand({ seed })
      const b = generateHand({ seed })
      expect(b).toEqual(a)
      expect(extractDecisions(b)).toEqual(extractDecisions(a))
    })
  })

  it('다른 시드는 다른 핸드를 만든다', () => {
    // 위 테스트만으로는 시드를 무시하고 늘 같은 핸드를 내놓는 생성기도 통과한다.
    const shapes = new Set(seeds.map((seed) => JSON.stringify(generateHand({ seed }).events)))
    expect(shapes.size).toBe(seeds.length)
  })

  it('require 로 calculation 을 요구하면 시드와 무관하게 사이드팟과 계산 문제가 나온다', () => {
    // 사이드팟은 평범한 핸드에서는 나오지 않는다 — 배역으로 심어야 나온다.
    // 그래서 사이드팟이 필요한 검사는 반드시 require 를 명시한다.
    seeds.forEach((seed) => {
      const hand = generateHand({ seed, require: ['calculation'] })
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
      expect(pots.length, `${seed}: 사이드팟이 없다`).toBeGreaterThanOrEqual(2)
      expect(
        extractDecisions(hand).some((dp) => dp.kind === 'calculation'),
        `${seed}: 계산 문제가 없다`,
      ).toBe(true)
    })
  })
})
