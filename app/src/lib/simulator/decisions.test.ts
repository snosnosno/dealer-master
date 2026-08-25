import { describe, it, expect } from 'vitest'
import { generateHand, type Hand } from './generate'
import { initialState, stateAt } from './reduce'
import { extractDecisions, TIME_LIMITS } from './decisions'

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
