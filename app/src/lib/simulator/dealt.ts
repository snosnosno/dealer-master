/**
 * 딜된 카드 한 장 — **카드와 그 앞뒤**.
 *
 * 비유: 카드를 테이블에 놓을 때 딜러는 두 가지를 정한다. 어떤 카드인가, 그리고
 * 엎을 것인가 열 것인가. 그 둘은 같은 순간의 한 동작이라 따로 다닐 수 없다.
 *
 * **왜 좌석이 아니라 카드가 앞뒤를 드는가.** 스터드는 한 좌석에 엎은 카드와 열린
 * 카드가 섞여 놓인다(3번가 = 엎어 둘 + 열어 하나, 7번가 = 엎어 하나). 좌석 단위
 * 플래그로는 그 판을 표현할 수 없고, 좌석 밖 마스크 배열로 두면 길이가 어긋나도
 * 컴파일러가 아무 말을 안 한다 — 설계 §2 가 그 갈래를 버린 이유다.
 *
 * `faceUp` 은 「이 카드가 앞면으로 놓였는가」다. 「지금 공개됐는가」(`SeatState.revealed`)
 * 와 다른 질문이다 — 쇼다운은 엎은 카드까지 연다.
 */
import type { Card } from './cards'

export type DealtCard = { card: Card; faceUp: boolean }

/** 앞뒤를 벗기고 카드만. 평가기처럼 앞뒤가 무의미한 곳이 이것을 쓴다. */
export function cards(dealt: readonly DealtCard[]): Card[] {
  return dealt.map((d) => d.card)
}

/** 전부 엎어서 놓는다. 플랍게임의 홀카드가 전부 이것이다. */
export function asDown(list: readonly Card[]): DealtCard[] {
  return list.map((card) => ({ card, faceUp: false }))
}

/** 전부 열어서 놓는다. 스터드의 업카드가 이것이다. */
export function asUp(list: readonly Card[]): DealtCard[] {
  return list.map((card) => ({ card, faceUp: true }))
}
