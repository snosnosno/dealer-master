/**
 * 스텝은 `GameSpec` 에서 나온다. **이 파일에 종목 이름이 없다** —
 * 스터드가 붙어도 이 코드는 그대로 21스텝을 낸다.
 */
import type { FirstToAct, GameSpec } from '@/lib/games'
import type { PaletteAct, Step } from './types'

/** 팔레트는 늘 이 일곱이고 순서도 고정이다. 상황마다 보기가 바뀌면 4지선다가 된다. */
export const PALETTE: readonly { id: PaletteAct; ko: string }[] = [
  { id: 'ante', ko: '앤티 수거' },
  { id: 'blinds', ko: '블라인드 수거' },
  { id: 'burn', ko: '번카드' },
  { id: 'deal', ko: '카드 딜' },
  { id: 'draw', ko: '카드 교체' },
  { id: 'betting', ko: '베팅 진행' },
  { id: 'payout', ko: '팟 지급' },
]

export function stepsFor(spec: GameSpec): Step[] {
  const steps: Step[] = [
    { act: spec.forced === 'ante+bringin' ? 'ante' : 'blinds', streetIndex: -1 },
  ]

  spec.streets.forEach((street, i) => {
    if (street.burn) steps.push({ act: 'burn', streetIndex: i })
    steps.push({ act: street.kind, streetIndex: i })
    if (street.betting) {
      steps.push({ act: 'open', streetIndex: i })
      steps.push({ act: 'betting', streetIndex: i })
    }
  })

  steps.push({ act: 'payout', streetIndex: -1 })
  return steps
}

/**
 * 이 라운드에 먼저 액션하는 좌석.
 *
 * **앞의 둘만 구현한다.** 나머지 넷(스터드·라즈)은 자료를 확인한 뒤 채운다 —
 * 짐작으로 구현하면 검증되지 않은 채 굳는다(PRD §6-3 함정 1).
 * 값이 정적으로 좁혀지지 않으므로 컴파일이 아니라 런타임에 막는다.
 */
export function firstToActSeat(
  firstToAct: FirstToAct,
  buttonSeat: number,
  seatCount: number,
  folded: readonly boolean[],
): number {
  let offset: number
  switch (firstToAct) {
    // 버튼+1 이 SB, +2 가 BB, +3 이 BB 왼쪽이다
    case 'left-of-bb':
      offset = 3
      break
    case 'left-of-button':
      offset = 1
      break
    default:
      throw new Error(
        `아직 구현하지 않은 첫 액션 규칙: ${firstToAct} — 스터드·라즈를 붙일 때 채운다`,
      )
  }

  for (let i = 0; i < seatCount; i++) {
    const seat = (buttonSeat + offset + i) % seatCount
    if (!folded[seat]) return seat
  }
  throw new Error('폴드하지 않은 좌석이 없음 — 베팅 라운드가 열릴 수 없는 상태다')
}
