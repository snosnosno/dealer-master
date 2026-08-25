import { describe, it, expect } from 'vitest'
import { generateHand, type Hand } from './generate'
import { initialState, stateAt } from './reduce'
import { extractDecisions, TIME_LIMITS } from './decisions'
import { parseCard } from './cards'
import type { HandEvent } from './types'

describe('extractDecisions', () => {
  const hand = generateHand({ seed: 'dp-1', require: ['calculation'] })
  const dps = extractDecisions(hand)

  it('판단 지점이 하나 이상 나온다', () => {
    expect(dps.length).toBeGreaterThan(0)
  })

  it('딜링 절차 판단이 포함된다', () => {
    expect(dps.some((d) => d.kind === 'procedure')).toBe(true)
  })

  it('사이드팟이 있으면 계산 판단이 포함된다', () => {
    expect(dps.some((d) => d.kind === 'calculation')).toBe(true)
  })

  it('쇼다운 판단이 포함된다', () => {
    expect(dps.some((d) => d.kind === 'showdown')).toBe(true)
  })

  it('atEventIndex 가 오름차순이다', () => {
    const idx = dps.map((d) => d.atEventIndex)
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
  })

  it('atEventIndex 가 이벤트 범위 안에 있다', () => {
    dps.forEach((d) => {
      expect(d.atEventIndex).toBeGreaterThanOrEqual(0)
      expect(d.atEventIndex).toBeLessThanOrEqual(hand.events.length)
    })
  })

  it('제한시간이 종류별로 다르게 붙는다', () => {
    dps.forEach((d) => expect(d.timeLimitSec).toBe(TIME_LIMITS[d.kind]))
    expect(TIME_LIMITS.procedure).toBeLessThan(TIME_LIMITS.calculation)
  })

  it('모든 판단 지점에 설명과 조항 근거가 있다', () => {
    dps.forEach((d) => {
      expect(d.explanation.length).toBeGreaterThan(10)
      expect(d.ruleRef.length).toBeGreaterThan(0)
    })
  })

  it('선택형 판단의 정답 인덱스가 선택지 범위 안이다', () => {
    dps.forEach((d) => {
      if (d.input.type === 'choice') {
        expect(d.input.correctIndex).toBeGreaterThanOrEqual(0)
        expect(d.input.correctIndex).toBeLessThan(d.input.choices.length)
      }
    })
  })

  it('선택지에 같은 금액이 두 번 나오지 않는다', () => {
    // 같은 숫자가 두 개면 정답이 둘이거나 문제가 성립하지 않는다
    for (let i = 0; i < 60; i++) {
      extractDecisions(generateHand({ seed: 'dup-' + i })).forEach((d) => {
        if (d.input.type !== 'choice') return
        const nums = d.input.choices.map((c) => c.split(' —')[0])
        expect(new Set(nums).size).toBe(nums.length)
      })
    }
  })

  it('정답이 항상 같은 위치에 있지 않다', () => {
    // 정답 위치가 고정이면 규칙 대신 위치를 학습한다
    const positions = new Set<number>()
    for (let i = 0; i < 60; i++) {
      extractDecisions(generateHand({ seed: 'pos-' + i })).forEach((d) => {
        if (d.input.type === 'choice') positions.add(d.input.correctIndex)
      })
    }
    expect(positions.size).toBeGreaterThan(1)
  })

  it('계산 판단은 실제로 올인이 있었던 핸드에만 붙는다', () => {
    for (let i = 0; i < 60; i++) {
      const hd = generateHand({ seed: 'calcgate-' + i })
      const hasAllin = hd.events.some(
        (e) => e.type === 'player_action' && e.action.kind === 'allin',
      )
      const hasCalc = extractDecisions(hd).some((d) => d.kind === 'calculation')
      if (hasCalc) expect(hasAllin).toBe(true)
    }
  })

  it('같은 시드는 같은 판단 지점을 만든다', () => {
    const a = extractDecisions(generateHand({ seed: 'dp-same' }))
    const b = extractDecisions(generateHand({ seed: 'dp-same' }))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('extractDecisions — 정답 검증', () => {
  it('팟 입력칸의 합은 플레이어들이 실제로 낸 총액과 같다', () => {
    // 구현을 다시 계산해 맞춰보는 게 아니라, 포커에서 항상 참인 항등식으로 본다:
    // 팟에 있는 칩은 누군가 낸 칩이고, 낸 칩은 전부 어느 팟엔가 있다.
    const hand = generateHand({ seed: 'dp-calc', require: ['calculation'] })
    const calc = extractDecisions(hand).find((d) => d.kind === 'calculation')
    expect(calc).toBeDefined()
    if (calc && calc.input.type === 'number') {
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const paid = final.contributed.reduce((a, c) => a + c, 0)
      expect(calc.input.fields.reduce((a, f) => a + f.answer, 0)).toBe(paid)
      calc.input.fields.forEach((f) => expect(f.answer % 100).toBe(0))
    }
  })

  it('최소 레이즈 문제의 정답 — 손으로 계산한 값과 대조 (파일럿 케이스 4)', () => {
    /*
     * 생성기를 통하지 않고 상황을 직접 만든다. 기대값은 규칙에서 나온다:
     * 블라인드 100/200, UTG 가 600 으로 레이즈.
     * 그 레이즈가 상대한 것은 빅블라인드 200 이므로 레이즈 폭은 600 - 200 = 400 이고
     * 다음 사람의 최소 레이즈 총액은 600 + 400 = 1,000 이다.
     * (600 을 폭으로 착각하면 1,200 이 나온다 — 그게 케이스 4 가 경고하는 오답이다.)
     */
    const fixture: Hand = {
      seed: 'fixture-minraise',
      rulesetId: 'nlh',
      seats: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, stack: 50000 })),
      buttonSeat: 0,
      blinds: { sb: 100, bb: 200 },
      events: [
        { type: 'post_blind', seat: 1, amount: 100, kind: 'sb' },
        { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' },
        { type: 'player_action', seat: 3, action: { kind: 'raise', to: 600 } },
      ],
    }

    const dp = extractDecisions(fixture).find((d) => d.kind === 'action_validity')
    expect(dp).toBeDefined()
    if (dp && dp.input.type === 'choice') {
      const picked = dp.input.choices[dp.input.correctIndex]
      expect(picked.startsWith('1,000')).toBe(true)
      // 1,200 은 오답 선택지로 있어도 좋다 — 정답이 아니기만 하면 된다
      expect(picked.startsWith('1,200')).toBe(false)
      expect(dp.input.choices.filter((c) => c.startsWith('1,000'))).toHaveLength(1)
    }
  })

  it('공동 승자가 나오는 팟은 정답 좌석이 여러 개다', () => {
    // 보드 플레이·킥커 동률로 실제 발생한다. 한 명으로 접으면 오답 처리된다.
    for (let i = 0; i < 200; i++) {
      const hd = generateHand({ seed: 'split-' + i })
      const sd = extractDecisions(hd).find((d) => d.kind === 'showdown')
      if (!sd || sd.input.type !== 'seat') continue
      expect(sd.input.correctSeats.length).toBeGreaterThanOrEqual(1)
      sd.input.correctSeats.forEach((s) =>
        expect(sd.input.type === 'seat' && sd.input.options.some((o) => o.seat === s)).toBe(true),
      )
    }
  })
})

/*
 * 아래는 컨트롤러가 따로 인용을 요구한 다섯 가지(최소 레이즈 정답 · 선택지 겹침 ·
 * correctSeats 복수형 · td_discretion · 선택지 순서)를 실측으로 못박는 테스트다.
 * 위 블록이 "한 시드에서 맞는가"를 본다면, 여기는 "여러 시드에서 구조적으로
 * 보장되는가"를 본다.
 */

/** 선택지 문자열 앞머리의 금액을 숫자로 되돌린다. */
const amountOf = (choice: string) => Number(choice.split(' —')[0].replace(/,/g, ''))

/** 이벤트 열에서 첫 벳·레이즈의 위치. 최소 레이즈 문제가 붙는 자리다. */
const firstAggressionIndex = (events: HandEvent[]) =>
  events.findIndex(
    (e) => e.type === 'player_action' && (e.action.kind === 'raise' || e.action.kind === 'bet'),
  )

const deal = (seats: number[], cards: string[][]): HandEvent[] =>
  seats.flatMap((seat, i) => cards[i].map((c) => ({ type: 'deal_hole' as const, seat, card: parseCard(c) })))

describe('extractDecisions — 최소 레이즈 정답의 독립 대조', () => {
  it('출제한 정답은 같은 라운드에서 실제로 나온 다음 레이즈 금액과 같다', () => {
    /*
     * 독립 오라클: 생성기(generate.ts)의 봇은 언제나 최소 금액으로만 레이즈한다.
     * 그 금액은 베팅 라운드를 앞으로 돌리며 추적한 lastRaiseSize 에서 나오고,
     * decisions.ts 는 완성된 이벤트 열을 되감아 폭을 다시 구한다.
     * 두 경로가 어긋나면 둘 중 하나가 규칙을 잘못 적용하고 있다는 뜻이다.
     */
    let checked = 0
    for (let i = 0; i < 200; i++) {
      const hd = generateHand({ seed: 'oracle-' + i })
      const dp = extractDecisions(hd).find((d) => d.kind === 'action_validity')
      if (!dp) continue
      const input = dp.input
      if (input.type !== 'choice') continue
      const answer = amountOf(input.choices[input.correctIndex])
      const at = firstAggressionIndex(hd.events)
      const src = hd.events[at]
      if (src.type !== 'player_action' || !('to' in src.action)) continue

      // 규칙에서 바로 나오는 하한: 최소 레이즈는 직전 벳보다 크고 칩 단위로 떨어진다
      expect(answer).toBeGreaterThan(src.action.to)
      expect(answer % 100).toBe(0)

      // 그 뒤 첫 레이즈까지만 본다 — 올인과 스트리트 전환은 기준 폭을 바꾼다.
      for (let k = at + 1; k < hd.events.length; k++) {
        const e = hd.events[k]
        if (e.type === 'collect_bets' || e.type === 'return_uncalled') break
        if (e.type !== 'player_action') continue
        if (e.action.kind === 'allin') break
        if (e.action.kind === 'raise') {
          expect(e.action.to).toBe(answer)
          checked++
          break
        }
      }
    }
    // 대조할 표본이 없으면 이 테스트는 아무것도 증명하지 않는다
    expect(checked).toBeGreaterThan(0)
  })
})

describe('extractDecisions — 선택지 겹침', () => {
  it('여러 시드·여러 require 조합에서 같은 금액이 두 번 나오지 않는다', () => {
    const variants: Parameters<typeof generateHand>[0][] = []
    for (let i = 0; i < 120; i++) {
      variants.push({ seed: 'ov-' + i })
      variants.push({ seed: 'ov-calc-' + i, require: ['calculation'] })
      variants.push({ seed: 'ov-sd-' + i, require: ['showdown'] })
    }
    let seen = 0
    variants.forEach((opts) => {
      extractDecisions(generateHand(opts)).forEach((d) => {
        if (d.input.type !== 'choice') return
        const nums = d.input.choices.map((c) => c.split(' —')[0])
        expect(new Set(nums).size).toBe(nums.length)
        seen++
      })
    })
    expect(seen).toBeGreaterThan(0)
  })

  it('서로 다른 오답을 두 개 못 만들면 최소 레이즈 문제를 아예 내지 않는다', () => {
    /*
     * 겹침을 막는 방식이 확률이 아니라 구조라는 것을 못박는다.
     * 플랍 첫 벳이 최소 금액(=빅블라인드)이면 오답 후보들이 전부 정답과 겹친다:
     * 정답 400 = 벳 200 + 폭 200 이고, "빅블라인드만큼 추가"도 400,
     * "총액을 두 배로"도 400 이다. 겹치는 것을 버리면 오답이 하나만 남으므로
     * 이 핸드에서는 출제하지 않는 것이 맞다 — 억지로 채우면 정답이 둘이 된다.
     */
    const fixture: Hand = {
      seed: 'fixture-collapse',
      rulesetId: 'nlh',
      seats: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, stack: 50000 })),
      buttonSeat: 0,
      blinds: { sb: 100, bb: 200 },
      events: [
        { type: 'post_blind', seat: 1, amount: 100, kind: 'sb' },
        { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' },
        { type: 'player_action', seat: 3, action: { kind: 'fold' } },
        { type: 'player_action', seat: 4, action: { kind: 'fold' } },
        { type: 'player_action', seat: 5, action: { kind: 'fold' } },
        { type: 'player_action', seat: 0, action: { kind: 'fold' } },
        { type: 'player_action', seat: 1, action: { kind: 'call', to: 200 } },
        { type: 'player_action', seat: 2, action: { kind: 'check' } },
        { type: 'collect_bets' },
        { type: 'deal_board', street: 'flop', cards: ['As', 'Ks', 'Qh'].map(parseCard) },
        { type: 'player_action', seat: 1, action: { kind: 'bet', to: 200 } },
      ],
    }
    expect(extractDecisions(fixture).some((d) => d.kind === 'action_validity')).toBe(false)
  })
})

