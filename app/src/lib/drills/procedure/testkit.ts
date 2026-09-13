/**
 * 테스트 전용 — 지금 상태가 요구하는 올바른 입력 하나를 만들어 넣는다.
 *
 * 테스트 파일끼리 서로 import 하면 가져온 파일의 `describe` 가 한 번 더 등록된다.
 * 그래서 여러 테스트가 같이 쓰는 발걸음을 여기 둔다.
 */
import { awardAnswer } from './award'
import { reduce } from './reduce'
import { firstToActSeats } from './steps'
import type { ProcedureState } from './types'

export function stepCorrectly(state: ProcedureState): ProcedureState {
  if (state.phase === 'anim') return reduce(state, { type: 'animEnd' })
  if (state.phase === 'awardSeat') {
    return reduce(state, { type: 'award', ...awardAnswer(state.spec, state.table) })
  }
  if (state.phase === 'openSeat') {
    const street = state.spec.streets[state.steps[state.at].streetIndex]
    // 동률이면 집합의 첫 좌석 — 동률 채점 자체는 `reduce.test.ts` 가 따로 못박는다
    const [seat] = firstToActSeats(street.firstToAct, {
      buttonSeat: state.script.buttonSeat,
      seats: state.table.seats,
    })
    return reduce(state, { type: 'seat', seat })
  }
  const act = state.steps[state.at].act
  if (act === 'open' || act === 'award') throw new Error(`${act} 는 팔레트가 아니다`)
  return reduce(state, { type: 'palette', act })
}
