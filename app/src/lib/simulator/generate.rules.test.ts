/**
 * 생성기가 만든 것이 **규칙에 맞는가**를 묻는 테스트.
 *
 * `generate.test.ts` 와의 경계는 질문의 종류다:
 * - `generate.test.ts` — "생성기가 명세대로 행동하는가" (결정론, 구조, require 계약,
 *   쇼다운 절차, 팟 무결성). 룰셋을 판정자로 부르지 않는다.
 * - 이 파일 — "생성된 액션이 룰셋 판정을 통과하는가"와 그 판정의 **입력**인
 *   베팅 컨텍스트가 규칙대로 세워지는가. 룰셋(`nlh`)과 라운드 루프
 *   (`runBettingRound`)를 직접 부른다.
 *
 * 줄 수 때문에 자른 것이 아니라 이 경계 때문에 자랐다 — 아래 두 묶음은 둘 다
 * "규칙 판정의 근거가 맞는가"를 묻고, 같은 규칙(Rule 51-B)을 공유한다.
 */
import { describe, it, expect } from 'vitest'
import { generateHand, runBettingRound } from './generate'
import { initialState, applyEvent } from './reduce'
import { createRng } from './rng'
import { nlh } from './rulesets/nlh'
import type { StackPlan } from './bots'
import type { HandEvent, HandState, SeatInit, Street } from './types'
import type { DecisionKind, Hand } from './generate'

/**
 * 생성기가 봇 액션을 만들 때 쓴 것과 같은 규칙으로 베팅 컨텍스트를 다시 세운다.
 * lastRaiseSize 와 "이번 라운드에 액션했는지"는 상태에 남지 않고 라운드 진행에서만
 * 나오는 값이라, 이벤트 열을 걸으며 재구성하는 것 말고는 밖에서 알 방법이 없다.
 *
 * **레이즈 권리는 여기서 계산하지 않는다.** 그건 룰셋의 canReopen 이 제35조 4항으로
 * 판정하고, 이 테스트는 사실(액션했는가)만 넘긴다 — 사본을 두면 테스트가 검증하는
 * 것이 엔진이 아니라 그 사본이 된다.
 */
function assertEveryActionLegal(seed: string, opts: { require?: DecisionKind[] } = {}) {
  const hand = generateHand({ seed, ...opts })
  const bb = hand.blinds.bb
  let state: HandState = initialState(hand.seats, hand.buttonSeat)

  let lastRaiseSize = bb // 프리플랍은 빅블라인드가 오픈 벳 역할을 한다
  // 프리플랍이 마주하는 벳은 빅블라인드이고 그게 곧 이 라운드의 첫 벳이다 (Rule 51-B).
  let isOpenBet = true
  const acted = new Set<number>()
  let checked = 0

  for (const e of hand.events) {
    if (e.type === 'collect_bets') {
      lastRaiseSize = 0
      // 새 스트리트는 마주한 벳 없이 시작한다 — 다음에 깔릴 벳이 그 라운드의 첫 벳이다.
      isOpenBet = true
      acted.clear()
      state = applyEvent(state, e)
      continue
    }
    if (e.type !== 'player_action') {
      state = applyEvent(state, e)
      continue
    }

    const currentBet = Math.max(...state.seats.map((x) => x.bet))
    const seat = state.seats[e.seat]
    const result = nlh.validateAction(
      {
        currentBet,
        lastRaiseSize,
        bigBlind: bb,
        seatBet: seat.bet,
        seatStack: seat.stack,
        isOpenBet,
        hasActedThisRound: acted.has(e.seat),
        pot: 0,
      },
      e.action,
    )
    expect(result.valid, `시드 ${seed} 좌석 ${e.seat} ${JSON.stringify(e.action)}`).toBe(true)
    checked++

    state = applyEvent(state, e)
    acted.add(e.seat)

    const newBet = state.seats[e.seat].bet
    if (newBet > currentBet) {
      // 오픈 벳 자격을 없애는 것은 "벳이 있었다" 위에 얹힌 레이즈뿐이다.
      // (currentBet 은 액션 직전 상태에서 새로 읽은 const 라 여기서도 갱신 전 값이다.)
      if (currentBet > 0) isOpenBet = false
      const raiseSize = newBet - currentBet
      if (raiseSize >= Math.max(lastRaiseSize, bb)) {
        lastRaiseSize = raiseSize
      }
    }
  }

  return checked
}

describe('generateHand — 규칙 준수', () => {
  it('생성된 모든 플레이어 액션이 룰셋 판정을 통과한다', () => {
    let total = 0
    for (let n = 0; n < 200; n++) total += assertEveryActionLegal('legal-' + n)
    for (let n = 0; n < 60; n++) {
      total += assertEveryActionLegal('legal-calc-' + n, { require: ['calculation'] })
      total += assertEveryActionLegal('legal-sd-' + n, { require: ['showdown'] })
    }
    // 액션이 거의 없는 핸드만 뽑혔다면 위 단언들이 아무것도 안 본 것이다.
    expect(total).toBeGreaterThan(1000)
  })
})

