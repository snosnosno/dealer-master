/**
 * `GameSpec` — **게임이 무엇인가**의 정본. 데이터다.
 *
 * 비유: 보드게임 상자 안의 규칙서다. "카드를 몇 장 받고 언제 뒤집고 누가 먼저
 * 말하는가"가 여기 적혀 있다. 그 규칙을 **적용해 판정하는 것**은 `Ruleset` 의 일이고,
 * 규칙서에서 **문제를 뽑아내는 것**은 드릴의 일이다 (ADR-003).
 *
 * 격자(PRD §6)가 성립하는 이유가 이 타입이다. 종목이 여덟이고 드릴이 일곱이면
 * 칸이 쉰이 넘는다. 칸마다 트레이너를 따로 만들면 N 배 작업이 되므로,
 * **게임을 데이터로 적고 드릴은 그 데이터에서 생성한다.**
 */

export type GameId = 'nlh' | 'plo8'

/**
 * 이 스트릿의 첫 액션은 누구인가.
 *
 * **여섯을 다 적되 앞의 둘만 구현한다.** 나머지 넷은 스터드·라즈가 붙을 때
 * `firstToActSeat` 에서 채운다 — 지금 짐작으로 구현하면 검증되지 않은 채 굳는다
 * (PRD §6-3 함정 1).
 */
export type FirstToAct =
  | 'left-of-bb'
  | 'left-of-button'
  | 'lowest-upcard'
  | 'highest-upcard'
  | 'highest-upcard-by-suit'
  | 'lowest-hand'

export type Street = {
  id: string
  /** 화면 전용 */
  labels: { ko: string; short: string }
  /** 카드를 새로 내리는 스트릿인가, 바꾸는 스트릿인가 */
  kind: 'deal' | 'draw'
  /**
   * 이 스트릿에 카드가 **어디로 몇 장** 가는가.
   *
   * 셋으로 나눈 이유: 스터드 3번가는 한 스트릿이 다운 2장과 업 1장을 동시에 내리고
   * (ADR-003 이 `deal: number` + `faceUp: boolean` 으로 표현하지 못해 겪은 자리),
   * 플랍게임은 좌석이 아니라 보드에 낸다. 셋이면 세 패밀리가 다 들어간다.
   */
  deal: { down: number; up: number; board: number }
  burn: boolean
  betting: boolean
  firstToAct: FirstToAct
  /** 픽스리밋 5번가 이후 2배. 노리밋·팟리밋은 1 */
  sizeMultiplier: 1 | 2
}

export type EvalSpec = {
  hi: 'standard' | null
  /** `null` 이면 이 종목에 로우가 없다 — 격자에서 로우 판독 칸이 사라진다 */
  lo: { kind: 'a5' | '27' | 'badugi'; qualifier: 8 | null } | null
  /** 오마하 강제 조합. `null` 이면 아무 다섯 장 */
  mustUse: { hole: 2; board: 3 } | null
}

export type GameSpec = {
  id: GameId
  family: 'flop' | 'stud' | 'draw'
  /** **판정은 이 코드값으로만 갈린다.** 표시 라벨(`labels.bettingKo`)을 쓰지 마라 */
  betting: 'NL' | 'PL' | 'FL'
  /**
   * 픽스리밋의 1벳 4레이즈 = 5. 노리밋·팟리밋은 `null`.
   *
   * **이번 단계에서 이 값을 읽는 코드를 쓰지 않는다.** `betting: 'FL'` 과 짝이라
   * 타입에는 함께 있어야 의미가 서지만, 픽스리밋 종목이 붙을 때 읽는다.
   */
  raiseCap: number | null
  holeCardCount: number
  forced: 'blinds' | 'ante+bringin'
  /**
   * 표시 전용. **판정 코드는 이 안을 읽지 않는다.**
   * 라벨을 하위 객체에 가두면 `spec.bettingKo` 가 타입 에러가 된다 —
   * 규율을 문서가 아니라 컴파일러가 지킨다.
   */
  labels: { ko: string; en: string; gameKo: string; familyKo: string; bettingKo: string }
  streets: Street[]
  eval: EvalSpec
}
