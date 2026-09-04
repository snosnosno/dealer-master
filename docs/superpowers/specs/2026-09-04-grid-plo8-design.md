# 격자 뼈대 + PLO8 진행절차 + PLO8 로우 판독 — 설계

- **날짜**: 2026-09-04
- **상태**: 설계 확정 (사용자 승인 2026-09-04)
- **정본**: [`PRD.md`](../../../PRD.md) §6 (격자) · §10 (순서 1단계)
- **관련**: [ADR-003](../decisions/ADR-003-gamespec-boundary.md) — 이 문서가 두 곳을 개정한다(§8)

---

## 1. 무엇을 만드나

PRD §10 의 1단계다. **격자의 첫 칸 두 개**를 만들면서 격자 뼈대가 서는지 본다.

| | 만드는 것 |
|---|---|
| 데이터 | `GameSpec` 타입 · PLO8 스펙 한 장 · `drillsFor` |
| 원자 | A-5 로우볼 평가기 · 오마하 2+3 조합기 |
| 드릴 | PLO8 진행절차(자기주도) · PLO8 로우 판독(퀴즈) |
| 화면 | 홈(종목 목록) · 종목 허브 · 드릴 화면 둘 |
| 빚 청산 | `Ruleset` 에서 데이터 필드 넷 제거 (ADR-003 이 미뤄 둔 것) |

### 왜 이 둘을 함께 만드나

**상호작용 형태가 정반대이기 때문이다.**

진행절차는 문제가 주어지지 않는다 — 팔레트에서 스스로 고른다. 러시 뼈대(`useRushRun`)를
쓸 수 없다. 로우 판독은 문제를 던진다 — 러시 뼈대를 그대로 쓴다.

둘이 같은 `GameSpec` 과 같은 원자를 공유하면서 화면 층에서 갈라지는 것,
그것이 격자가 동작한다는 증거다. **하나만 만들면 뼈대가 그 하나에 맞춰 굳는다.**

### 왜 PLO8 인가

**드릴 7종이 전부 해당되는 유일한 종목**이다(PRD §6). 팟리밋도 있고 로우도 있어서,
여기서 되면 나머지 종목은 부분집합이다.

**솔직히 적어 둔다**: PLO8 의 진행절차는 드릴 여섯 중 훈련 가치가 가장 낮다.
플랍게임은 절차가 단순하다. 그런데도 먼저 만드는 이유는 훈련이 아니라 **자기주도
상호작용이 격자 뼈대에서 되는지 증명하려는 것**이다. 스터드가 붙을 때 같은 코드가
21스텝을 그대로 돌려야 한다(PLO8 은 17스텝).

### 이번에 만들지 않는 것

| 안 만드는 것 | 어느 단계인가 |
|---|---|
| 팟리밋 금액 판단 | PRD §10 2단계 (팟리밋 드릴) |
| 하이 승자 판정 · 오마하 하이 문제 | 3단계 (보드보기 드릴) |
| 스플릿 · 홀칩 · `awardPots` 확장 | 2단계 (팟 분배 드릴) |
| 사고 · 항의 | 4단계 (딜링 룸) |
| 2-7 · 바두기 평가기 | 해당 종목을 붙일 때 |
| 기존 `lib/rush/` · `lib/action-rush/` 이동 | 옮기지 않는다 (§2) |
| 캔버스 · 2D/3D | 6단계 |

---

## 2. 경계 — 어디에 무엇을 두나

기존 구조를 따른다. **원자는 이미 `lib/simulator/` 에 살고 있으므로 경쟁하는
디렉터리를 새로 만들지 않는다.**

```
app/src/lib/
  simulator/               원자 — 조합할 수 없는 코드 [기존 위치]
    evaluate.ts              하이 평가기            [있음]
    pots.ts                  사이드팟·홀칩          [있음]
    lowball.ts               A-5 로우볼 평가기      * 신규
    omaha.ts                 2+3 강제 조합          * 신규
    rulesets/types.ts        판정 메서드만 남긴다   [데이터 필드 제거]

  games/                   데이터 — GameSpec 의 정본  * 신규
    types.ts                 GameSpec 타입
    plo8.ts                  PLO8 스펙 한 장
    drills.ts                drillsFor(spec) -> DrillId[]
    index.ts                 레지스트리 (GameId -> GameSpec)

  drills/                  드릴                      * 신규
    procedure/               진행절차 (자기주도)
      deal.ts · steps.ts · judge.ts · reduce.ts · types.ts
    lowreading/              로우 판독 (퀴즈)
      generate.ts · types.ts

  rush/ · action-rush/     기존 축 1·2 — 이번에 옮기지 않는다
```

