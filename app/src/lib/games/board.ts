/**
 * 이 종목의 공유 보드 장수. 스펙이 스트릿마다 보드로 내는 장수의 합이다.
 *
 * 0 이면 **공유 보드가 없는 종목**이다 — 스터드 갈래(라즈)가 그렇다. 화면이 이것을
 * 안 보고 보드를 그리면 빈 상자가 남고, 안 보고 문구를 쓰면 없는 보드를 말하게 된다
 * (둘 다 관찰로 잡혔다). 그래서 문제 생성기와 화면이 **같은 함수**를 본다.
 */
import type { GameSpec } from './types'

export function boardSize(spec: GameSpec): number {
  return spec.streets.reduce((n, s) => n + s.deal.board, 0)
}
