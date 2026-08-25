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
import type { PlayerAction, Street } from '../types'

export type RulesetId = 'nlh'

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
   * 이 좌석에게 레이즈 권리가 있는지.
   * 이미 액션한 좌석 앞에 "풀 레이즈에 못 미치는 올인"만 있었다면
   * 콜·폴드만 가능하고 레이즈로 베팅을 다시 열 수 없다.
   *
   * ⚠️ 이 리오픈 규칙에는 조항 번호 근거가 아직 없다 — 계획서·파일럿 문서
   * 어디에도 인용이 없다. TDA 2024 PDF 원문으로 조항을 확인할 것.
   * (규칙 내용 자체는 통용되는 노리밋 관행이나, 번호를 지어내지 않는다.)
   */
  canRaise: boolean
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
  family: 'flop' | 'stud' | 'draw'
  bettingStructure: 'no-limit' | 'pot-limit' | 'fixed-limit'
  holeCardCount: number
  streets: Street[]

  minRaiseTo(ctx: BettingContext): number
  maxRaiseTo(ctx: BettingContext): number
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
