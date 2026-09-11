/**
 * 핸드를 **딜 전에 통째로** 만든다. 리듀서는 이것을 드러내기만 한다.
 *
 * 비유: 연극 대본이다. 배우가 무대에서 즉흥으로 대사를 지어내지 않는다 —
 * 대본이 먼저 있고 무대는 그것을 보여줄 뿐이다.
 *
 * 프로토타입은 반대로 했다. 카드가 착지한 **뒤에** 동률을 발견하고 업카드를 바꿔서,
 * 화면에 뜬 카드가 다른 카드로 바뀌었다. 먼저 만들면 그 결함이 생길 자리가 없다.
 * `lib/rush/deal.ts` 가 이미 그 본보기다.
 *
 * **무작위는 `Rng` 로만 얻는다.** 여기서 `Math.random()` 을 한 번이라도 쓰면
 * 같은 시드가 다른 핸드를 만들어 재현이 불가능해진다.
 */
import {
  asDown,
  asUp,
  compareUpcardsHi,
  createRng,
  makeDeck,
  shuffle,
  type Card,
  type DealtCard,
  type Rng,
} from '@/lib/simulator'
import type { FirstToAct, GameSpec } from '@/lib/games'
import { firstToActSeat } from './steps'
import type { BettingAction, ForcedBets, HandScript } from './types'

export const SEAT_COUNT = 6

/**
 * 강제 베팅. **자료에 금액이 없다** — `docs/references/mixgame-facts.md` 는
 * 구조(앤티+브링인 · 5번가부터 빅벳)만 적고 금액을 적지 않는다.
 * 아래 여섯은 **사용자 확인 2026-09-11** 이다. 자료를 받으면 출처를 바꾼다.
 *
 * 스몰벳이 PLO8 의 BB 와 같아 두 종목의 칩 그림이 한 세계로 읽힌다.
 */
export const SMALL_BLIND = 500
export const BIG_BLIND = 1000
export const ANTE = 100
export const BRING_IN = 500
export const SMALL_BET = 1000
export const BIG_BET = 2000

/** 이 종목이 무엇으로 판을 여는가. **`spec.forced` 코드값으로만 갈린다** */
function forcedBetsFor(spec: GameSpec): ForcedBets {
  return spec.forced === 'ante+bringin'
    ? { kind: 'ante+bringin', ante: ANTE, bringIn: BRING_IN, smallBet: SMALL_BET, bigBet: BIG_BET }
    : { kind: 'blinds', sb: SMALL_BLIND, bb: BIG_BLIND }
}

const NAMES = ['1번', '2번', '3번', '4번', '5번', '6번']

/** 강제 베팅이 없는 라운드가 체크로 열릴 확률. 첫 액션이 늘 벳이면 상황이 하나뿐이다. */
const CHECK_OPEN_RATE = 0.45

/**
 * 무한 루프 대신 명확한 실패로 드러나게 하는 상한.
 * 값 400 은 `drills/winner/generate.ts` 의 `MAX_TRIES` 와 같다.
 */
const MAX_SHUFFLES = 400

/**
 * 첫 액션을 업카드로 정하는 종목에서, **최고 업카드가 유일한 덱**인가.
 *
 * 동률이면 무늬로 갈라야 하는데 자료에 그 우열이 없다 — mixgame-facts §2 의 7-Card
 * Stud 절이 「동률의 무늬 우열은 7카드 스터드 기준으로 자료에 없다」고 못 박고,
 * 라즈는 그 절을 따른다(§2 Razz). 답을 규칙으로 정당화할 수 없는 문제를 내면
 * 훈련생이 맞는 답을 고르고도 틀린다 —
 * 비교기가 0 을 낼 때 임의로 한 좌석을 고르는 것이 바로 그 거짓말이다
 * (`steps.ts` 의 `firstToActSeat` 가 먼저 만난 좌석을 남기는 자리).
 *
 * **플랍게임은 이 검사를 통과만 하고 지나간다** — 첫 스트릿에 업카드가 0 장이라
 * 동률이 생길 자리가 없다. 그래서 PLO8 의 덱은 한 번도 다시 섞이지 않는다.
 */