**`lib/games/` 는 ADR-003 이 적은 `lib/mixgame/` 의 개정이다.** `GameSpec` 이
믹스게임만의 것이 아니라 격자 전체의 뼈대가 됐다(PRD §6-3).

**`lib/rush/` · `lib/action-rush/` 는 건드리지 않는다.** 격자 안의 칸이 됐지만
위치를 옮기면 333개 테스트가 걸리고 얻는 것이 없다. 홈에서 링크만 잇는다.

---

## 3. `GameSpec` — 데이터

프로토타입 `mix-room.html` 의 `SPECS.plo8` 을 옮기되 **세 곳을 고친다.**

### 3-1. 라벨을 한 자루에 가둔다

프로토타입은 `betting: 'PL'` 과 `bettingKo: '팟 리밋'` 이 나란히 있다.
판정 코드가 표시 라벨을 집는 사고가 실제로 났던 자리다.

```ts
type GameSpec = {
  id: GameId
  family: 'flop' | 'stud' | 'draw'
  betting: 'NL' | 'PL' | 'FL'        // 판정은 이것으로만 갈린다
  raiseCap: number | null            // FL 은 5, NL·PL 은 null
  holeCardCount: number
  forced: 'blinds' | 'ante+bringin'

  /** 표시 전용. 판정 코드는 이 안을 읽지 않는다 */
  labels: { ko: string; en: string; gameKo: string; familyKo: string; bettingKo: string }

  streets: Street[]
  eval: EvalSpec
}
```

라벨을 하위 객체로 몰면 `spec.bettingKo` 가 **타입 에러**가 된다.
규율을 문서가 아니라 컴파일러가 지킨다.

### 3-2. 카드가 어디로 몇 장 가는지를 한 필드로

프로토타입은 스터드에 `deal: { down, up }`, 플랍에 `board: 3` 으로 필드가 갈라져 있어
스텝 생성기가 그때마다 분기해야 한다.

```ts
type Street = {
  id: string                      // 'preflop' | 'flop' | 'turn' | 'river' | '3rd' ...
  labels: { ko: string; short: string }
  deal: { down: number; up: number; board: number }
  burn: boolean
  betting: boolean
  firstToAct: FirstToAct
  sizeMultiplier: 1 | 2           // FL 5번가 이후 2배. NL·PL 은 1
}

/** PLO8 은 앞의 둘만 쓴다. 나머지는 스터드·라즈가 붙을 때 구현한다 */
type FirstToAct =
  | 'left-of-bb'                  // 플랍게임 프리플랍
  | 'left-of-button'              // 플랍게임 플랍 이후
  | 'lowest-upcard'               // 스터드 3번가 — 브링인
  | 'highest-upcard'              // 스터드 4번가 이후
  | 'highest-upcard-by-suit'      // 스터드 하이로우 레귤러
  | 'lowest-hand'                 // 스터드 하이로우 레귤러 이후 라운드
```

**타입에 여섯을 다 적되 PLO8 이 쓰는 둘만 구현한다.** 나머지 넷은 `stepsFor` 에서
`never` 로 떨어져 컴파일이 막는다 — 스터드를 붙일 때 어디를 채워야 하는지가
타입 검사기에서 드러난다.

```
PLO8 프리플랍 = { down: 4, up: 0, board: 0 }
PLO8 플랍     = { down: 0, up: 0, board: 3 }
스터드 3번가  = { down: 2, up: 1, board: 0 }   <- 나중에 이 모양 그대로 들어온다
```

ADR-003 이 `deal: number` + `faceUp: boolean` 으로는 스터드 3번가를 표현하지 못한다고
이미 겪은 자리다(한 스트릿이 다운 2장과 업 1장을 동시에 내린다).
셋으로 늘리면 세 패밀리가 다 들어간다.

### 3-3. `eval` 이 격자의 `—` 를 만든다

```ts
type EvalSpec = {
  hi: 'standard' | null
  lo: { kind: 'a5' | '27' | 'badugi'; qualifier: 8 | null } | null
  mustUse: { hole: 2; board: 3 } | null      // 오마하 강제 조합
}
```

PLO8 = `{ hi: 'standard', lo: { kind: 'a5', qualifier: 8 }, mustUse: { hole: 2, board: 3 } }`

