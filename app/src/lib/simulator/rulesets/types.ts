/**
 * 룰셋 인터페이스.
 *
 * 비유: 같은 카드 게임이라도 종목마다 "규칙책"이 다르다. 엔진은 규칙책을 통째로
 * 갈아 끼울 수 있게 만들어 두고, 액션이 합법인지·최소 레이즈가 얼마인지 같은
 * 판정을 전부 그 책에 묻는다. V1 의 규칙책은 노리밋 홀덤(`nlh`) 하나뿐이지만,
 * 스터드·드로우·팟리밋을 나중에 데이터로 붙이기 위해 인터페이스 뒤에 둔다.
 *
 * 여기가 판정하는 것이 곧 사용자에게 가르치는 규칙이다. 틀리면 딜러 훈련생이
 * 틀린 규칙을 정답으로 배운다.
 */
import type { PlayerAction } from '../types'

export type RulesetId = 'nlh' | 'pl'

/** 액션 판정에 필요한 최소 정보만 뽑아 넘긴다 — 룰셋이 HandState 전체에 묶이지 않게. */
export type BettingContext = {
  /** 이번 라운드의 현재 최고 벳 (총액 기준) */
  currentBet: number
  /**
   * 이번 라운드에 나온 가장 큰 레이즈의 "폭". 최소 레이즈 계산의 근거 (Rule 43-A).
   * 라운드 시작 시 프리플랍은 bigBlind, 그 외는 0 이다.
   * 풀 레이즈에 못 미치는 올인은 이 값을 갱신하지 않는다.
   */
  lastRaiseSize: number
  /**
   * 빅블라인드. 최소 벳·최소 레이즈 폭의 하한이다.
   * 이 값이 없으면 룰셋이 하한을 강제할 수 없어 호출자가 lastRaiseSize 에
   * bb 를 몰래 넣어주는 관례에 의존하게 된다.
   */
  bigBlind: number
  /** 이 좌석이 이번 라운드에 이미 낸 금액 */
  seatBet: number
  seatStack: number
  /** 이번 라운드의 첫 벳인지 — 언더콜 처리가 달라진다 (Rule 51-B) */
  isOpenBet: boolean
  /**
   * 이 좌석이 **이번 베팅 라운드에 이미 액션했는지**. 리오픈 판정의 입력이다.
   *
   * 여기에 "레이즈할 수 있는가"라는 **결론**을 넣지 않는다는 점이 중요하다.
   * 예전에는 `canRaise: boolean` 으로 호출자가 결론을 계산해 넣었고, 그 바람에
   * 리오픈 규칙이 `generate.ts` 와 `bots.ts` 에 각각 살고 룰셋에는 없었다 —
   * 그리고 그 사본이 규정과 어긋나 있었다(제35조 4항은 누적인데 단발로 구현됐다).
   * 결론은 룰셋의 `canReopen` 이 낸다.
   */
  hasActedThisRound: boolean
  /**
   * 지금 테이블 위의 돈 전부 — 가운데로 수거된 팟 + **모든 좌석 앞에 놓인 칩**.
   * 자기 자신이 이번 라운드에 낸 것도 포함한다.
   *
   * 팟리밋 산식이 「콜한 뒤의 팟」을 쓰므로 앞에 놓인 칩을 빼면 답이 틀린다.
   * 노리밋은 이 값을 읽지 않는다 — 최대가 늘 스택이기 때문이다.
   */
  pot: number
}

export type ValidationResult =
  | { valid: true; normalized: PlayerAction }
  | {
      valid: false
      /**
       * forced         — 규정이 처리를 확정한다. corrected 가 곧 결과다.
       * td_discretion  — 플로어 판단 영역이다. corrected 는 기본값일 뿐 정답이 아니다.
       */
      ruling: 'forced' | 'td_discretion'
      reason: string
      corrected: PlayerAction
    }

export type DeclaredIntent = 'none' | 'raise' | 'allin'

export interface Ruleset {
  id: RulesetId
  // family · bettingStructure · holeCardCount · streets 는 GameSpec 으로 옮겼다.
  // 게임 데이터의 정본은 lib/games/ 하나여야 한다 — 둘이면 반드시 갈라진다 (ADR-003).

  minRaiseTo(ctx: BettingContext): number
  maxRaiseTo(ctx: BettingContext): number

  /**
   * 이 좌석이 레이즈로 베팅을 다시 열 수 있는지 (제35조 4항).
   * **판정은 룰셋의 몫이다** — 호출자가 계산해 넘기면 사본이 생기고, 사본은 갈라진다.
   */
  canReopen(ctx: BettingContext): boolean

  validateAction(ctx: BettingContext, action: PlayerAction): ValidationResult

  /**
   * 말없이 칩을 밀었을 때의 해석 (Rule 45-A).
   * chips 를 주면 "칩 하나를 빼도 콜 금액을 넘는가"로 판정하고,
   * 없으면 밀어낸 총액만으로 판정한다.
   */
  interpretChipPush(
    ctx: BettingContext,
    pushedTotal: number,
    declared: DeclaredIntent,
    chips?: number[],
  ): PlayerAction
}
