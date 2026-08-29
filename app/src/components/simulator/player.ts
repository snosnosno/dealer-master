/**
 * 재생 상태기계.
 *
 * React 를 import 하지 않는 순수 TS 다. 화면 상태를 들고 있지 않고 커서(적용된
 * 이벤트 개수) 하나만 들고 있으므로, 재생·되감기·속도 조절이 전부 커서 이동이다.
 * 그릴 때는 호출부가 `stateAt(init, events, cursor)` 로 접는다.
 *
 * `Date.now()` 를 부르지 않는다 — 시간이 `tick` 액션으로 들어온다. 그래서 이 파일이
 * 순수하게 남고 테스트가 시계 조작 없이 돈다. 실제 시계는 HandPlayer.tsx 의
 * requestAnimationFrame 하나뿐이다.
 */
import { scoreDecision } from '@/lib/simulator'
import type { Answer, DecisionPoint, DecisionResult, HandEvent } from '@/lib/simulator'

export type Phase = 'playing' | 'awaiting' | 'feedback' | 'review'

/** 0 은 "즉시" 다 — 정지점까지 한 번에 점프한다. */
export type Speed = 0.5 | 1 | 2 | 0

export type PlayerConfig = {
  events: HandEvent[]
  /**
   * 첫 `award_pot` 의 인덱스. 재생은 이 지점을 넘지 않는다.
   *
   * 이유: `calculation` 문항의 앵커가 마지막 `collect_bets + 1` = 첫 `award_pot` 자리이고
   * `showdown` 문항의 앵커는 `events.length`(배열 끝 너머)다. 순서대로 재생하면
   * award_pot 애니메이션이 승자를 보여준 뒤에 "누가 이겼나"를 묻게 된다 — 답을
   * 보여주고 문제를 내는 것이다. 엔진의 앵커는 정의상 옳으므로 여기서 막는다.
   */
  sealIndex: number
}

export type PlayerState = {
  /** 적용된 이벤트 개수. 화면 = stateAt(init, events, cursor) */
  cursor: number
  phase: Phase
  speed: Speed
  /** 아직 묻지 않은 문항. atEventIndex 오름차순. 답한 문항은 `continue` 에서 빠진다 */
  pending: DecisionPoint[]
  answers: Answer[]
  results: DecisionResult[]
  /** awaiting 일 때 남은 제한시간(ms) */
  remainingMs: number
  /** playing 일 때 현재 이벤트(events[cursor])에 누적된 시간(ms) */
  elapsedMs: number
}

export type PlayerCommand =
  | { type: 'tick'; ms: number }
  | { type: 'answer'; answer: Answer }
  | { type: 'continue' }
  | { type: 'setSpeed'; speed: Speed }

/**
 * 이벤트 종류별 1x 기준 지속시간(ms).
 *
 * 종류별 차등이 필수다 — 홀카드 12장을 700ms씩 돌리면 프리플랍 딜링만 8.4초다.
 * 이 값은 재생 "박자"이고, CSS 전이 길이(--tempo)와는 별개다.
 */
export const EVENT_MS: Record<HandEvent['type'], number> = {
  deal_hole: 120,
  burn: 250,
  post_blind: 350,
  move_button: 400,
  showdown_reveal: 400,
  deal_board: 500,
  collect_bets: 600,
  return_uncalled: 600,
  player_action: 700,
  award_pot: 800,
}

/**
 * 재생이 이번에 도달할 수 있는 최대 커서.
 *
 * 미답 문항이 있으면 그 앵커와 봉인 경계 중 앞선 쪽에서 멈춘다. 없으면 끝까지 간다.
 */
export function stopAt(config: PlayerConfig, state: PlayerState): number {
  if (state.pending.length === 0) return config.events.length
  return Math.min(state.pending[0].atEventIndex, config.sealIndex)
}

/**
 * playing 상태가 정지점에 도달했는지 보고 다음 phase 를 정한다.
 * 미답 문항이 있으면 awaiting(카운트다운 시작), 없으면 review.
 */
