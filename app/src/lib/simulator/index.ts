/**
 * 시뮬레이터 엔진의 공개 진입점.
 *
 * 바깥(2단계 테이블뷰·3단계 기록)에서는 이 파일 하나만 import 한다. 개별 모듈을
 * 직접 찌르면 내부 파일 이름이 곧 공개 API 가 되어, 파일을 쪼개는 순간 호출부가
 * 깨진다. 여기 없는 것은 엔진 내부 사정이라는 뜻이다 — 봇 정책(`bots.ts`)이
 * 그래서 빠져 있다.
 *
 * 엔진은 순수 TS 다. react·next·@supabase 를 import 하지 않으므로 서버·클라이언트·
 * 테스트 어디서든 같은 결과를 낸다.
 */
export { createRng, type Rng } from './rng'
export {
  makeDeck, shuffle, cardToString, parseCard, RANK_VALUE, RANKS, SUITS,
  type Card, type Rank, type Suit,
} from './cards'
export {
  evaluateHand, compareHands, CATEGORY_LABEL,
  type HandRank, type HandCategory,
} from './evaluate'
export { initialState, applyEvent, stateAt } from './reduce'
export type {
  HandEvent, HandState, SeatState, SeatInit, PlayerAction, Street,
} from './types'
export { buildPots, awardPots, ODD_CHIP_UNIT, type Pot, type PotAward } from './pots'
export { nlh } from './rulesets/nlh'
export type {
  Ruleset, RulesetId, BettingContext, ValidationResult, DeclaredIntent,
} from './rulesets/types'
export {
  generateHand, PLAYER_NAMES, MIN_SEATS, MAX_SEATS,
  type Hand, type GenerateOptions, type Difficulty, type DecisionKind,
} from './generate'
export {
  extractDecisions, TIME_LIMITS,
  type DecisionPoint, type DecisionInput,
} from './decisions'
export {
  scoreDecision, scoreHand, gradeFrom,
  type Answer, type DecisionResult, type HandScore,
} from './score'