그리고 이것이 PRD §6 격자표를 **손으로 관리하지 않게** 만드는 함수다.

```ts
// lib/games/drills.ts
export type DrillId =
  | 'procedure' | 'boardreading' | 'potlimit'
  | 'potaward' | 'lowreading' | 'incident' | 'action'

export function drillsFor(spec: GameSpec): DrillId[]
//   'lowreading'  <=>  spec.eval.lo !== null
//   'potlimit'    <=>  spec.betting === 'PL'
//   나머지 다섯은 모든 종목에 있다
```

홈 화면의 `n/m` 과 종목 허브의 목록이 전부 여기서 나온다.
**종목을 추가하면 격자표가 저절로 늘어난다.**

> **`raiseCap` 을 지금 넣는 것에 대하여**: PLO8 은 `null` 이라 이번에 쓰이지 않는다.
> PRD §6-3 함정 1("쓰이지 않는 필드는 검증되지 않은 채 굳는다")에 걸린다.
> 그래도 넣는 이유는 `betting: 'FL'` 과 짝이라 **타입 수준에서 함께 있어야 의미가 서기**
> 때문이다. 다만 **값을 읽는 코드는 이번에 쓰지 않는다** — 픽스리밋 종목이 붙을 때 읽는다.

---

## 4. 원자

### 4-1. 로우볼 평가기 — A-5 하나만 만든다

PRD 는 "평가기 2종이면 충분하다"고 하지만 이번에 만드는 것은 **A-5 하나**다.
2-7 은 2-7 트리플드로를 붙일 때 만든다 (PRD §6-3 함정 1).

```ts
// lib/simulator/lowball.ts
type LowRank = { key: number[]; cards: Card[] }

/** 정확히 5장. 에이스 최저, 스트레이트·플러시 무시. 5-4-3-2-A 가 최고 */
export function evaluateLowA5(five: Card[]): LowRank
export function compareLow(a: LowRank, b: LowRank): number   // 낮을수록 강하다
```

### 4-2. 오마하 조합기

```ts
// lib/simulator/omaha.ts
export function omahaCombos(hole: Card[], board: Card[]): Card[][]   // 4C2 × 5C3 = 60
export function bestOmahaHi(hole: Card[], board: Card[]): HandRank
export function bestOmahaLow(hole: Card[], board: Card[], qualifier: 8): LowRank | null
```

**둘을 가른 이유**: `lowball` 은 다섯 장을 평가하고 `omaha` 는 어느 다섯 장을 쓸지 고른다.
스터드8 은 `omaha` 없이 `lowball` 만 쓰고(일곱 장 중 아무 다섯), 라즈도 그렇다.
붙여 두면 스터드에 오마하 조합기가 딸려온다.

**`null` 이 중요하다.** PLO8 은 보드에 8 이하가 3장 없으면 로우가 아예 불가능하다.
이것이 로우 판독 드릴의 첫 문제 유형이 된다.

프로토타입의 `evalLowA5` · `bestLowA5` · `omahaCombos` · `cmpKey` 를 TS 로 옮긴다.
판정 관례는 기존 `compareHands` 를 따른다.

---

## 5. 진행절차 드릴 — 자기주도

### 5-1. 핸드를 딜 전에 통째로 만든다

```ts
// lib/drills/procedure/deal.ts
export function dealHand(spec: GameSpec, seed: string): HandScript

type HandScript = {
  buttonSeat: number
  blinds: { sb: number; bb: number }
  /** 좌석마다 받을 카드. 스트릿 순서대로 이미 뽑혀 있다 */
  seats: { hole: Card[]; stack: number }[]
  /** 보드에 깔릴 카드. 스트릿 id 로 찾는다 */
  board: Record<string, Card[]>
  /** 이 스트릿의 베팅에서 좌석들이 무엇을 했는가. 재생만 한다 */
  betting: Record<string, { seat: number; act: 'check' | 'call' | 'bet' | 'raise' | 'fold'; to: number }[]>
}
```

`HandScript` 에는 카드뿐 아니라 **각 라운드에서 누가 무엇을 했는지까지** 들어 있다.
리듀서는 그것을 **드러내기만** 한다.

> 프로토타입의 `fixTies` 는 카드가 착지한 **뒤에** 업카드를 바꾼다 — 화면에 뜬 카드가
> 다른 카드로 바뀐다. 먼저 만들면 그 결함이 원천 봉쇄된다.
> `lib/rush/deal.ts` 가 이미 그 본보기다.