describe('extractDecisions — 계산 판단의 전제', () => {
  it('계산 판단이 실제로 나오는 핸드에서도 올인이 반드시 있었다', () => {
    /*
     * 위의 'calcgate' 테스트는 require 없이 도는데, 그 경로에서는 사이드팟이
     * 자연 발생하지 않아(300 시드 실측 0건) 조건문이 한 번도 켜지지 않는다.
     * 표본이 0 이면 아무것도 증명하지 못하므로 require 를 걸어 다시 본다.
     */
    let sampled = 0
    for (let i = 0; i < 60; i++) {
      const hd = generateHand({ seed: 'calc-req-' + i, require: ['calculation'] })
      const dp = extractDecisions(hd).find((d) => d.kind === 'calculation')
      if (!dp || dp.input.type !== 'number') continue
      sampled++
      expect(
        hd.events.some((e) => e.type === 'player_action' && e.action.kind === 'allin'),
      ).toBe(true)
      // 사이드팟 문제인데 입력칸이 하나면 나눌 것이 없다
      expect(dp.input.fields.length).toBeGreaterThanOrEqual(2)
    }
    expect(sampled).toBeGreaterThan(0)
  })
})

describe('extractDecisions — 공동 승자', () => {
  it('보드 플레이로 갈리는 팟은 정답 좌석이 둘이다', () => {
    // 두 사람 모두 보드의 브로드웨이 스트레이트를 그대로 쓴다 — 홀카드가 개입하지 않는다.
    const fixture: Hand = {
      seed: 'fixture-split',
      rulesetId: 'nlh',
      seats: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, stack: 50000 })),
      buttonSeat: 0,
      blinds: { sb: 100, bb: 200 },
      events: [
        { type: 'post_blind', seat: 1, amount: 100, kind: 'sb' },
        { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' },
        ...deal([1, 2], [['2c', '3d'], ['4c', '5d']]),
        { type: 'player_action', seat: 3, action: { kind: 'fold' } },
        { type: 'player_action', seat: 4, action: { kind: 'fold' } },
        { type: 'player_action', seat: 5, action: { kind: 'fold' } },
        { type: 'player_action', seat: 0, action: { kind: 'fold' } },
        { type: 'player_action', seat: 1, action: { kind: 'call', to: 200 } },
        { type: 'player_action', seat: 2, action: { kind: 'check' } },
        { type: 'collect_bets' },
        { type: 'deal_board', street: 'flop', cards: ['As', 'Ks', 'Qh'].map(parseCard) },
        { type: 'deal_board', street: 'turn', cards: ['Jd'].map(parseCard) },
        { type: 'deal_board', street: 'river', cards: ['Tc'].map(parseCard) },
        { type: 'showdown_reveal', seat: 1 },
        { type: 'showdown_reveal', seat: 2 },
      ],
    }

    const sd = extractDecisions(fixture).find((d) => d.kind === 'showdown')
    expect(sd).toBeDefined()
    if (sd && sd.input.type === 'seat') {
      expect(sd.input.correctSeats).toEqual([1, 2])
      expect(sd.input.options.map((o) => o.seat)).toEqual([1, 2])
    }
  })
})

