/**
 * 오벌 테이블의 좌석 좌표.
 *
 * 화면 좌표계는 y 가 아래로 증가한다. 90도 = 하단 중앙이고 **거기는 딜러(학습자)
 * 자리로 비운다** — 학습자는 플레이어가 아니라 딜러이고, 카드는 그 자리(덱)에서
 * 나간다. `+0.5` 가 그 빈자리를 만든다: n=6 이면 좌석이 120·180·240·300·0·60 도에
 * 앉아 90도가 정확히 두 좌석 사이에 온다.
 *
 * 좌석 인덱스가 늘수록 화면상 반시계다. 위에서 내려다본 테이블에서 각자의 왼쪽이
 * 화면 왼쪽이므로, 딜링 순서(각자의 왼쪽으로)가 그렇게 보이는 것이 맞다.
 */

/** 하단 중앙. 딜러가 앉는 각도이므로 좌석이 오지 않는다. */
export const DEALER_ANGLE_DEG = 90

export function seatAngleDeg(seatIndex: number, seatCount: number): number {
  return DEALER_ANGLE_DEG + (360 / seatCount) * (seatIndex + 0.5)
}

/** 테이블 중심 기준 오프셋(px). 호출부가 중심 좌표를 더한다. */
export function seatOffset(
  seatIndex: number,
  seatCount: number,
  radiusX: number,
  radiusY: number,
): { x: number; y: number } {
  const rad = (seatAngleDeg(seatIndex, seatCount) * Math.PI) / 180
  return { x: radiusX * Math.cos(rad), y: radiusY * Math.sin(rad) }
}