/*
 * ── isOpenBet 회귀 ─────────────────────────────────────────────────────────
 *
 * 이 플래그는 봇이 언더콜을 만들지 않는 동안 핸드 출력에 전혀 나타나지 않는다
 * (8,400 핸드 해시가 수정 전후 동일했다). 그래서 생성 핸드를 아무리 훑어도
 * 관측되지 않는다 — `runBettingRound` 가 궤적을 반환값에 실어 보내는 이유다.
 *
 * 순수 헬퍼 `(isOpenBet, betBeforeAction) => boolean` 을 뽑아 단위 테스트하는
 * 경로는 일부러 택하지 않았다. 실제 결함 모드는 **호출 지점의 문장 순서**라,
 * 호출부가 currentBet 갱신 뒤에 헬퍼를 불러도 그런 테스트는 초록으로 남는다.
 * 여기서는 라운드가 실제로 만들어낸 값을 본다.
 */

const BLINDS = { sb: 100, bb: 200 }
const START_STACK = 25000

/** 배역 없는 평범한 라운드. decideAction 은 stacks 를 읽지 않는다. */
const PLAIN_PLAN: StackPlan = { stacks: [], shoveSeats: [], coverSeat: null, showdownSeats: [] }

function makeSeats(seatCount: number): SeatInit[] {
  return Array.from({ length: seatCount }, (_, i) => ({ name: `P${i}`, stack: START_STACK }))
}

/** 블라인드까지 포스팅된 프리플랍 시작 상태 — 라운드는 빅블라인드를 마주한 채 열린다. */
function preflopStart(seatCount: number): HandState {
  let s = initialState(makeSeats(seatCount), 0)
  s = applyEvent(s, { type: 'move_button', toSeat: 0 })
  s = applyEvent(s, { type: 'post_blind', seat: 1, amount: BLINDS.sb, kind: 'sb' })
  s = applyEvent(s, { type: 'post_blind', seat: 2, amount: BLINDS.bb, kind: 'bb' })
  return s
}

/** 벳이 하나도 없는 플랍 시작 상태 — 다음에 깔릴 벳이 그 라운드의 첫 벳이다. */
function flopStart(seatCount: number): HandState {
  return applyEvent(initialState(makeSeats(seatCount), 0), { type: 'move_button', toSeat: 0 })
}

type Faced = { facing: number; open: boolean }

/**
 * 규칙에서 유도한 기대 궤적.
 *
 * Rule 51-B 의 "지금 마주한 벳이 이 라운드의 첫 벳인가"를, 라운드가 지금까지
 * 마주해 본 **서로 다른 벳 높이의 개수**로 읽는다. 높이가 하나뿐이면 그 벳이 곧
 * 오픈 벳이고, 두 번째 높이가 생기는 순간(= 있던 벳 위에 레이즈가 얹힌 순간)
 * 더는 오픈 벳이 아니다. 프리플랍은 라운드가 빅블라인드를 이미 마주한 채
 * 시작하므로 높이 하나를 들고 출발한다.
 *
 * 구현과 형태가 다르다: 구현은 루프 안에서 플래그를 **갱신 순서**로 만들고,
 * 여기서는 상태 흔적에서 읽는다. 그래서 순서 함정이 두 값을 갈라놓는다.
 */
function facedBets(start: HandState, events: HandEvent[]): Faced[] {
  const maxBet = (s: HandState) => Math.max(...s.seats.map((x) => x.bet))
  const heights = new Set<number>()
  let s = start
  if (maxBet(s) > 0) heights.add(maxBet(s))

  const out: Faced[] = []
  for (const e of events) {
    if (e.type !== 'player_action') {
      s = applyEvent(s, e)
      continue
    }
    out.push({ facing: maxBet(s), open: heights.size <= 1 })
    s = applyEvent(s, e)
    if (maxBet(s) > 0) heights.add(maxBet(s))
  }
  return out
}