function settle(config: PlayerConfig, state: PlayerState): PlayerState {
  if (state.phase !== 'playing') return state
  if (state.cursor < stopAt(config, state)) return state
  if (state.pending.length > 0) {
    return {
      ...state,
      phase: 'awaiting',
      remainingMs: state.pending[0].timeLimitSec * 1000,
      elapsedMs: 0,
    }
  }
  return { ...state, phase: 'review', elapsedMs: 0 }
}

export function initPlayer(
  events: HandEvent[],
  decisions: DecisionPoint[],
): { config: PlayerConfig; state: PlayerState } {
  const firstAward = events.findIndex((e) => e.type === 'award_pot')
  const config: PlayerConfig = {
    events,
    sealIndex: firstAward === -1 ? events.length : firstAward,
  }
  const state: PlayerState = {
    cursor: 0,
    phase: 'playing',
    speed: 1,
    pending: [...decisions].sort((a, b) => a.atEventIndex - b.atEventIndex),
    answers: [],
    results: [],
    remainingMs: 0,
    elapsedMs: 0,
  }
  // 첫 문항의 앵커가 0 이거나 이벤트가 없는 핸드를 여기서 흡수한다.
  return { config, state: settle(config, state) }
}

function tick(config: PlayerConfig, state: PlayerState, ms: number): PlayerState {
  if (state.phase === 'awaiting') {
    const remainingMs = state.remainingMs - ms
    if (remainingMs > 0) return { ...state, remainingMs }
    // 시간 초과. timeout 답을 자동 제출한다 — scoreDecision 이 0점으로 채점한다.
    return reduce(config, { ...state, remainingMs: 0 }, {
      type: 'answer',
      answer: { type: 'timeout' },
    })
  }
  if (state.phase !== 'playing') return state

  const limit = stopAt(config, state)

  // 즉시: 박자를 무시하고 정지점까지 한 번에 간다.
  if (state.speed === 0) {
    return settle(config, { ...state, cursor: limit, elapsedMs: 0 })
  }

  let cursor = state.cursor
  let elapsed = state.elapsedMs + ms
  while (cursor < limit) {
    const need = EVENT_MS[config.events[cursor].type] / state.speed
    if (elapsed < need) break
    elapsed -= need
    cursor += 1
  }
  return settle(config, {
    ...state,
    cursor,
    elapsedMs: cursor < limit ? elapsed : 0,
  })
}

export function reduce(
  config: PlayerConfig,
  state: PlayerState,
  command: PlayerCommand,
): PlayerState {
  switch (command.type) {
    case 'setSpeed':
      return { ...state, speed: command.speed }

    case 'answer': {
      if (state.phase !== 'awaiting') return state
      const dp = state.pending[0]
      // pending 에서 빼지 않는다 — feedback 화면이 pending[0] 을 읽어 설명·조항을
      // 그린다. 빼는 것은 'continue' 의 일이다.
      return {
        ...state,
        phase: 'feedback',
        answers: [...state.answers, command.answer],
        results: [...state.results, scoreDecision(dp, command.answer)],
        remainingMs: 0,
      }
    }

    case 'continue': {
      if (state.phase !== 'feedback') return state
      // 여기서 settle 하지 않는다. 다음 문항의 앵커가 지금 커서와 같으면(계산·쇼다운이
      // 둘 다 봉인 경계에 걸리는 경우) 곧장 awaiting 이 되어, 화면이 문항을 그리기도
      // 전에 제한시간이 흐르기 시작한다. 카운트다운의 시작은 "재생이 정지점에 닿는
      // 순간"이어야 하므로 다음 tick 의 settle 에 맡긴다.
      return {
        ...state,
        phase: 'playing',
        pending: state.pending.slice(1),
        elapsedMs: 0,
      }
    }

    case 'tick':
      return tick(config, state, command.ms)
  }
}
