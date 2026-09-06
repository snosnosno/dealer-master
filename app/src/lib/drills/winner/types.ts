/**
 * 승자 판독 드릴의 문제 타입.
 *
 * **쇼다운에서 딜러가 하는 일은 하나다** — 이 판의 임자를 가리는 것. 하이 게임에서는
 * 한 사람이고, 스플릿 게임에서는 둘이며, 로우가 성립하지 않으면 다시 한 사람이다.
 * 그래서 드릴도 하나다 (설계 §1).
 *
 * **정답은 이 타입 안에 값으로 들어 있지만, 그 값을 만든 것은 전부 엔진이다**
 * (`bestOmahaHi` · `bestOmahaLow`). 드릴 코드에 포커 규칙은 없다.
 */
import type { Card } from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'

/**
 * 유형이 하나뿐이다. 그런데도 이 타입이 있는 것은 `RushLike`(`lib/rush/session.ts:27`)가
 * `kind` 를 요구하기 때문이다. **이 값으로 문제를 갈라 판정하지 마라** — 값이 하나다.
 */
export type WinnerKind = 'winner'

export const WINNER_KIND_LABEL: Record<WinnerKind, string> = { winner: '승자 판독' }

export const WINNER_QUESTION_COUNT = 10

/**
 * 제한시간(초). **초안이다** — 기존 로우 승자가 30초였고 하이 판단이 얹혔다.
 * PRD §11 의 열린 질문이고 재미 게이트에서 확정한다 (설계 §9).
 */
export const WINNER_LIMIT_SEC = 40

/** 한 판 10문제 중 로우가 성립하는 판의 하한. 매번 없으면 「로우 없음」이 정답 고정이 된다 */
export const LO_PRESENT_MIN = 3
/** 로우가 성립하지 않는 판의 하한. 매번 있으면 아무도 「로우 없음」을 안 누른다 */
export const LO_ABSENT_MIN = 2

/** 이 드릴의 출제 좌석 수. `GameSpec` 에 없다 — 격자가 아니라 이 드릴의 설정이다 */
export const WINNER_SEAT_COUNT = 4

export type WinnerSeat = { name: string; hole: Card[] }

/** 이 종목이 무엇을 묻는가. **`spec.eval` 이 정한다** — 화면이 정하지 않는다 */
export type WinnerAsks = { hi: boolean; lo: boolean }

export type WinnerQuestion = {
  kind: WinnerKind
  limitSec: number
  /** 화면 상단 유형 이름 */
  label: string
  prompt: string
  seats: WinnerSeat[]
  board: Card[]
  buttonSeat: number
  asks: WinnerAsks
  /** 하이 승자 좌석. **동점이면 여럿이다.** `asks.hi` 가 false 면 빈 배열 */
  answerHi: number[]
  /** 로우 승자 좌석. **로우가 성립하지 않으면 빈 배열** — 화면의 「로우 없음」이 이것이다 */
  answerLo: number[]
  /** 채점 후 보여주는 근거 한 줄 */
  why: string
}

/**
 * 격자의 `eval` 조건이 드릴 유무에서 문제 모양으로 내려온 자리다 (설계 §2).
 *
 * 전에는 `drillsFor` 가 `eval.lo === null` 인 종목에서 로우 판독 칸을 지웠다.
 * 지금은 칸이 늘 있고 **묻는 것이 갈린다.**
 */
export function asksFor(spec: GameSpec): WinnerAsks {
  return { hi: spec.eval.hi !== null, lo: spec.eval.lo !== null }
}
