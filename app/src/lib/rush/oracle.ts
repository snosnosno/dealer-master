/**
 * 테스트 전용 오라클 — **엔진과 다른 방법으로** 같은 답을 구한다.
 *
 * 생성기가 엔진을 불러 정답을 만드는데, 검증까지 같은 함수를 부르면 둘이 함께 틀려도
 * 아무도 못 본다 (설계 §5.4). 그래서 여기 있는 것들은 알고리즘 자체가 다르다:
 *
 * - `potsByUnit` — 층을 자르는 대신 **칩을 한 단위씩 나눠 담는다**
 * - `oddChipSeat` — 정렬 대신 **버튼 왼쪽부터 한 좌석씩 걸어간다**
 *
 * 프로덕션 코드는 이 파일을 import 하지 않는다.
 */
import { ODD_CHIP_UNIT } from '@/lib/simulator'

/**
 * 팟 분리를 "한 단위씩" 다시 계산한다.
 *
 * 비유: 모두가 앞에 칩을 쌓아 두고, 딜러가 맨 아래 한 층씩 걷어 간다.
 * 한 층을 걷을 때마다 그 층에 칩을 낸 사람들이 곧 그 팟의 참가자다.
 * 같은 참가자 집합이 이어지면 같은 팟이다.
 */
export function potsByUnit(
  contributed: readonly number[],
  folded: readonly boolean[],
  unit = ODD_CHIP_UNIT,
): { amount: number; eligibleSeats: number[] }[] {
  const left = contributed.map((c) => Math.floor(c / unit))
  const layers: { amount: number; eligibleSeats: number[] }[] = []

  for (;;) {
    const payers = left.map((n, seat) => (n > 0 ? seat : -1)).filter((s) => s >= 0)
    if (payers.length === 0) break

    const eligible = payers.filter((s) => !folded[s])
    const amount = payers.length * unit
    for (const s of payers) left[s] -= 1

    const last = layers[layers.length - 1]
    const same =
      last !== undefined &&
      last.eligibleSeats.length === eligible.length &&
      last.eligibleSeats.every((s, i) => s === eligible[i])

    if (same) last.amount += amount
    else layers.push({ amount, eligibleSeats: eligible })
  }

  /*
   * 자격자가 없는 층(전원 폴드한 데드머니)은 팟이 아니라 앞 팟에 얹힌다.
   * 앞 팟이 없으면 뒤 팟에 얹는다 — 엔진 `buildPots` 의 병합과 같은 결과다.
   */
  const merged: { amount: number; eligibleSeats: number[] }[] = []
  for (const layer of layers) {
    const last = merged[merged.length - 1]
    if (last !== undefined && layer.eligibleSeats.length === 0) last.amount += layer.amount
    else merged.push(layer)
  }
  return merged
}

/**
 * 홀칩을 받는 좌석을 걸어서 찾는다.
 * 버튼 바로 왼쪽 좌석부터 한 칸씩 돌며 처음 만나는 자격자다 (버튼 자신은 마지막에 만난다).
 */
export function oddChipSeat(
  eligibleSeats: readonly number[],
  buttonSeat: number,
  seatCount: number,
): number {
  for (let step = 1; step <= seatCount; step++) {
    const seat = (buttonSeat + step) % seatCount
    if (eligibleSeats.includes(seat)) return seat
  }
  throw new Error('자격자가 없다')
}