describe('runBettingRound — 오픈 벳 플래그', () => {
  it('마주한 벳이 그 라운드의 첫 벳일 때만 isOpenBet 이 참이다', () => {
    // 규칙의 세 갈래를 각각 몇 번 밟았는지 — 하나라도 0 이면 단언이 공허하다.
    let preflopFacingBb = 0 // 프리플랍에서 BB(= 오픈 벳)를 마주함 → 참이어야 한다
    let flopFacingFirstBet = 0 // 플랍 첫 벳을 마주함 → 참이어야 한다
    let facingRaise = 0 // 벳 위에 얹힌 레이즈를 마주함 → 거짓이어야 한다

    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 40; n++) {
        for (const street of ['preflop', 'flop'] as const) {
          const start = street === 'preflop' ? preflopStart(seatCount) : flopStart(seatCount)
          const rng = createRng(`openbet-${street}-${seatCount}-${n}`)
          const r = runBettingRound(start, rng, BLINDS.bb, street, PLAIN_PLAN)
          const faced = facedBets(start, r.events)
          const label = `${street} seatCount=${seatCount} n=${n}`

          /*
           * 반증하는 구현 변경:
           *  - `let isOpenBet = true` 를 `false`(또는 `currentBet === 0`)로 되돌리면
           *    프리플랍 첫 항목이 어긋난다.
           *  - `if (currentBet > 0) isOpenBet = false` 를 `currentBet = newBet` **아래**로
           *    내리면 플랍 첫 벳 직후 항목이 어긋난다 (순서 함정).
           *  - 가드를 떼어 무조건 false 로 만들면 두 곳 다 어긋난다.
           */
          expect(r.openBetTrajectory, label).toEqual(faced.map((f) => f.open))

          // 프리플랍 첫 액션은 언제나 빅블라인드를 마주한다 — 그게 이 라운드의 첫 벳이다.
          if (street === 'preflop') {
            expect(faced[0]?.facing, label).toBe(BLINDS.bb)
            expect(r.openBetTrajectory[0], label).toBe(true)
          }

          for (const f of faced) {
            if (f.facing === 0) continue
            if (!f.open) facingRaise++
            else if (street === 'preflop') preflopFacingBb++
            else flopFacingFirstBet++
          }
        }
      }
    }

    expect(preflopFacingBb).toBeGreaterThan(0)
    expect(flopFacingFirstBet).toBeGreaterThan(0)
    expect(facingRaise).toBeGreaterThan(0)
  })

  it('궤적은 그 라운드의 player_action 과 개수가 정확히 같다', () => {
    // 궤적이 이벤트와 어긋나 밀리면 위 테스트의 비교가 엉뚱한 짝을 맞추게 된다.
    // 반증: decideAction 앞의 push 를 루프 밖이나 조건 안으로 옮기면 깨진다.
    let rounds = 0
    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 20; n++) {
        const start = preflopStart(seatCount)
        const rng = createRng(`traj-${seatCount}-${n}`)
        const r = runBettingRound(start, rng, BLINDS.bb, 'preflop', PLAIN_PLAN)
        const actions = r.events.filter((e) => e.type === 'player_action').length
        expect(r.openBetTrajectory, `seatCount=${seatCount} n=${n}`).toHaveLength(actions)
        expect(actions).toBeGreaterThan(0)
        rounds++
      }
    }
    expect(rounds).toBe(140)
  })
})

/*
 * ── 액션 순서 ──────────────────────────────────────────────────────────────
 *
 * "누가 먼저 액션하는가"는 딜러 시험 항목이고, 이벤트 열이 그 절차의 정본이다 —
 * 쇼다운 공개 순서를 좌석 번호가 아니라 마지막 공격자 기준으로 고친 것과 같은
 * 이유다. `decisions.ts` 는 이미 학습자에게 "언더더건 — {이름} (빅블라인드 다음)"
 * 이라고 가르치므로, 시작 좌석이 밀리면 모든 핸드에서 그 라벨이 거짓이 된다.
 *
 * 룰셋은 금액과 리오픈 권리만 판정하고 차례는 보지 않는다. 그래서 이 파일의
 * `assertEveryActionLegal` 도 `integration.test.ts` 의 재구성도 시작 좌석이
 * 틀린 채로 초록으로 남는다 — 순서는 여기서만 잠긴다.
 */

type BettingRound = { street: Street; start: HandState; end: HandState; seats: number[] }

/**
 * 핸드를 `collect_bets` 경계로 잘라 베팅 라운드별 액션 좌석 순서를 뽑는다.
 * `start` 는 그 라운드의 첫 액션 **직전** 상태다 — 아직 아무도 액션하지 않았으므로
 * 폴드·올인 플래그가 라운드 시작 시점과 같다. 액션이 없는 라운드(전원 올인)는
 * 애초에 담기지 않는다.
 */
function bettingRounds(hand: Hand): BettingRound[] {
  let s: HandState = initialState(hand.seats, hand.buttonSeat)
  let street: Street = 'preflop'
  const rounds: BettingRound[] = []
  let cur: BettingRound | null = null

  for (const e of hand.events) {
    if (e.type === 'deal_board') street = e.street
    if (e.type === 'collect_bets') cur = null
    if (e.type === 'player_action') {
      if (!cur) {
        cur = { street, start: s, end: s, seats: [] }
        rounds.push(cur)
      }
      cur.seats.push(e.seat)
    }
    s = applyEvent(s, e)
    if (e.type === 'player_action' && cur) cur.end = s
  }
  return rounds
}