describe('extractDecisions — 플로어 판단 영역은 출제하지 않는다', () => {
  /*
   * td_discretion 은 정답이 하나가 아니다. 벳 앞에서의 체크와 오픈 벳이 아닌
   * 언더콜 두 경로 모두, 어느 처리로 갈지는 플로어가 정한다.
   * 그래서 이 파일은 nlh.validateAction 을 아예 호출하지 않고, 액션 유효성 문제는
   * 규정이 총액을 확정하는 최소 레이즈 한 종류만 낸다.
   */
  const discretionFixture: Hand = {
    seed: 'fixture-discretion',
    rulesetId: 'nlh',
    seats: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, stack: 50000 })),
    buttonSeat: 0,
    blinds: { sb: 100, bb: 200 },
    events: [
      { type: 'post_blind', seat: 1, amount: 100, kind: 'sb' },
      { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' },
      { type: 'player_action', seat: 3, action: { kind: 'raise', to: 600 } },
      // 오픈 벳이 아닌 벳에 대한 언더콜 — Rule 51-B 의 플로어 재량 갈래
      { type: 'player_action', seat: 4, action: { kind: 'call', to: 350 } },
      // 벳을 마주한 체크 — 구속력 없는 무효 액션이지 폴드 선언이 아니다
      { type: 'player_action', seat: 5, action: { kind: 'check' } },
    ],
  }

  it('액션 유효성 문제는 핸드당 최대 하나이고, 첫 벳·레이즈 바로 뒤에 붙는다', () => {
    const hands = [discretionFixture]
    for (let i = 0; i < 120; i++) hands.push(generateHand({ seed: 'disc-' + i }))

    hands.forEach((hd) => {
      const av = extractDecisions(hd).filter((d) => d.kind === 'action_validity')
      expect(av.length).toBeLessThanOrEqual(1)
      av.forEach((d) => expect(d.atEventIndex).toBe(firstAggressionIndex(hd.events) + 1))
    })
  })

  it('플로어 재량 액션이 섞여 있어도 판단 지점 개수가 늘지 않는다', () => {
    const withDiscretion = extractDecisions(discretionFixture)
    // 재량 액션 두 개를 뺀 같은 핸드
    const withoutDiscretion = extractDecisions({
      ...discretionFixture,
      events: discretionFixture.events.slice(0, 3),
    })
    expect(withDiscretion.map((d) => d.kind)).toEqual(withoutDiscretion.map((d) => d.kind))
  })
})

