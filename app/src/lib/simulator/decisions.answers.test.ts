/**
 * 출제된 문제의 "정답"이 규칙과 맞는가, 그리고 채점이 가능한 형태인가.
 *
 * 계약 테스트(`decisions.test.ts`)가 "함수가 명세대로 동작하는가"를 본다면
 * 여기는 검토에서 실제로 터진 결함들의 회귀 방어선이다 —
 * 최소 레이즈 정답 불일치(221/296) 와 선택지 겹침(296/296) 이 그것이다.
 * 한 시드에서 맞는지가 아니라 여러 시드에서 구조적으로 보장되는지를 본다.
 */
import { describe, it, expect } from 'vitest'
import { generateHand, MAX_SEATS, MIN_SEATS, type Hand } from './generate'
import { extractDecisions } from './decisions'
import { parseCard } from './cards'
import type { HandEvent } from './types'

/** 선택지 문자열 앞머리의 금액을 숫자로 되돌린다. */
const amountOf = (choice: string) => Number(choice.split(' —')[0].replace(/,/g, ''))

/**
 * 선택지를 실제로 구별하는 값. 금액 문제는 숫자가, 절차 문제는 좌석이 정체다
 * (좌석은 이름으로 식별한다 — 한 핸드 안에서 이름은 좌석마다 다르다).
 * 역할 이름("스몰블라인드"…)으로 키를 잡으면 서로 다른 역할이 같은 좌석을 가리켜도
 * 넷 다 달라 보인다. 그러면 겹침 검사가 절차 문제에서는 어떤 좌석 수에서도 실패할 수 없다.
 */
const identityOf = (choice: string) => {
  const head = choice.split(' —')[0]
  return /^[\d,]+$/.test(head) ? head : choice.split('— ')[1].split(' (')[0]
}

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
  it('여러 시드·여러 require 조합에서 같은 대상이 두 번 나오지 않는다', () => {
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
        const ids = d.input.choices.map(identityOf)
        expect(new Set(ids).size).toBe(ids.length)
        seen++
      })
    })
    expect(seen).toBeGreaterThan(0)
  })

  it('좌석이 적어 역할이 겹치는 테이블에서도 같은 좌석을 두 번 내지 않는다', () => {
    /*
     * 3인 테이블은 (버튼+3)%3 = 버튼이라 "언더더건" 과 "버튼" 이 같은 좌석이다.
     * `generate.ts` 의 MIN_SEATS 가 3 이므로 이건 지원되는 입력이고, 겹친 역할을
     * 그대로 내보내면 같은 사람이 두 번 적힌 문제가 학습자에게 나간다.
     * 지원 범위(MIN_SEATS~MAX_SEATS) 전체를 돌아 좌석 기준으로 본다.
     */
    let seen = 0
    for (let seatCount = MIN_SEATS; seatCount <= MAX_SEATS; seatCount++) {
      for (let i = 0; i < 20; i++) {
        const dp = extractDecisions(
          generateHand({ seed: `seats-${seatCount}-${i}`, seatCount }),
        ).find((d) => d.kind === 'procedure')
        if (!dp || dp.input.type !== 'choice') continue
        const ids = dp.input.choices.map(identityOf)
        expect(new Set(ids).size).toBe(ids.length)
        // 오답이 둘 미만이면 출제하지 않는다 — 나왔다면 선택지가 최소 셋이다
        expect(ids.length).toBeGreaterThanOrEqual(3)
        seen++
      }
    }
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