**시드 결정론**: `lib/simulator/rng.ts` 의 `createRng(seed)` 를 주입한다.
**생성기 안에서 `Math.random()` 을 한 번이라도 쓰면 시드가 무의미해진다** — 그 파일 주석의 경고다.
시드 형식은 `lib/rush/seed.ts`.

봇은 쓰지 않는다. 베팅 액션은 `HandScript` 에 이미 들어 있고,
「베팅 진행」을 누르면 그 라운드가 재생된다.

### 5-2. 팔레트는 늘 일곱이다

```
앤티 수거 · 블라인드 수거 · 번카드 · 카드 딜 · 카드 교체 · 베팅 진행 · 팟 지급
```

PLO8 에 앤티 수거와 카드 교체가 해당 없어도 **화면에 남는다.**
무엇이 이 종목에 해당 없는지 아는 것이 훈련이기 때문이다.
상황마다 보기가 바뀌면 4지선다가 된다.

**「첫 순서 지목」은 팔레트에 없다.** 딜러가 "이제 라운드를 열겠다"고 선언하는 것이 아니라
카드가 다 나가면 그 순간이 저절로 온다.

### 5-3. 스텝은 `GameSpec` 에서 나온다

```ts
// lib/drills/procedure/steps.ts
export function stepsFor(spec: GameSpec): Step[]
```

```
forced -> 각 스트릿마다 [burn] -> deal|draw -> open -> betting -> payout
```

PLO8 = **17스텝**:

```
블라인드
프리플랍: 딜 · 첫순서 · 베팅
플랍:     번 · 딜 · 첫순서 · 베팅
턴:       번 · 딜 · 첫순서 · 베팅
리버:     번 · 딜 · 첫순서 · 베팅
팟 지급
```

### 5-4. 상태는 넷이다

```ts
type Phase = 'palette' | 'openSeat' | 'anim' | 'done'

type ProcedureState = {
  spec: GameSpec
  script: HandScript          // 딜 전에 만들어진 것. 절대 바뀌지 않는다
  steps: Step[]               // stepsFor(spec) 의 결과
  at: number                  // 지금 몇 번째 스텝인가
  phase: Phase
  stuck: number               // 순서를 어긴 횟수
  hint: string | null         // 어겼을 때 무엇이 먼저인지 한 줄
  table: TableView            // 지금까지 드러난 것만. 화면이 그대로 그린다
}

type ProcedureAction =
  | { type: 'palette'; act: PaletteAct }   // 팔레트 일곱 중 하나
  | { type: 'seat'; seat: number }         // 첫 순서 지목
  | { type: 'animEnd' }
```

| 상태 | 무엇을 기다리나 |
|---|---|
| `palette` | 팔레트에서 다음 행동 |
| `openSeat` | 첫 순서 좌석 클릭 (프리플랍=BB 왼쪽, 이후=버튼 왼쪽) |
| `anim` | 카드·칩이 날아가는 중 |
| `done` | 완주 — 막힘 횟수를 보여준다 |

**프로토타입의 일곱에서 셋이 빠진 것은 드릴 경계다.**
벳 크기(`popenbet`)는 팟리밋 드릴이고, 쇼다운·승자(`pwin`·`pchoice`·`ptarget`)는
보드보기와 팟 분배 드릴이다. 진행절차가 묻는 것은
**"지금 무엇을 할 차례인가"와 "누가 먼저인가"** 둘뿐이다.

「팟 지급」팔레트를 누르면 승자를 묻지 않고 지급하고 완주한다.
승자가 누구인지는 엔진이 알지만 이 드릴은 묻지 않는다.

### 5-5. 판정은 함수 하나로 모은다

```ts
// lib/drills/procedure/judge.ts
export function judge(state: ProcedureState, action: ProcedureAction):
  | { ok: true }
  | { ok: false; hint: string }
```

프로토타입은 `onPSeat` · `onPChoice` · `onPBet` · `onPAmount` 가 각각
`i !== P.ask.answer` 로 직접 비교한다. **판정 함수 하나로 모은다 — 레포 제1원칙이다.**

틀렸을 때 **가리지 않는다.** 무엇이 먼저인지 한 줄로 말해 준다 — 연습이기 때문이다.
(프로토타입 `pDeny` 의 문장을 옮긴다.)

### 5-6. 리듀서는 순수하고 불변이다

```ts
// lib/drills/procedure/reduce.ts
export function reduce(state: ProcedureState, action: ProcedureAction): ProcedureState
```

