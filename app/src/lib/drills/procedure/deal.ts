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
import { firstToActSeats } from './steps'
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

/** 좌석이 접을 확률. 라운드 생성기 **둘이 같은 값을 쓴다** — 두 곳에 적으면 한쪽만 바뀐다 */
const FOLD_RATE = 0.35

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
 * 라즈는 그 절을 따른다(§2 Razz).
 *
 * **이 함수는 이름 그대로 첫 스트릿만 본다.** 4번가 이후의 동률은 여기서 걸러지지 않고,
 * 걸러려 들지도 않는다 — 동률은 실제 게임에서 일어나는 일이고 모든 스트릿에 가드를 걸면
 * 덱을 몇 번 다시 섞어야 하는지 알 수 없다. 그쪽은 **채점이 받아 준다**:
 * `steps.ts` 의 `firstToActSeats` 가 동률 좌석 **전부**를 돌려주고 `judge.ts` 가 그 집합에
 * 들면 맞다고 한다. 규칙으로 정당화할 수 없는 답을 강요하는 자리가 그래서 없다.
 *
 * 첫 스트릿만 여전히 거르는 이유: 3번가 브링인은 이 드릴이 가르치는 첫 장면이고,
 * 대본의 베팅 순서까지 유일하게 정해지는 쪽이 화면에 읽히는 그림이 하나로 남는다.
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

  /*
   * **금액의 정본은 여기 하나다.** 아래 `makeRound` 가 상수를 다시 읽지 않고 이 값을
   * 받는다 — 그래서 라즈의 벳 크기가 PLO8 의 BB 를 빌려 쓰던 자리가 사라진다.
   */
  const forced = forcedBetsFor(spec)

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
       * 살아남은 좌석이 받는 카드가 바뀌고, `firstToActSeats` 가 그 업카드를 읽어 첫
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
      sizeMultiplier: street.sizeMultiplier,
      forced,
      seats,
    })
  })

  return { buttonSeat, forced, seats, board, betting }
}

/**
 * 이 라운드의 벳 크기. **픽스리밋은 종목이 정하고, 노리밋·팟리밋은 판마다 다르다.**
 *
 * 픽스리밋에 있는 벳 크기는 스몰벳과 빅벳 **둘뿐이다.** 그래서 `sizeMultiplier` 를
 * 곱하지 않고 **고르는 데** 쓴다 — 「빅벳은 스몰벳의 2배」라는 관계는 `types.ts` 의
 * `ForcedBets` 가 이미 적고 있고, 여기서 다시 곱하면 그 관계의 사본이 둘이 된다.
 *
 * 예전에는 이 자리에 `BIG_BLIND * (2 + rng.int(3))` 하나뿐이어서 라즈에도
 * 3,000·4,000 이 나왔다 — 픽스리밋에 **없는 금액**이고, 아무도 벳하지 않은 금액을
 * 전원이 콜하는 로그가 그래서 떴다.
 *
 * **`spec.betting`·`spec.id` 를 읽지 않는다** — 금액의 정본이 `forced` 니 금액을 정하는
 * 코드도 그것만 본다.
 */
function roundAmount(
  forced: ForcedBets,
  sizeMultiplier: 1 | 2,
  isForced: boolean,
  rng: Rng,
): number {
  if (forced.kind === 'ante+bringin') {
    return sizeMultiplier === 2 ? forced.bigBet : forced.smallBet
  }
  // 노리밋·팟리밋은 크기가 상황이다. **이 식을 건드리면 PLO8 의 시드가 달라진다**
  return isForced ? forced.bb : forced.bb * (2 + rng.int(3))
}

/**
 * 한 라운드의 액션을 만든다. `folded` 를 **제자리에서 갱신한다** — 이 함수는
 * `dealHand` 안에서만 쓰이는 지역 헬퍼이고, 밖으로 나가는 값은 새 배열이다.
 *
 * 첫 액션 좌석은 `firstToActSeats`(`./steps.ts`)에게만 묻는다. 스터드에서는 그것이
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
  sizeMultiplier,
  forced,
  seats,
}: {
  rng: Rng
  folded: boolean[]
  isForced: boolean
  buttonSeat: number
  firstToAct: FirstToAct
  sizeMultiplier: 1 | 2
  forced: ForcedBets
  seats: readonly { hole: readonly DealtCard[] }[]
}): BettingAction[] {
  // 강제 베팅이 걸린 첫 라운드는 늘 콜할 금액이 있다. 나머지는 45% 가 체크로 열린다
  const checkRound = !isForced && rng.next() < CHECK_OPEN_RATE

  /*
   * **대본은 하나에서 시작해야 한다.** 동률이면 `firstToActSeats` 가 여럿을 돌려주는데,
   * 여기서는 그중 첫 좌석(가장 작은 좌석 번호)에서 액션을 시작한다. 채점하는 `judge.ts`
   * 는 반대로 **집합 전체**를 정답으로 받는다 — 대본의 베팅 순서는 채점되지 않으므로,
   * 이 임의성이 훈련생에게 답으로 닿지 않는다. 두 호출부가 갈리는 곳이 여기다.
   */
  const startSeat = firstToActSeats(firstToAct, {
    buttonSeat,
    seats: seats.map((s, i) => ({ hole: s.hole, folded: folded[i] })),
  })[0]
  const order: number[] = []
  for (let i = 0; i < SEAT_COUNT; i++) {
    const seat = (startSeat + i) % SEAT_COUNT
    if (!folded[seat]) order.push(seat)
  }

  if (checkRound) {
    return order.map((seat) => ({ seat, act: 'check' as const, to: 0 }))
  }

  const amount = roundAmount(forced, sizeMultiplier, isForced, rng)
  if (isForced && forced.kind === 'ante+bringin') {
    return bringInRound({ rng, folded, order, bringIn: forced.bringIn, completeTo: amount })
  }
  return plainRound({ rng, folded, order, amount, isForced })
}

