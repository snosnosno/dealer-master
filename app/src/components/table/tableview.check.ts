/**
 * 타입 계약을 고정한다. **실행되지 않는다** — `tsc --noEmit` 이 이 파일의 검사원이다.
 *
 * 두 가지를 못박는다.
 *   1. `PokerTable` 은 시뮬레이터를 돌리지 않은 순수 `TableView` 도 받는다
 *   2. `HandState` 는 여전히 `TableView` 를 만족한다 (기존 호출부가 안 깨진다)
 */
import { PokerTable } from './PokerTable'
import type { HandState, TableView } from '@/lib/simulator'

type Props = Parameters<typeof PokerTable>[0]

/** 1. 드릴이 만든 순수 뷰. 이 줄이 Task 9 전에는 타입 에러다 */
const fromDrill: TableView = { seats: [], buttonSeat: 0, board: [], pot: 0 }
export const acceptsTableView: Props = { state: fromDrill, burnCount: 0 }

/** 2. 엔진 상태. 이 줄은 Task 9 전후로 늘 통과해야 한다 */
export function acceptsHandState(state: HandState): Props {
  return { state, burnCount: 0 }
}