프로토타입은 전역 가변 `H` · `G` · `P` · `PHASE` 를 함수들이 직접 뮤테이트한다.
앱에서는 리듀서 하나가 새 상태를 돌려준다. 스프레드로 만들고 절대 뮤테이트하지 않는다.

---

## 6. 로우 판독 드릴 — 퀴즈

문제 3종. 정답은 전부 `bestOmahaLow` 가 낸다.

| 유형 | 묻는 것 | 답 형태 |
|---|---|---|
| `lo-possible` | 이 보드에 로우가 성립하나 | 예 / 아니오 |
| `lo-qualified` | 로우 자격이 있는 좌석은 | 좌석 복수 선택 |
| `lo-best` | 로우 승자는 | 좌석 하나 |

**러시 뼈대를 그대로 쓴다.** `RushScreen` + `useRushRun` 에 문제 화면 한 장만 끼운다 —
타이머·점수·연속·최고 기록이 공짜로 따라오고, 축 1·2 가 이미 그렇게 돌고 있다.

- 최고 기록 키: `plo8.lowreading.best` (`<gameId>.<drillId>.best` 규약)
- 기존 키 `potrush.best` · `actionrush.best` · `mixdeal.best` · `mixroom.best` 는 **지우지 않는다**
- 정답 판정은 페이지가 한다 — `RushScreen` 이 문제 타입을 알기 시작하면 축이 늘 때마다 뼈대가 부푼다

---

## 7. 화면과 라우트

| 경로 | 화면 |
|---|---|
| `/` | 종목 목록 — 패밀리별로 묶고 `n/m` 을 보여준다 |
| `/games/plo8` | 종목 허브 — `drillsFor` 가 낸 드릴 목록 |
| `/games/plo8/procedure` | 진행절차 |
| `/games/plo8/low-reading` | 로우 판독 |
| `/rush` · `/action-rush` · `/simulator` | **그대로 둔다.** 홈이 노리밋 홀덤 칸에서 링크한다 |

```
components/
  games/
    GameList.tsx        홈 — 패밀리별 종목 목록
    DrillList.tsx       종목 허브 — 드릴 목록과 잠금 표시
  drills/
    procedure/
      ProcedureScreen.tsx · Palette.tsx · ProcedurePanel.tsx
    lowreading/
      LowQuestionPanel.tsx
  table/                기존 — TableView 로 좁힌다 (아래)
```

### `PokerTable` 을 `HandState` 에서 떼어낸다

`PokerTable` 은 `state: HandState` 를 받는다. `HandState` 는 노리밋 홀덤 시뮬레이터의
타입인데, 진행절차는 핸드를 `HandState` 로 시뮬레이션하지 않는다(ADR-003 결정 3).

`PokerTable` 이 실제로 읽는 것만 추린 `TableView` 를 두고 `HandState` 가 그것을 만족하게 한다.
좁히는 변경이라 **기존 호출부는 그대로다.**

```ts
type TableView = {
  seats: { hole: Card[]; bet: number; folded: boolean; stack: number }[]
  buttonSeat: number
  board: Card[]
  pot: number
}
```

`Seat` 은 `seat.hole.map(...)` 이라 4장도 그대로 그린다. 폭은 실제 화면에서 확인한다(§9-3).

**스터드의 업/다운 구분과 보드 없는 테이블은 이번 범위 밖이다.** PLO8 은 플랍게임이라
지금 구조로 그려진다. 스터드가 붙을 때 `TableView` 를 넓힌다.

---

## 8. ADR-003 개정

이 문서가 ADR-003 의 두 곳을 고친다. ADR-003 에 개정 메모를 단다.

| ADR-003 이 적은 것 | 이 문서의 결정 | 이유 |
|---|---|---|
| 새 디렉터리 `lib/mixgame/` | **`lib/games/`** | `GameSpec` 이 믹스게임만의 것이 아니라 격자 전체의 뼈대가 됐다 (PRD §6) |
| `deal: { down, up }` | **`deal: { down, up, board }`** | 플랍게임의 보드 카드를 같은 필드로 담는다. 스텝 생성기의 분기가 사라진다 |

**유효한 채로 남는 것**:

- 결정 1 — `GameSpec` 이 데이터의 정본, `Ruleset` 은 판정 메서드만. **이번에 실행한다**
- 결정 2 — `Street` 타입을 넓히지 않는다. PLO8 은 `preflop|flop|turn|river` 라 기존 타입에 맞는다
- 결정 3 — 평가기를 필요할 때 만든다. 이번에 A-5 만 만든다