/** 살아 있는 좌석 수. 마지막 둘이 남았으면 더 접지 않는다 — 쇼다운이 사라지면 판이 없다 */
const aliveCount = (folded: readonly boolean[]) => folded.filter((f) => !f).length

/**
 * 블라인드 종목의 라운드, 그리고 스터드의 3번가 이후. 첫 좌석이 열고 나머지가 받는다.
 *
 * `isForced` 는 순서가 아니라 **문구**에만 쓴다 — 프리플랍은 블라인드가 이미 서 있어
 * 첫 좌석도 「벳」이 아니라 「콜」이다.
 */
function plainRound({
  rng,
  folded,
  order,
  amount,
  isForced,
}: {
  rng: Rng
  folded: boolean[]
  order: readonly number[]
  amount: number
  isForced: boolean
}): BettingAction[] {
  const out: BettingAction[] = []
  let opened = false

  for (const seat of order) {
    if (aliveCount(folded) > 2 && rng.next() < FOLD_RATE) {
      folded[seat] = true
      out.push({ seat, act: 'fold', to: 0 })
      continue
    }
    out.push({ seat, act: opened ? 'call' : isForced ? 'call' : 'bet', to: amount })
    opened = true
  }
  return out
}

/**
 * 스터드의 첫 라운드 — **브링인이 판을 연다.**
 *
 * 최고 업카드 좌석이 브링인(500)을 내고, 다음 좌석이 스몰벳(1,000)까지 컴플리트하면
 * 나머지가 그것을 받는다. 브링인 좌석은 **마지막에 차액 500 을 콜해** 라운드를 닫는다 —
 * `to` 가 라운드 누적액이라 리듀서가 이미 낸 만큼을 뺀 차액만 스택에서 뺀다
 * (`reduce.ts` 의 `delta`). 그래서 좌석마다 낸 돈이 정확히 스몰벳으로 맞는다.
 *
 * **이 라운드만 한 좌석이 두 번 액션한다.** 브링인은 강제로 세워진 벳이라 그 좌석이
 * 컴플리트를 받을 차례가 한 번 더 오는 것이 이 종목의 절차다. 다른 라운드는 여전히
 * 좌석당 한 번이다 (`deal.test.ts` 가 둘을 따로 못박는다).
 *
 * **컴플리트가 없는 판(전원이 브링인 500 만 받고 끝나는 판)은 만들지 않는다** — 그것도
 * 실제로 있는 상황이지만 상황을 늘리는 것은 이 수정의 범위가 아니다(설계 §8).
 */
function bringInRound({
  rng,
  folded,
  order,
  bringIn,
  completeTo,
}: {
  rng: Rng
  folded: boolean[]
  order: readonly number[]
  bringIn: number
  completeTo: number
}): BettingAction[] {
  const [bringInSeat, ...rest] = order
  const out: BettingAction[] = [{ seat: bringInSeat, act: 'bringin', to: bringIn }]
  let completed = false

  for (const seat of rest) {
    // 브링인 좌석은 접지 않는다 — 강제로 낸 벳이다. 그래서 폴드 판정은 나머지에게만 묻는다
    if (aliveCount(folded) > 2 && rng.next() < FOLD_RATE) {
      folded[seat] = true
      out.push({ seat, act: 'fold', to: 0 })
      continue
    }
    out.push({ seat, act: completed ? 'call' : 'complete', to: completeTo })
    completed = true
  }

  /*
   * 여섯에서 둘까지만 줄어드니 폴드는 넷이 상한이고, 나머지 다섯 중 **적어도 하나는
   * 컴플리트한다** — 그래서 아래는 늘 실행된다. 그래도 조건을 다는 이유: 폴드 규칙이
   * 바뀌는 날 브링인 좌석이 **아무도 안 낸 금액을 콜하는** 그림이 뜨는 것보다 낫다.
   */
  if (!completed) return out
  return [...out, { seat: bringInSeat, act: 'call', to: completeTo }]
}