/** `from` 부터 시계방향 첫 번째 액션 가능 좌석 — 폴드도 올인도 아닌 사람. */
function firstActable(s: HandState, from: number): number {
  const n = s.seats.length
  for (let i = 0; i < n; i++) {
    const seat = (from + i) % n
    if (!s.seats[seat].folded && !s.seats[seat].allIn) return seat
  }
  throw new Error('액션 가능한 좌석이 없다')
}

describe('generateHand — 액션 순서', () => {
  it('프리플랍은 UTG(버튼+3), 그 뒤는 버튼 왼쪽 첫 생존자부터 시작한다', () => {
    /*
     * 기대값은 규칙에서 나온다. 프리플랍은 빅블라인드(버튼+2) 다음 좌석이 UTG 이고,
     * 플랍 이후는 버튼 왼쪽 첫 좌석부터 — 이미 폴드했거나 올인한 사람은 건너뛴다.
     *
     * 반증하는 구현 변경:
     *  - `runBettingRound` 의 시작 좌석에서 프리플랍 `+3` 을 `+2`(빅블라인드)나
     *    `+4` 로 바꾸면 프리플랍 단언이 빨개진다.
     *  - 플랍 이후 `+1` 을 `+2` 로 바꾸면 포스트플랍 단언이 빨개진다.
     *  - 프리플랍/포스트플랍 분기를 지워 한쪽 식으로 통일해도 둘 중 하나가 빨개진다.
     */
    let preflopRounds = 0
    let postflopRounds = 0
    let skippedStart = 0 // 버튼+1 이 폴드·올인이라 실제로 건너뛴 라운드

    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 20; n++) {
        for (const require of [undefined, ['calculation'] as DecisionKind[]]) {
          const seed = `order-${seatCount}-${n}-${require ? 'calc' : 'plain'}`
          const hand = generateHand({ seed, seatCount, require })
          const button = hand.buttonSeat

          for (const r of bettingRounds(hand)) {
            const label = `${seed} ${r.street}`
            if (r.street === 'preflop') {
              expect(r.seats[0], label).toBe((button + 3) % seatCount)
              preflopRounds++
            } else {
              const from = (button + 1) % seatCount
              const expected = firstActable(r.start, from)
              expect(r.seats[0], label).toBe(expected)
              if (expected !== from) skippedStart++
              postflopRounds++
            }
          }
        }
      }
    }

    // 표본이 비면 위 단언은 아무것도 보지 않은 것이다.
    expect(preflopRounds).toBe(280)
    expect(postflopRounds).toBeGreaterThan(0)
    // 건너뛰기 분기를 한 번도 안 밟았다면 포스트플랍 단언은 "버튼+1" 만 확인한 셈이다.
    expect(skippedStart).toBeGreaterThan(0)
  })

  it('레이즈 없이 끝난 프리플랍은 빅블라인드가 마지막에 한 번 더 액션한다', () => {
    /*
     * 빅블라인드는 이미 블라인드로 현재 벳을 맞춰 놓았지만 아직 "액션한" 것이
     * 아니다 — 아무도 올리지 않았다면 체크·레이즈를 고를 기회를 한 번 받는다.
     * 여기서는 그 기회가 라운드의 **마지막** 액션이라는 것까지 본다.
     *
     * 반증하는 구현 변경: 라운드 종료 조건에서 `acted.has(i) &&` 를 떼면 전원
     * 림프한 순간 라운드가 닫혀 빅블라인드가 액션하지 못하고 빨개진다.
     * 시작 좌석을 빅블라인드로 당겨도(위 테스트가 잡는 변경) 여기서 같이 빨개진다.
     */
    let limped = 0

    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 40; n++) {
        const seed = `bbopt-${seatCount}-${n}`
        const hand = generateHand({ seed, seatCount })
        const bbSeat = (hand.buttonSeat + 2) % seatCount
        const pre = bettingRounds(hand).find((r) => r.street === 'preflop')
        if (!pre) continue

        // 누군가 빅블라인드 위로 올렸으면 옵션 상황이 아니다.
        const finalBet = Math.max(...pre.end.seats.map((x) => x.bet))
        if (finalBet !== hand.blinds.bb) continue
        // 전원 폴드로 라운드가 닫혔거나 빅블라인드가 블라인드로 이미 올인이면 기회 자체가 없다.
        if (pre.end.seats.filter((x) => !x.folded).length < 2) continue
        if (pre.start.seats[bbSeat].allIn) continue

        expect(pre.seats[pre.seats.length - 1], seed).toBe(bbSeat)
        expect(pre.seats.filter((x) => x === bbSeat), seed).toHaveLength(1)
        limped++
      }
    }

    expect(limped).toBeGreaterThan(0)
  })
})
