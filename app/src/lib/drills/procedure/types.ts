/**
 * 진행절차 드릴의 타입.
 *
 * 이 드릴은 **문제가 주어지지 않는다.** 딜러가 할 수 있는 행동 전부가 팔레트에 늘 떠
 * 있고, 그중 무엇을 먼저 할지를 스스로 고른다. 그것이 4지선다와 갈리는 지점이다.
 */
import type { Card, TableView } from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'

/** 팔레트에서 고를 수 있는 행동. **늘 일곱이다** — 종목에 따라 줄어들지 않는다. */
export type PaletteAct = 'ante' | 'blinds' | 'burn' | 'deal' | 'draw' | 'betting' | 'payout'

/**
 * `'open'`(첫 순서 지목)은 팔레트에 없다. 딜러가 "이제 라운드를 열겠다"고 선언하는
 * 것이 아니라, 카드가 다 나가면 그 순간이 저절로 온다.
 */
export type StepAct = PaletteAct | 'open'

/** `streetIndex: -1` 은 스트릿에 속하지 않는다(블라인드·앤티·팟 지급). */
export type Step = { act: StepAct; streetIndex: number }

/** 이 라운드에 좌석이 한 행동. `to` 는 이 라운드에 낸 **누적** 금액이다. */
export type BettingAction = {
  seat: number
  act: 'check' | 'call' | 'bet' | 'raise' | 'fold'
  to: number
}

/**
 * 딜 전에 통째로 만들어진 핸드. **절대 바뀌지 않는다.**
 *
 * 프로토타입의 `fixTies` 는 카드가 착지한 **뒤에** 업카드를 바꿔서, 화면에 뜬 카드가
 * 다른 카드로 바뀌었다. 먼저 만들면 그 결함이 원천 봉쇄된다.
 */
export type HandScript = {
  buttonSeat: number
  blinds: { sb: number; bb: number }
  seats: { name: string; hole: Card[]; stack: number }[]
  /** 스트릿 id → 그 스트릿에 보드로 나갈 카드 */
  board: Record<string, Card[]>
  /** 스트릿 id → 그 라운드의 액션. 재생만 한다 */
  betting: Record<string, BettingAction[]>
}

export type Phase = 'palette' | 'openSeat' | 'anim' | 'done'

export type ProcedureState = {
  spec: GameSpec
  script: HandScript
  steps: Step[]
  /** 지금 몇 번째 스텝인가. `steps.length` 면 끝났다 */
  at: number
  phase: Phase
  /** 순서를 어긴 횟수 */
  stuck: number
  /** 어겼을 때 무엇이 먼저인지 한 줄. 맞히면 `null` 로 지운다 */
  hint: string | null
  table: TableView
  /** 지금까지 내린 번카드 수. `PokerTable` 이 따로 받는다 */
  burnCount: number
  /** 화면 로그. 팟 산술 검사가 이것을 읽는다 */
  log: string[]
}

export type ProcedureAction =
  | { type: 'palette'; act: PaletteAct }
  | { type: 'seat'; seat: number }
  | { type: 'animEnd' }
