/**
 * 스텝은 `GameSpec` 에서 나온다. **이 파일에 종목 이름이 없다** —
 * 스터드가 붙어도 이 코드는 그대로 21스텝을 낸다.
 */
import { compareUpcardsHi, compareUpcardsLo, type Card, type DealtCard } from '@/lib/simulator'
import type { FirstToAct, GameSpec } from '@/lib/games'
import type { PaletteAct, Step } from './types'

/** 팔레트는 늘 이 일곱이고 순서도 고정이다. 상황마다 보기가 바뀌면 4지선다가 된다. */
export const PALETTE: readonly { id: PaletteAct; ko: string }[] = [
  { id: 'ante', ko: '앤티 수거' },
  { id: 'blinds', ko: '블라인드 포스팅' },
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
  steps.push({ act: 'award', streetIndex: -1 })
  return steps
}

/** 이 함수가 좌석에서 읽는 것 전부. 스택도 이름도 필요 없다 */
export type SeatCards = { hole: readonly DealtCard[]; folded: boolean }

/**
 * 이 라운드에 먼저 액션할 **자격이 있는 좌석 전부.** 하나가 아니라 집합이다.
 *
 * **버튼이 정하는 종목과 카드가 정하는 종목이 갈린다.** 플랍게임은 버튼에서 세므로 답이
 * 늘 하나고, 스터드는 테이블에 뜬 업카드를 읽으므로 **동률이면 여럿이다** — 그래서 이
 * 함수는 좌석을 통째로 받는다. 예전 서명은 `folded` 만 받아 스터드의 답을 **담을 수
 * 없었고**, 그다음 서명은 좌석 하나를 돌려줘 **동률을 담을 수 없었다.**
 *
 * **집합인 이유는 채점이다.** 동률의 무늬 우열은 자료에 없는데(mixgame-facts §2 7-Card
 * Stud 절) 4번가 이후의 동률은 **실제로 출제된다** — 생성기의 `firstStreetTieFree` 는
 * 이름 그대로 첫 스트릿만 거른다. 동률에서 임의로 한 좌석을 골라 정답으로 삼으면
 * 훈련생이 **규칙으로는 구별할 수 없는 다른 좌석**을 눌러 틀리고, 힌트(「열린 카드로 만든
 * 로우가 가장 좋은 좌석입니다」)로도 답을 좁힐 수 없다. 그래서 판정이 「이 중 아무나」다.
 *
 * **호출부가 여기서 갈린다** — 채점(`judge.ts`)은 **집합에 드는지**를 보고, 대본 생성
 * (`deal.ts`)은 액션을 어디선가 시작해야 하니 **첫 원소**를 쓴다. 대본의 베팅 순서는
 * 채점되지 않으므로 그 임의성은 훈련생에게 답으로 닿지 않는다.
 *
 * 돌려주는 배열은 **좌석 번호 오름차순**이고 비어 있지 않다.
 *
 * 아직 채우지 않은 갈래는 던진다. 자료가 없는 규칙을 짐작으로 구현하면
 * 검증되지 않은 채 굳는다 (PRD §6-3 함정 1).
 */
export function firstToActSeats(
  firstToAct: FirstToAct,
  ctx: { buttonSeat: number; seats: readonly SeatCards[] },
): number[] {
  // 버튼에서 세는 종목
  if (firstToAct === 'left-of-bb' || firstToAct === 'left-of-button') {
    return [seatFromButton(firstToAct, ctx)]
  }

  // 카드가 정하는 종목
  if (firstToAct === 'highest-upcard' || firstToAct === 'lowest-hand') {
    return extremeUpcardSeats(firstToAct, ctx.seats)
  }

  throw new Error(
    `아직 구현하지 않은 첫 액션 규칙: ${firstToAct} — 스터드 자료를 확인한 뒤 채운다`,
  )
}

/** 버튼에서 세어 처음 만나는 살아 있는 좌석. 버튼은 하나뿐이라 답도 하나뿐이다 */
function seatFromButton(
  firstToAct: 'left-of-bb' | 'left-of-button',
  ctx: { buttonSeat: number; seats: readonly SeatCards[] },
): number {
  const { buttonSeat, seats } = ctx
  // 버튼+1 이 SB, +2 가 BB, +3 이 BB 왼쪽이다
  const offset = firstToAct === 'left-of-bb' ? 3 : 1
  for (let i = 0; i < seats.length; i++) {
    const seat = (buttonSeat + offset + i) % seats.length
    if (!seats[seat].folded) return seat
  }
  throw new Error('폴드하지 않은 좌석이 없음 — 베팅 라운드가 열릴 수 없는 상태다')
}

/**
 * 업카드가 극값인 좌석 전부 — 하이면 가장 높은 쪽, 로우면 가장 좋은(낮은) 쪽.
 *
 * 동률이면 길이가 2 이상이다. **그것을 좁히지 않는다** — 무늬로 가를 근거가 자료에 없다.
 */
function extremeUpcardSeats(
  firstToAct: 'highest-upcard' | 'lowest-hand',
  seats: readonly SeatCards[],
): number[] {
  /*
   * **폴드한 좌석을 먼저 걸러내는 것이 이 함수의 계약이다.** `compareUpcards*` 는
   * 짧은 키를 0 으로 메우므로 장수가 다른 손을 견주면 답이 뒤집힌다 — 업카드가
   * `A` 한 장뿐인 손이 `5432` 넉 장보다 좋은 로우로 나온다. 같은 스트릿의 생존
   * 좌석은 업카드를 같은 수로 들고 있으니, 걸러낸 뒤에는 길이가 어긋나지 않는다.
   */
  const alive = seats.flatMap((seat, i) =>
    seat.folded ? [] : [{ i, up: seat.hole.filter((d) => d.faceUp).map((d) => d.card) }],
  )
  const withCards = alive.filter((s) => s.up.length > 0)
  if (withCards.length === 0) {
    throw new Error('업카드가 없다 — 카드가 나가기 전에 베팅 라운드가 열릴 수 없다')
  }

  /*
   * 잣대는 `compareUpcards*` 에게만 묻는다. 여기서 랭크를 다시 세면 판정 사본이
   * 둘이 되고, 한쪽만 고쳐지는 날이 온다.
   *
   * 로우는 **낮은 쪽이 좋으니** 부호를 돌려 「클수록 먼저 말한다」로 맞춘다 — 두 갈래를
   * 한 모양으로 세워야 아래 극값·동률 계산이 하나로 남는다.
   */
  const rank =
    firstToAct === 'highest-upcard'
      ? (a: Card[], b: Card[]) => compareUpcardsHi(a, b)
      : (a: Card[], b: Card[]) => -compareUpcardsLo(a, b)

  const best = withCards.reduce((top, cur) => (rank(cur.up, top.up) > 0 ? cur : top))
  // 비교기가 0 을 낸 좌석은 **규칙으로 구별되지 않는다.** 전부 돌려준다
  return withCards.filter((s) => rank(s.up, best.up) === 0).map((s) => s.i)
}