function firstStreetTieFree(spec: GameSpec, deck: Card[]): boolean {
  const street = spec.streets[0]
  if (street.deal.up === 0) return true

  /*
   * **번카드가 커서를 밀기 전에 센다.** 아래 오프셋은 첫 스트릿에 번카드가 없다는
   * 것에 기댄다 — 라즈 3번가도 PLO8 프리플랍도 `burn: false` 다(각 스펙 파일 확인).
   * 첫 스트릿에 번카드가 있는 종목이 붙으면 이 함수부터 고쳐야 한다.
   */
  const per = street.deal.down + street.deal.up
  const ups: Card[][] = []
  for (let i = 0; i < SEAT_COUNT; i++) {
    const start = i * per + street.deal.down
    ups.push(deck.slice(start, start + street.deal.up))
  }

  // 잣대는 `compareUpcardsHi` 에게만 묻는다. 여기서 랭크를 다시 세면 판정 사본이 둘이 된다
  const top = ups.reduce((best, cur) => (compareUpcardsHi(cur, best) > 0 ? cur : best))
  return ups.filter((cards) => compareUpcardsHi(cards, top) === 0).length === 1
}

export function dealHand(spec: GameSpec, seed: string): HandScript {
  const rng = createRng(seed)

  /*
   * **다시 섞을 때도 같은 `rng` 를 쓴다.** 새 `rng` 를 만들거나 `Math.random()` 을
   * 쓰면 그 순간 같은 시드가 다른 판을 만들어 재현이 깨진다.
   */
  let deck = shuffle(makeDeck(), rng)
  let tries = 0
  while (!firstStreetTieFree(spec, deck)) {
    if (++tries >= MAX_SHUFFLES) {
      throw new Error(`동률 없는 첫 스트릿을 ${MAX_SHUFFLES}번 안에 만들지 못함`)
    }
    deck = shuffle(makeDeck(), rng)
  }

  let cursor = 0
  const take = (n: number): Card[] => deck.slice(cursor, (cursor += n))

  const buttonSeat = rng.int(SEAT_COUNT)

  const seats = NAMES.map((name) => ({
    name,
    hole: [] as DealtCard[],
    // 20~99 BB. 스택이 다르면 좌석마다 화면이 달라져 판이 하나로 안 보인다
    stack: BIG_BLIND * (20 + rng.int(80)),
  }))

  const board: Record<string, Card[]> = {}
  const betting: Record<string, BettingAction[]> = {}
  const folded = new Array<boolean>(SEAT_COUNT).fill(false)

  spec.streets.forEach((street, index) => {
    // 번카드는 화면에 안 보이지만 덱에서는 빠진다 — 안 빼면 같은 카드가 두 번 나온다
    if (street.burn) take(1)

    for (let i = 0; i < SEAT_COUNT; i++) {
      /*
       * **폴드한 손은 걷힌 손이다 — 다음 장이 가지 않는다.**
       *
       * 여기서 읽는 `folded` 는 직전 스트릿의 베팅이 끝난 값이다(아래 `makeRound` 가
       * 스트릿마다 제자리에서 갱신한다). 그것이 곧 「직전 라운드 생존자에게만
       * 다음 장을 준다」는 스터드 절차다.
       *
       * `take` 를 건너뛰므로 **덱 커서가 그만큼 덜 움직인다** — 걷힌 손에 갈 카드가
       * 아예 덱에서 안 빠진다.
       *
       * **같은 시드가 여전히 같은 판을 만든다** — `take` 는 `rng` 를 건드리지 않으므로
       * 이 건너뛰기가 난수 흐름에 끼어들지 않는다. 다만 **시드별 폴드 패턴은 달라졌다**:
       * 살아남은 좌석이 받는 카드가 바뀌고, `firstToActSeat` 가 그 업카드를 읽어 첫
       * 순서를 정하므로 라운드의 좌석 순서가 돌아간다. 「카드 → 첫 순서 → 폴드 →
       * 다음 카드」가 한 고리로 물린 것이고, 재현성은 그 고리 밖에서 지켜진다
       * (`deal.test.ts` 의 「같은 시드는 라즈에서도 같은 핸드를 만든다」).
       */
      if (folded[i]) continue

      /*
       * **엎은 것 먼저, 연 것 나중.** 스터드 3번가는 다운 둘을 돌린 뒤 도어카드를
       * 연다 — 순서가 곧 딜러의 손이고, 진행절차 드릴이 보여주는 것이 그 손이다.
       * `deal:{down,up}` 을 합쳐 장수만 세면 이 순서가 사라진다 (설계 §1).
       */
      const down = asDown(take(street.deal.down))
      const up = asUp(take(street.deal.up))
      if (down.length + up.length > 0) {
        seats[i].hole = [...seats[i].hole, ...down, ...up]
      }
    }
    board[street.id] = take(street.deal.board)

    if (!street.betting) {
      betting[street.id] = []
      return
    }
    betting[street.id] = makeRound({
      rng,
      folded,
      isForced: index === 0,
      buttonSeat,
      firstToAct: street.firstToAct,
      seats,
    })
  })

  return { buttonSeat, forced: forcedBetsFor(spec), seats, board, betting }
}

