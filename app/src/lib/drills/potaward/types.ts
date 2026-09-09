/**
 * 팟 분배 드릴의 타입.
 *
 * 승자 판독이 「이 판의 임자」를 묻는다면 이 드릴은 「**이 팟의** 임자」를 묻는다.
 * 차별점은 자격(사이드팟)과 홀칩에 있다 — 그래서 출제가 자격이 갈리거나
 * 반으로 갈리는 판으로 치우친다 (설계 §5-2).
 *
 * **임자만으로는 분배가 아니다.** 누구인지 골랐으면 얼마인지도 답해야 한다 —
 * 층을 세고 반으로 가르고 홀칩을 얹는 것이 딜러가 실제로 하는 일이고, 금액을
 * 화면이 대신 세어 주면 그 일이 통째로 빠진다. 그래서 답이 좌석 **과** 금액이다.
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
 * 금액 입력이 붙으면서 유형마다 10초씩 늘렸다 — 세고 가르는 데 드는 시간이다.
 */
export const POTAWARD_LIMIT_SEC: Record<PotAwardKind, number> = {
  hihalf: 50,
  lohalf: 50,
  oddchip: 35,
  sidepot: 60,
}

export const POTAWARD_QUESTION_COUNT = 10
/** 이 드릴의 출제 좌석 수. 사이드팟이 성립하려면 올인이 필요해 승자 판독보다 많다 */
export const POTAWARD_SEAT_COUNT = 4

/**
 * 팟이 몇 층까지 쌓이나.
 *
 * 예전에는 늘 짧은 올인 둘로 세 층을 노렸다 — 열 판이 다 같은 모양이었고, 「메인팟
 * 하나뿐인 판」을 본 적이 없는 트레이니가 만들어졌다. 층 수를 문제마다 뽑는다:
 * 1이면 메인팟만, 2면 세컨드팟까지, 3이면 서드팟까지다.
 */
export const POTAWARD_MAX_LAYERS = 3

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
   * 몇 번째 팟을 묻나. `sidepot` 은 1 이상이고, 나머지 셋은 층이 있는 판이면
   * 위층도 물을 수 있다 — 세컨드팟의 하이 절반도 딜러가 가르는 팟이다.
   */
  potIndex: number
  /** 정답 좌석. **동점이면 여럿이다** */
  answerSeats: number[]
  /** 정답 금액. 그 좌석들이 이 문제에서 **함께 받는 총액**이다 (1인당이 아니다) */
  answerAmount: number
  /** 금액 입력칸 위에 붙는 이름 — 무엇을 넣으라는 것인지 한 줄로 */
  amountLabel: string
  why: string
}
