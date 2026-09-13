/**
 * 진행절차 드릴의 타입.
 *
 * 이 드릴은 **문제가 주어지지 않는다.** 딜러가 할 수 있는 행동 전부가 팔레트에 늘 떠
 * 있고, 그중 무엇을 먼저 할지를 스스로 고른다. 그것이 4지선다와 갈리는 지점이다.
 */
import type { Card, DealtCard, TableView } from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'

/** 팔레트에서 고를 수 있는 행동. **늘 일곱이다** — 종목에 따라 줄어들지 않는다. */
export type PaletteAct = 'ante' | 'blinds' | 'burn' | 'deal' | 'draw' | 'betting' | 'payout'

/**
 * `'open'`(첫 순서 지목)은 팔레트에 없다. 딜러가 "이제 라운드를 열겠다"고 선언하는
 * 것이 아니라, 카드가 다 나가면 그 순간이 저절로 온다.
 *
 * `'award'`(팟 받을 좌석 지목)도 같다 — 팟 지급을 고르면 손이 열리고, 그다음 누구에게
 * 줄지를 고른다. 이것이 없으면 팟 지급이 「버튼 한 번」으로 끝나 딜러가 실제로 가리는
 * 일을 건너뛴다 (사용자 지적 2026-09-13).
 */
export type StepAct = PaletteAct | 'open' | 'award'

/** `streetIndex: -1` 은 스트릿에 속하지 않는다(블라인드·앤티·팟 지급·승자 지목). */
export type Step = { act: StepAct; streetIndex: number }

/**
 * 이 종목이 무엇으로 판을 여는가. **`kind` 로만 갈린다** — 종목 id 를 읽지 않는다.
 *
 * 플랍게임은 블라인드 둘로 열고, 스터드는 전원 앤티 + 최고 업카드 한 좌석의 브링인으로
 * 연다. 둘을 한 객체에 합치면 「앤티가 0 인 블라인드 종목」 같은 없는 상태가 타입에
 * 생긴다 — 유니온이면 컴파일러가 그 상태를 만들지 못하게 막는다.
 *
 * 픽스리밋의 스몰벳·빅벳이 여기 붙는 이유: 스터드에서 브링인은 스몰벳의 일부이고,
 * 셋이 한 자리에 있어야 「브링인 500 → 스몰벳 1,000 → 5번가부터 2,000」이 한 눈에 읽힌다.
 */
export type ForcedBets =
  | { kind: 'blinds'; sb: number; bb: number }
  | { kind: 'ante+bringin'; ante: number; bringIn: number; smallBet: number; bigBet: number }

/**
 * 이 라운드에 좌석이 한 행동. `to` 는 이 라운드에 낸 **누적** 금액이다.
 *
 * 뒤의 둘은 **픽스리밋 스터드에만 있는 행동**이고, 화면 로그가 그 낱말을 그대로 띄운다.
 * 이 드릴이 가르치는 것이 「스터드는 블라인드가 아니라 앤티와 브링인으로 연다」라서
 * 둘을 `'bet'`·`'raise'` 로 뭉개면 화면에 브링인이라는 낱말이 한 번도 안 뜨고,
 * 「벳 500 다음에 또 벳 1,000」이라는 없는 그림이 남는다 (설계 §10 재미 게이트 진행절차-3).
 *
 * - `'bringin'` — 최고 업카드 좌석이 **강제로** 세우는 벳. 스몰벳보다 작다
 * - `'complete'` — 그 벳을 스몰벳까지 채우는 것. 아직 서지 않은 벳을 채우는 것이라
 *   픽스리밋은 이것을 레이즈로 세지 않는다
 */
export type BettingAction = {
  seat: number
  act: 'check' | 'call' | 'bet' | 'raise' | 'fold' | 'bringin' | 'complete'
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
  /** 이 판을 연 강제 베팅. 금액의 정본은 여기 하나다 — 리듀서가 상수를 다시 읽지 않는다 */
  forced: ForcedBets
  /**
   * 좌석에 놓인 카드 — **앞뒤와 함께.** 스터드는 엎은 것과 열린 것이 섞인다.
   *
   * **`hole` 의 길이는 좌석마다 다르다.** 폴드한 손은 걷히고 다음 장이 가지 않으므로,
   * 폴드한 좌석의 배열은 폴드한 스트릿까지만 있다 — 예를 들어 라즈에서 3번가에 폴드한
   * 좌석은 세 장, 끝까지 남은 좌석은 일곱 장이다. 「좌석마다 같다」고 가정하고 한
   * 숫자로 자르는 코드는 없는 카드를 요구하게 된다.
   */
  seats: { name: string; hole: DealtCard[]; stack: number }[]
  /** 스트릿 id → 그 스트릿에 보드로 나갈 카드 */
  board: Record<string, Card[]>
  /** 스트릿 id → 그 라운드의 액션. 재생만 한다 */
  betting: Record<string, BettingAction[]>
}

export type Phase = 'palette' | 'openSeat' | 'awardSeat' | 'anim' | 'done'

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
  /** 팟을 받을 좌석. 동률이면 여럿, 「로우 없음」이면 `lo` 가 빈 배열이다 */
  | { type: 'award'; hi: number[]; lo: number[] }
  | { type: 'animEnd' }
