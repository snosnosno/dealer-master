/**
 * 팟 판독 러시의 문제 타입.
 *
 * 문제는 핸드가 아니다. 사이드팟 문제에는 쇼다운이 없고 홀칩 문제에는 보드조차 없다 —
 * 그래서 엔진의 `HandState` 를 쓰지 않고 화면에 필요한 것만 담는다.
 *
 * **정답은 이 타입 안에 값으로 들어 있지만, 그 값을 만든 것은 전부 엔진이다.**
 * 러시 코드에 포커 규칙은 없다 (계획서 §1).
 */
import type { Card } from '@/lib/simulator'

export type RushKind = 'sidepots' | 'winner' | 'payout' | 'split' | 'oddchip'

export const KIND_LABEL: Record<RushKind, string> = {
  sidepots: '사이드팟 분리',
  winner: '승자 판정',
  payout: '메인팟 지급',
  split: '스플릿 팟 판정',
  oddchip: '홀칩 배분',
}

/** 제한시간(초). 프로토타입 실플레이로 "맞다"가 확인된 값이다 (설계 §4). */
export const LIMIT_SEC: Record<RushKind, number> = {
  sidepots: 45,
  winner: 28,
  payout: 40,
  split: 30,
  oddchip: 20,
}

export type RushSeat = {
  name: string
  /**
   * 홀카드. 없으면 이 좌석은 카드를 보여주지 않는다 —
   * 사이드팟 문제는 아직 베팅 라운드라 뒷면이고, 홀칩 문제에는 카드가 아예 없다.
   */
  hole?: Card[]
  /** 이 좌석이 낸 금액. **화면에는 칩으로만 보여준다** — 숫자로 보여주면 문제가 사라진다 */
  bet?: number
  allIn?: boolean
  /** 홀칩 문제에서 이미 동점으로 확정된 좌석 */
  tie?: boolean
  folded?: boolean
}

/** 사이드팟 문제의 입력칸 하나. `label` 이 곧 팟 이름이다. */
export type PotField = { label: string; answer: number }

type RushBase = {
  label: string
  prompt: string
  limitSec: number
  seats: RushSeat[]
  board: Card[]
  /** 딜러 버튼. **모든 유형에 표시한다** — 홀칩 문제에만 나오면 유형이 새어나간다 */
  buttonSeat: number
  /** 이미 가운데로 수거된 팟. 사이드팟 문제에는 없다(아직 각자 앞에 있다) */
  pot?: number
  /** 채점 후 보여주는 근거 한 줄 */
  why: string
}

export type RushQuestion =
  | (RushBase & { kind: 'sidepots'; fields: PotField[] })
  | (RushBase & { kind: 'winner' | 'payout' | 'oddchip'; answerSeat: number })
  | (RushBase & { kind: 'split'; answerSeats: number[] })

/** 한 판의 문제 수. */
export const QUESTION_COUNT = 10

/**
 * 유형별 출제 수. 합이 `QUESTION_COUNT` 이고 한 유형이 4를 넘지 않는다 (설계 §4).
 * 프로토타입에서 재미가 확인된 배분 그대로다.
 */
export const KIND_QUOTA: Record<RushKind, number> = {
  sidepots: 3,
  winner: 2,
  payout: 2,
  split: 2,
  oddchip: 1,
}