---

## 9. 검증

### 9-1. 단위 테스트 (TDD — 테스트 먼저)

| 대상 | 확인하는 것 |
|---|---|
| `evaluateLowA5` | 5-4-3-2-A 가 최고 · 스트레이트/플러시 무시 · 페어는 로우가 아님 |
| `compareLow` | 두 로우의 순서. 자료의 알려진 핸드로 검증 |
| `omahaCombos` | 조합 수 정확히 60 · **홀 2장 + 보드 3장 강제**가 깨지지 않음 |
| `bestOmahaLow` | 보드에 8 이하 3장이 없으면 `null` · 자격 미달이면 `null` |
| `drillsFor` | PLO8 = 7종 · 노리밋 홀덤에 `potlimit`·`lowreading` 없음 |
| `stepsFor(plo8)` | **17스텝** · 순서가 `블라인드 -> … -> 팟 지급` |
| `judge` | 순서를 어기면 `ok: false` 와 힌트 · 맞으면 진행 |
| `reduce` | 틀리면 `stuck++` 하고 스텝이 **안 나간다** · 입력 상태를 뮤테이트하지 않는다 |
| `dealHand` | **같은 시드 = 같은 핸드** (시드 결정론) |

### 9-2. 한 핸드 통째 추적 — 이 검사가 결함 다섯을 잡았다

정답으로 완주시키며 로그를 전부 찍고 **최종 팟 == 블라인드 + 라운드마다 수거한 금액의 합**
을 검사한다. 금액이 새거나 두 번 세어지면 여기서 깨진다.

**화면 한 장만 봐서는 안 된다.** 프로토타입의 결함 다섯 중 넷은 화면이 멀쩡했고
**로그 두 줄 사이**가 어긋나 있었다.

### 9-3. 브라우저에서 눈으로 본다

`npx playwright` 로 직접 돌린다. **MCP 는 이 머신에서 연결 실패한다.**

- 홈 -> PLO8 -> 진행절차 -> 한 핸드 완주
- 홀카드 4장이 좌석 상자를 넘치지 않는가 (모바일 폭 360px 포함)
- 로우 판독 10문제 완주

### 9-4. 기준선

**`cd app && npx vitest run` -> 26파일 / 333개 통과** (2026-09-04 실측).
이식 뒤에도 이 숫자 아래로 내려가면 안 된다.

### 9-5. 재미 게이트 (PRD §3)

사람이 직접 한 세션을 끝까지 플레이하고 세 문항에 답한다.
로우 판독은 세 문항 그대로, 진행절차는 제한시간이 없으므로 3번 대신
**"막힘 힌트가 답을 너무 알려주지는 않는가"** 로 바꿔 묻는다.

---

## 10. 이 레포에서 반드시 지킬 것

1. **정답은 엔진이 낸다.** 화면 코드에 규칙 판정을 쓰지 마라. 쓰고 싶어지면 엔진이 부족한 것이다
2. **자료에 없는 것을 짐작으로 채우지 마라.** 없으면 사용자에게 묻고, 답을 받으면
   출처를 `사용자 확인 (날짜)` 로 적어라
3. **실제 브라우저에서 눈으로 봐라.** 렌더·플레이로만 잡히는 결함이 매번 나온다
4. **완료는 실행 출력으로만 주장한다**
5. **말투를 검사하라.** 영어 직역·번역투가 계속 새어 나왔다. 지문을 전부 뽑아 읽어라.
   이름 뒤 조사는 붙여 쓴다(`4번이다`), 명령형은 「…하세요」로 통일한다
6. **칩 드래그를 되살리지 마라** — 사용자가 버렸다

---

## 11. 남은 위험

| 위험 | 어떻게 다루나 |
|---|---|
| 홀카드 4장이 좌석 상자를 넘칠 수 있다 | §9-3 브라우저 확인. 넘치면 `Seat` 의 카드 폭을 장수로 나눈다 |
| PLO8 진행절차의 훈련 가치가 낮다 | 알고 시작한다(§1). 재미 게이트에서 드러나면 스터드를 먼저 붙인다 |
| `raiseCap` 이 이번에 쓰이지 않는다 | 필드는 두되 **읽는 코드를 쓰지 않는다**(§3-3) |
| 진행절차에 기록을 붙일지 미정 | PRD §11 의 열린 질문. **실제로 돌려 본 뒤에** 판단한다 |