describe('extractDecisions — 선택지 순서', () => {
  it('정답 위치가 모든 자리에 골고루 나온다', () => {
    const byLength = new Map<number, Set<number>>()
    for (let i = 0; i < 200; i++) {
      const dps = extractDecisions(generateHand({ seed: 'shuffle-' + i }))
      // 섞기가 시드 결정론적이 아니면 위치 분포는 골고루여도 재현이 깨진다
      expect(JSON.stringify(extractDecisions(generateHand({ seed: 'shuffle-' + i })))).toBe(
        JSON.stringify(dps),
      )
      dps.forEach((d) => {
        if (d.input.type !== 'choice') return
        const set = byLength.get(d.input.choices.length) ?? new Set<number>()
        set.add(d.input.correctIndex)
        byLength.set(d.input.choices.length, set)
      })
    }
    expect(byLength.size).toBeGreaterThan(0)
    // 선택지가 k 개면 정답이 k 자리 전부에 나타나야 위치 학습이 불가능하다
    byLength.forEach((set, len) => expect(set.size).toBe(len))
  })

  it('시드가 다르면 같은 문제라도 정답 위치가 늘 같지는 않다', () => {
    // 같은 픽스처를 시드만 바꿔 넣는다. 섞기가 시드에 묶여 있지 않으면
    // 여기서 위치가 하나로 굳는다.
    const base: Omit<Hand, 'seed'> = {
      rulesetId: 'nlh',
      seats: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, stack: 50000 })),
      buttonSeat: 0,
      blinds: { sb: 100, bb: 200 },
      events: [
        { type: 'post_blind', seat: 1, amount: 100, kind: 'sb' },
        { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' },
        { type: 'player_action', seat: 3, action: { kind: 'raise', to: 600 } },
      ],
    }
    const positions = new Set<number>()
    for (let i = 0; i < 40; i++) {
      const dp = extractDecisions({ ...base, seed: 'mix-' + i }).find(
        (d) => d.kind === 'action_validity',
      )
      if (dp && dp.input.type === 'choice') positions.add(dp.input.correctIndex)
    }
    expect(positions.size).toBe(3)
  })
})
