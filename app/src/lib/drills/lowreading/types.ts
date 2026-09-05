/**
 * 로우 판독 드릴의 문제 타입.
 *
 * **정답은 이 타입 안에 값으로 들어 있지만, 그 값을 만든 것은 전부 엔진이다**
 * (`bestOmahaLow`). 드릴 코드에 포커 규칙은 없다.
 */
import type { Card } from '@/lib/simulator'
import { createBestRecord } from '@/lib/rush/record'

export type LowKind = 'lo-possible' | 'lo-qualified' | 'lo-best'

export const LOW_KIND_LABEL: Record<LowKind, string> = {
  'lo-possible': '로우 성립',
  'lo-qualified': '로우 자격',
  'lo-best': '로우 승자',
}

/**
 * 제한시간(초). **초안이다** — PRD §11 의 열린 질문이고 재미 게이트에서 확정한다.
 * 성립 여부는 보드만 보면 되고, 자격은 좌석을 다 훑어야 하며, 승자는 거기에 비교가 붙는다.
 */
export const LOW_LIMIT_SEC: Record<LowKind, number> = {
  'lo-possible': 15,
  'lo-qualified': 35,
  'lo-best': 30,
}

export const LOW_QUESTION_COUNT = 10

export type LowSeat = { name: string; hole: Card[] }

type LowBase = {
  label: string
  prompt: string
  limitSec: number
  seats: LowSeat[]
  board: Card[]
  buttonSeat: number
}

export type LowQuestion = LowBase &
  (
    | { kind: 'lo-possible'; answerYes: boolean }
    | { kind: 'lo-qualified'; answerSeats: number[] }
    | { kind: 'lo-best'; answerSeat: number }
  )

/** 최고 기록. 키 규약은 `<gameId>.<drillId>.best` 다. 기존 키를 지우지 않는다. */
export const plo8LowRecord = createBestRecord('plo8.lowreading.best')
