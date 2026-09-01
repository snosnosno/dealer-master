/**
 * 액션 연쇄를 **리듀서에 실제로 통과시킨다.** 이 축의 핵심 기법이다 (설계 §6).
 *
 * 문제는 이거였다: `minRaiseTo` 와 `canReopen` 은 `BettingContext` 를 받는데, 그
 * `currentBet` · `lastRaiseSize` 를 생성기가 손으로 계산하면 "짧은 올인이 폭을
 * 갱신하는가" 같은 규칙이 생성기에도 생긴다. 그러면 러시가 엔진을 검증하는 게 아니라
 * 자기 사본을 검증한다.
 *
 * 그래서 좌석을 세우고 이벤트를 순서대로 적용한 뒤 **결과 상태에서** 컨텍스트를 뽑는다.
 * 생성기는 **얼마를 베팅할지만 고르고**, 그 액션이 규칙적으로 무엇을 의미하는지는
 * 엔진이 정한다. 시험 회귀 테스트(`nlh.exam.test.ts`)가 쓰는 방식과 같다.
 */
import {
  applyEvent,
  initialState,
  isFullRaise,
  nlh,
  type BettingContext,
  type HandState,
  type SeatInit,
} from '@/lib/simulator'
import type { LogRow } from './types'

/**
 * 프리플랍 좌석 이름. **배열 순서가 곧 액션 순서다** (BB 다음이 UTG).
 * 좌석 0·1 은 SB·BB 이므로 이 이름들은 좌석 2번부터 붙는다.
 */
export const PREFLOP_SEATS = ['UTG', 'UTG+1', 'MP', 'MP+1', 'MP+2', 'CO', 'BTN'] as const

/** 액션하지 않는 좌석의 스택. 큰 값이면 충분하다 — 여기서 스택은 문제의 변수가 아니다. */
const DEEP = 1_000_000_000

export type Wager = {
  /** 총액(to). 폭이 아니라 총액이다 */
  to: number
  /** 이 좌석의 스택이 정확히 `to` 라서 올인이 되는가 */
  allIn?: boolean
}

export type PreflopChain = {
  state: HandState
  bb: number
  /** 지금 마주한 최고 벳 */
  currentBet: number
  /** 화면에 그대로 보여줄 액션 로그 */
  rows: LogRow[]
  /** 좌석 번호 → 이름 (0=SB, 1=BB, 2~=UTG…) */
  names: string[]
  /** 이번 라운드에 액션한 좌석들 */
  acted: Set<number>
  /** 풀 레이즈에 못 미친 올인의 수 — **엔진의 `isFullRaise` 가 센 값이다** */
  shortAllIns: number
  /** 베팅을 다시 연 풀 레이즈의 수 */
  fullRaises: number
  /**
   * 그 좌석에게 액션이 돌아왔을 때의 컨텍스트.
   * `hasActedThisRound` 는 `acted` 집합에서 나온다 — 결론이 아니라 사실이다.
   */
  ctxFor(seat: number): BettingContext
}

export function seatName(seat: number): string {
  if (seat === 0) return 'SB'
  if (seat === 1) return 'BB'
  return PREFLOP_SEATS[seat - 2] ?? `좌석${seat}`
}

/**
 * 프리플랍 레이즈 연쇄를 재생한다. 좌석 0·1 이 블라인드를 내고, `wagers` 가 좌석 2번부터
 * 순서대로 액션한다.
 *
 * **한 액션이라도 엔진이 무효라고 하면 `null` 을 돌려준다.** 생성기가 불법 상황을
 * 출제하면 훈련생이 존재할 수 없는 판정을 배운다 — 조용히 넘어가지 않는다.
 */