/**
 * 한 라운드의 액션을 만든다. `folded` 를 **제자리에서 갱신한다** — 이 함수는
 * `dealHand` 안에서만 쓰이는 지역 헬퍼이고, 밖으로 나가는 값은 새 배열이다.
 *
 * 첫 액션 좌석은 `firstToActSeat`(`./steps.ts`)에게만 묻는다. 스터드에서는 그것이
 * 업카드를 읽으므로 `seats` 를 함께 넘긴다 — 이 스트릿의 카드는 `dealHand` 가 이미
 * 얹어 둔 뒤에 이 함수를 부른다.
 *
 * `isForced` 는 순서를 정하는 데 쓰지 않는다 — 강제 베팅 사이징·`'call'` 액션·체크로
 * 열리지 않는다는 규칙에만 쓴다. 순서 규칙이 두 곳에 있으면 하나만 고쳤을 때 나머지가
 * 조용히 틀어진다 (design §5-5).
 */
function makeRound({
  rng,
  folded,
  isForced,
  buttonSeat,
  firstToAct,
  seats,
}: {
  rng: Rng
  folded: boolean[]
  isForced: boolean
  buttonSeat: number
  firstToAct: FirstToAct
  seats: readonly { hole: readonly DealtCard[] }[]
}): BettingAction[] {
  const alive = () => folded.filter((f) => !f).length

  // 강제 베팅이 걸린 첫 라운드는 늘 콜할 금액이 있다. 나머지는 45% 가 체크로 열린다
  const checkRound = !isForced && rng.next() < CHECK_OPEN_RATE
  const startSeat = firstToActSeat(firstToAct, {
    buttonSeat,
    seats: seats.map((s, i) => ({ hole: s.hole, folded: folded[i] })),
  })
  const order: number[] = []
  for (let i = 0; i < SEAT_COUNT; i++) {
    const seat = (startSeat + i) % SEAT_COUNT
    if (!folded[seat]) order.push(seat)
  }

  if (checkRound) {
    return order.map((seat) => ({ seat, act: 'check' as const, to: 0 }))
  }

  const amount = isForced ? BIG_BLIND : BIG_BLIND * (2 + rng.int(3))
  const out: BettingAction[] = []
  let opened = false

  for (const seat of order) {
    // 마지막 두 좌석이 남았으면 더 접지 않는다 — 쇼다운이 사라지면 판이 성립하지 않는다
    const mayFold = alive() > 2 && rng.next() < 0.35
    if (mayFold) {
      folded[seat] = true
      out.push({ seat, act: 'fold', to: 0 })
      continue
    }
    out.push({ seat, act: opened ? 'call' : isForced ? 'call' : 'bet', to: amount })
    opened = true
  }
  return out
}
