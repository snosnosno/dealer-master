/**
 * 팟 분배 드릴의 타입.
 *
 * 승자 판독이 「이 판의 임자」를 묻는다면 이 드릴은 「**이 팟의** 임자」를 묻는다.
 * 차별점은 자격(사이드팟)과 홀칩에 있다 — 그래서 출제가 자격이 갈리거나
 * 반으로 갈리는 판으로 치우친다 (설계 §5-2).
 */
import type { Card, Pot } from '@/lib/simulator'

export type PotAwardKind = 'hihalf' | 'lohalf' | 'oddchip' | 'sidepot'

export const POTAWARD_KIND_LABEL: Record<PotAwardKind, string> = {
  hihalf: '하이 절반',
  lohalf: '로우 절반',
  oddchip: '홀칩 배분',
  sidepot: '사이드팟 임자',
}

/**
 * 제한시간(초). **초안이다** — 재미 게이트에서 확정한다 (설계 §10).
 * 기존 팟 러시가 사이드팟 45 · 메인팟 지급 40 · 홀칩 20 이었고, 하이로우가 얹혔다.
 */
export const POTAWARD_LIMIT_SEC: Record<PotAwardKind, number> = {
  hihalf: 40,
  lohalf: 40,
  oddchip: 25,
  sidepot: 50,
}

export const POTAWARD_QUESTION_COUNT = 10
/** 이 드릴의 출제 좌석 수. 사이드팟이 성립하려면 올인이 필요해 승자 판독보다 많다 */
export const POTAWARD_SEAT_COUNT = 4

export type PotAwardSeat = {
  name: string
  hole: Card[]
  /** 이 핸드에 낸 총액. 사이드팟 층을 자르는 근거다 */
  contributed: number
  folded: boolean
  allIn: boolean
}

export type PotAwardQuestion = {
  kind: PotAwardKind
  limitSec: number
  label: string
  prompt: string
  seats: PotAwardSeat[]
  board: Card[]
  buttonSeat: number
  pots: Pot[]
  /**
   * 몇 번째 팟을 묻나. `hihalf`·`lohalf` 는 메인팟(0)이고,
   * `sidepot` 은 1 이상이며, `oddchip` 은 홀칩이 남은 팟이라 어느 층이든 될 수 있다.
   */
  potIndex: number
  /** 정답 좌석. **동점이면 여럿이다** */
  answerSeats: number[]
  why: string
}