export function replayPreflop(bb: number, wagers: readonly Wager[]): PreflopChain | null {
  const names = ['SB', 'BB', ...wagers.map((_, i) => seatName(i + 2))]
  const seats: SeatInit[] = [
    { name: 'SB', stack: DEEP },
    { name: 'BB', stack: DEEP },
    ...wagers.map((w, i) => ({ name: names[i + 2], stack: w.allIn === true ? w.to : DEEP })),
  ]

  let s: HandState = initialState(seats, 0)
  s = applyEvent(s, { type: 'post_blind', seat: 0, amount: Math.floor(bb / 2), kind: 'sb' })
  s = applyEvent(s, { type: 'post_blind', seat: 1, amount: bb, kind: 'bb' })

  const rows: LogRow[] = []
  const acted = new Set<number>()
  let shortAllIns = 0
  let fullRaises = 0

  for (let i = 0; i < wagers.length; i++) {
    const w = wagers[i]
    const seat = i + 2
    const st = s.seats[seat]
    const currentBet = Math.max(...s.seats.map((x) => x.bet))

    const action = w.allIn === true ? ({ kind: 'allin', to: w.to } as const) : ({ kind: 'raise', to: w.to } as const)

    /*
     * 만들기 전에 엔진에게 묻는다. 최소 레이즈 미달·스택 초과 같은 것을 생성기가
     * 스스로 판단하면 판단 기준이 두 곳에 생기고, 어느 한쪽이 느슨해진다.
     */
    const verdict = nlh.validateAction(
      {
        currentBet,
        lastRaiseSize: s.lastRaiseSize,
        bigBlind: s.bigBlind,
        seatBet: st.bet,
        seatStack: st.stack,
        isOpenBet: false,
        hasActedThisRound: acted.has(seat),
      },
      action,
    )
    if (!verdict.valid) return null

    // 풀 레이즈 여부는 액션을 적용하기 **전** 상태를 기준으로 판정한다.
    const before = s
    s = applyEvent(s, { type: 'player_action', seat, action })
    acted.add(seat)

    const newBet = s.seats[seat].bet
    if (isFullRaise(before, newBet)) fullRaises++
    else if (w.allIn === true) shortAllIns++

    rows.push({
      who: names[seat],
      act: w.allIn === true ? 'ALL IN' : 'RAISE',
      amount: newBet,
      allIn: w.allIn,
    })
  }

  const currentBet = Math.max(...s.seats.map((x) => x.bet))

  return {
    state: s,
    bb,
    currentBet,
    rows,
    names,
    acted,
    shortAllIns,
    fullRaises,
    ctxFor(seat: number): BettingContext {
      const st = s.seats[seat]
      return {
        currentBet,
        lastRaiseSize: s.lastRaiseSize,
        bigBlind: s.bigBlind,
        seatBet: st?.bet ?? 0,
        // 좌석이 없으면(아직 앉지 않은 다음 사람) 스택 제약 없이 "규정이 정하는 금액"을 묻는다
        seatStack: st?.stack ?? Number.MAX_SAFE_INTEGER,
        isOpenBet: false,
        hasActedThisRound: acted.has(seat),
      }
    },
  }
}

/**
 * 플랍 상황의 컨텍스트. 오버사이즈·다중 칩 유형이 쓴다.
 *
 * **프리플랍이 아니라 플랍인 이유**: 프리플랍은 빅블라인드가 이미 깔려 있어 "BET" 이
 * 성립하지 않고, 칩 액면에서 콜 금액을 거꾸로 만들다 보면 빅블라인드보다 작은 불법
 * 오픈 벳이 나온다 (제35조 1항, 설계 §6.1).
 *
 * 여기에는 재생할 연쇄가 없다 — 액션이 "UTG 가 벳했다" 하나뿐이라 상태 기계를 돌릴
 * 것이 없고, 오픈 벳의 폭은 곧 벳 금액 자체다.
 */
export function flopContext(opts: {
  bb: number
  /** UTG 의 오픈 벳 금액 */
  openBet: number
  /** 판정 대상 좌석의 스택 */
  seatStack: number
}): BettingContext {
  return {
    currentBet: opts.openBet,
    // 플랍의 오픈 벳이므로 이번 라운드의 레이즈 폭은 그 벳 금액 자체다
    lastRaiseSize: opts.openBet,
    bigBlind: opts.bb,
    seatBet: 0,
    seatStack: opts.seatStack,
    isOpenBet: true,
    hasActedThisRound: false,
  }
}
