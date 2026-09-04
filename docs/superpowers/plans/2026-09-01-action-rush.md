# 액션 판정 러시 구현 계획 (축 2)

- **날짜**: 2026-09-01
- **상태**: **구현 완료 (2026-09-01)** — 검증 결과는 맨 아래 §13
- **정본 설계**: [2026-09-01-action-rush-design.md](../specs/2026-09-01-action-rush-design.md) — 어긋나면 설계가 이긴다
- **참조 구현**: `../prototypes/action-rush.html` (문제 설계와 화면 구성만. 규칙 판정은 안 가져온다)

---

## 0. 결론 먼저

프로토타입에서 재미가 확인된 액션 판정 러시를 앱으로 옮긴다. **규칙 판정은 한 줄도
옮기지 않는다.** 다만 축 1 과 결정적으로 다른 점이 하나 있다 —

> **엔진을 먼저 고친다.** 다섯 유형 중 둘(베팅 기회 재개 · 순서 위반)은 지금 엔진이
> 답할 수 없다. 하나는 규정과 어긋나 있고 하나는 개념 자체가 없다.
> 러시 코드를 한 줄 쓰기 전에 엔진부터 규정에 맞춘다.

설계 §12 가 계획서로 넘긴 세 가지, 코드를 읽고 정했다:

| 미결정 | 결정 | 근거 |
|---|---|---|
| `record.ts` 키 파라미터화 형태 | **최고점만 팩토리화**(`createBestRecord(key)`). 음소거는 공유 유지 | §4 |
| `QuestionPanel` · `ResultPanel` 재사용 | `ResultPanel` **재사용**(라벨을 prop 으로), `QuestionPanel` **신규** | §5 |
| 홈 화면 진입 카드 | `⚖️ 액션 판정 러시 · 규정 조항으로 판정한다` → `/action-rush` | §6 |

---

## 1. 엔진 수정 A — 리오픈을 누적으로 (제35조 4항)

### 지금 코드

```ts
// lib/simulator/rulesets/types.ts
canRaise: boolean          // ← 호출부가 계산해서 넣어준다

// lib/simulator/generate.ts:151
canRaise: !actedSinceFullRaise.has(seat)
```

### 바꿀 코드

```ts
// types.ts — 필드 교체
/** 이 좌석이 이번 베팅 라운드에 이미 액션했는지. 리오픈 판정의 입력이다 (제35조 4항) */
hasActedThisRound: boolean

// nlh.ts — 규칙을 룰셋 안으로
canReopen(ctx: BettingContext): boolean {
  if (!ctx.hasActedThisRound) return true
  // "직면한 총 베팅 증가액" — 그 좌석이 마지막 액션에서 남긴 벳이 seatBet 이다
  return ctx.currentBet - ctx.seatBet >= Math.max(ctx.lastRaiseSize, ctx.bigBlind)
}
```

`validateAction` 의 `bet`/`raise`/`allin` 세 분기에서 `!ctx.canRaise` → `!this.canReopen(ctx)`.
`generate.ts` 는 `actedSinceFullRaise` 집합을 버리고 이미 있는 `acted` 집합을 넘긴다.

### 이 수정은 권리를 **넓히기만** 한다 — 증명

- 옛 규칙이 참 = "마지막 풀 레이즈 이후 액션한 적 없다"
- 그 경우 새 규칙도 참이다:
  - 이번 라운드에 아예 액션한 적 없으면 → `!hasActedThisRound` → 참
  - 액션했지만 그 뒤 풀 레이즈가 있었다면 → 직면한 증가액 ≥ 그 풀 레이즈 폭 ≥ 유효 최소 폭 → 참

**옛 참 ⟹ 새 참.** 따라서 기존 테스트가 "이 액션은 유효하다"고 주장하는 것 중
새로 무효가 되는 것은 **없다.** 반대 방향(옛 거짓 → 새 참)이 곧 규정이 요구하는
확장이고, 설계 §5.1 의 갈라지는 사례다.

### 기존 테스트에 생기는 변화 — 정직하게 적는다

"297 테스트 그대로 통과"는 **어서션이 그대로**라는 뜻이지 파일이 안 바뀐다는 뜻이 아니다.

| 파일 | 변화 | 성격 |
|---|---|---|
| `nlh.test.ts:7` · `reduce.raise.test.ts` · `nlh.exam.test.ts:55` | `canRaise: true` → `hasActedThisRound: false` | 기계적 이름 교체 |
| `nlh.test.ts:208, 225` | `canRaise: false` → `hasActedThisRound: true` | 새 규칙으로 계산해도 같은 결과(직면 100 < 폭 1,000)임을 확인했다 |
| **`nlh.test.ts:217`** | 픽스처 숫자 조정 필요 | ⚠️ 아래 |
| `generate.rules.test.ts:63` · `integration.test.ts:218` | 테스트 안의 `actedSinceFullRaise` 사본 제거 → `acted` 집합 | 사본 제거 |

⚠️ `nlh.test.ts:217` (`currentBet: 8000, seatBet: 0, canRaise: false`) 는 새 규칙으로
계산하면 직면 증가액 8,000 ≥ 200 이라 **리오픈이 열린다.** 어서션 자체는 여전히
통과하지만(콜 금액 이하 올인은 어차피 합법), 그러면 그 테스트가 주장하는
"리오픈이 닫혔어도"라는 전제가 사라진다. **픽스처를 리오픈이 실제로 닫힌 숫자로
고친다** — 통과한다고 놔두면 테스트가 이름과 다른 것을 검사하게 된다.

### 함께 고치는 주석

`types.ts` 의 "이 리오픈 규칙에는 조항 번호 근거가 아직 없다"와 `nlh.ts:101` 의
"조항 번호는 미검증이다" — **근거는 WINNABLE 제35조 4항이다.** 근거가 없던 게 아니라
규칙이 틀렸던 것이다. `REOPEN_CLOSED` 문구도 규정 표현으로 바꾼다.

### 알려진 위험 하나

봇의 레이즈 권리가 넓어지므로 **같은 시드가 다른 핸드를 만든다.** `generate.test.ts` 는
전부 불변식 검사(스택 보존·팟 0·칩 단위·결정성)라 영향이 없어야 하지만, 특정 시드가
특정 성질을 갖는다고 가정한 테스트가 뒤집힐 수 있다(예: `dps.some(d => d.kind === 'procedure')`).

**뒤집히면 규칙이 아니라 테스트를 고친다** — 단, 먼저 그 시드의 새 핸드가 정말
합법인지 확인하고, 성질을 보이는 다른 시드로 바꾼 뒤 왜 바꿨는지 주석에 남긴다.
규칙 쪽을 되돌려 테스트를 맞추는 것은 금지다.

---

## 2. 엔진 수정 B — 순서 위반 (제27조 2·3항)

`lib/simulator/rulesets/procedure.ts` **신규**. `Ruleset` 인터페이스에 얹지 않는 이유는
설계 §5.2 에 있다 (종목 무관 절차 규칙이라 룰셋마다 복제된다).

```ts
export type OutOfTurnAction = 'fold' | 'check' | 'call'
export type ProperAction = 'fold' | 'check' | 'call' | 'bet' | 'raise'

export type OutOfTurnRuling =
  | { binding: true; reason: string }
  | { binding: false; reason: string }

export function resolveOutOfTurn(
  outOfTurn: OutOfTurnAction,
  proper: ProperAction,
): OutOfTurnRuling
```

판정 순서는 규정 순서 그대로:

1. **순서를 어긴 폴드는 언제나 구속력을 가진다.** 본래 순서 플레이어가 무엇을 하든 무관
2. 본래 순서 플레이어가 `bet` 또는 `raise` → 베팅 상황이 **변경됨** → 구속력 없음
3. 그 외(`fold`·`check`·`call`) → 상황이 변하지 않음 → **구속력 있음**

테스트는 **3 × 5 = 15 조합 전수**. 표로 기대값을 적고 전부 대조한다.

---

## 3. 러시가 엔진에서 답을 꺼내는 방법 — 유형별

이 축의 핵심 기법은 **액션 연쇄를 리듀서에 실제로 통과시키는 것**이다 (설계 §6).
`nlh.exam.test.ts` 가 이미 쓰는 방식이고, 시험 6·7번 정답을 그 방식으로 맞혔다.

`lib/action-rush/chain.ts`:

```ts
/** 프리플랍 레이즈 연쇄를 리듀서로 재생하고, 그 상태에서 컨텍스트를 뽑는다. */
export function replayPreflop(bb: number, wagers: Wager[], rng: Rng): {
  state: HandState
  rows: LogRow[]          // 화면에 보여줄 액션 로그
  ctxFor(seat: number): BettingContext
}
```

**생성기는 얼마를 베팅할지만 고른다.** `lastRaiseSize` 갱신·풀레이즈 판정은 전부
리듀서가 한다. 프로토타입의 `makeChain` 이 손으로 세던 값은 앱에 오지 않는다.

| 유형 | 정답을 내는 호출 | 화면이 묻는 것 |
|---|---|---|
| 최소 레이즈 | `nlh.minRaiseTo(ctxFor(next))` | 숫자 입력 |
| 재개 | `nlh.canReopen(ctxFor(hero))` | 2지 선다 |
| 오버사이즈 | `nlh.interpretChipPush(ctx, chip, declared, [chip])` | 2~3지 선다 |
| 다중 칩 | `nlh.interpretChipPush(ctx, total, 'none', chips)` | 3지 선다 |
| 순서 위반 | `resolveOutOfTurn(oot, proper)` | 2지 선다 |

**다중 칩의 세 갈래를 엔진이 가르게 하는 방법**: `콜`/`레이즈 시도`/`올인` 의 차이는
"가장 작은 칩 하나를 빼면 콜에 미달하는가"와 "밀어낸 칩이 스택 전부인가"다. 후자는
`seatStack` 으로 조절한다 — `seatStack === pushedTotal` 이면 엔진이 `allin` 을,
남으면 `raise` 를 돌려준다. 생성기는 **상황만 세우고 라벨은 엔진에게 묻는다.**

**오버사이즈의 "선언이 최소 레이즈를 강제한다"도 엔진에 이미 있다**:
`interpretChipPush` 의 `declared === 'raise'` 분기가
`Math.max(wagerTo, this.minRaiseTo(ctx))` 를 돌려준다. 프로토타입이 손으로 계산한
`minRaiseTo` 는 안 가져온다.

### 생성 불변식 (전부 엔진에 물어서 확인한다)

| 불변식 | 확인 방법 |
|---|---|
| 짧은 올인은 폭에 미달해야 한다 | `isFullRaise(before, newBet) === false` — 아니면 그 판 폐기 |
| 오픈 벳 ≥ 빅블라인드 (제35조 1항) | 오버사이즈·다중 칩은 **플랍**으로 낸다 |
| 오버사이즈 선택지 금액이 안 겹친다 | `chip !== minRaiseTo` — 같으면 폐기 |
| 재개 정답이 한쪽으로 안 쏠린다 | 1,000판 생성 후 분포 검사 (양쪽 ≥ 10%) |

무작위는 `createRng(seed)` 하나에서만. 재시도 상한·시드 범프는 축 1
`lib/rush/generate.ts` 구조를 그대로 쓴다.

---

## 4. 기록 — 최고점만 팩토리화한다

`lib/rush/record.ts` 는 `BEST_KEY = 'potrush.best'` · `MUTED_KEY = 'potrush.muted'` 를
모듈 상수로 들고 있다.

**최고점은 축마다 달라야 한다.** 두 축은 점수대가 달라 한 키를 공유하면 한쪽 최고점이
다른 쪽을 영원히 덮는다. **음소거는 공유가 맞다** — 소리를 끄는 사람은 한 사람이고,
축마다 따로 끄게 만들면 그게 결함이다.

```ts
export function createBestRecord(key: string): {
  readBest(): number
  saveBest(score: number): boolean
  useBest(): number
}

// 기존 export 는 팩토리 호출로 유지 — 축 1 호출부는 한 줄도 안 바뀐다
export const { readBest, saveBest, useBest } = createBestRecord('potrush.best')
// 음소거는 지금 그대로 모듈 레벨
```

축 2 는 `createBestRecord('actionrush.best')`. **프로토타입이 이미 그 키를 썼으므로
프로토타입에서 세운 기록이 앱으로 이어진다.** 그 전에 지우지 마라.

---

## 5. 화면 — 무엇을 재사용하고 무엇을 새로 쓰나

코드를 읽고 내린 결론이다.

| 대상 | 결정 | 근거 |
|---|---|---|
| `lib/rush/score.ts` | **재사용** — `RunState<K extends string>` 로 제네릭화 | 점수 공식은 정본이 하나여야 한다. 지금 `byKind` 가 축 1 의 `RushKind` 에 묶여 있는 것이 유일한 걸림돌이고, 타입 수준 변경이라 런타임 동작이 안 바뀐다 |
| `lib/rush/sound.ts` | **그대로 재사용** | 축 의존성이 없다 |
| `components/rush/ResultPanel.tsx` | **재사용** — `labels: Record<string, string>` prop 추가 | `KIND_LABEL[kind]` 하나만 축에 묶여 있다. 축 1 은 `labels={KIND_LABEL}` 을 넘긴다 |
| `components/rush/rush.module.css` | **공유한다.** 축 2 전용 클래스는 이 파일에 추가 | 두 프로토타입을 이미 같은 5열 그리드로 통일해 둔 상태다. 복사하면 스타일 정본이 둘이 된다 |
| `components/rush/QuestionPanel.tsx` | **재사용하지 않는다** | `RushQuestion` 유니온에 직접 분기하고 입력이 "좌석 클릭 / 팟 금액칸" 둘뿐이다. 축 2 는 선다형 버튼 · 조항 패널 · 액션 로그가 필요하다. 억지로 합치면 두 축의 분기가 한 파일에서 엉킨다 |
| `components/rush/RushTable.tsx` | **재사용하지 않는다** | 같은 이유 — `RushQuestion` 에 묶여 있고 카드·팟 중심이다. 축 2 는 카드가 없고 액션 라벨·밀어낸 칩·hero 강조가 필요하다 |

### 축 2 화면 구성 (프로토타입에서 확정된 것)

```
[유형 배지 · 3/10]          [남은시간]  [점수]
[━━━━━━━━━ 타이머 바 ━━━━━━━━━]
지문 — hero 를 강조해서
┌ 액션 로그 ─────────────────┐   ← 최소레이즈·재개는 이걸 읽어야 풀린다
│ UTG    RAISE   4,700       │
│ UTG+1  RAISE  13,500       │
│ MP     ALL IN 18,000       │
└────────────────────────────┘
[ 테이블 — 좌석에 액션 라벨과 칩, hero 강조 ]
[ 채점 후: 판정 + 근거 + ▣ 조항 패널 (번호 + 원문) ]
[ 입력: 숫자칸 또는 선다형 버튼 ]
```

**딜러 버튼은 그리지 않는다.** 좌석 배열이 SB 부터라 버튼이 배열 밖에 있고, 이 다섯
유형의 정답은 버튼과 무관하다. 자리를 지어내면 틀린 것을 가르친다 (설계 §8).

---

## 6. 파일 배치

```
── 엔진 (수정) ────────────────────────────────
lib/simulator/rulesets/types.ts          canRaise → hasActedThisRound
lib/simulator/rulesets/nlh.ts            canReopen 추가 · 거절 문구 · 주석 근거
lib/simulator/rulesets/procedure.ts      ★신규 제27조
lib/simulator/rulesets/procedure.test.ts ★신규 15조합 전수
lib/simulator/rulesets/nlh.reopen.test.ts ★신규 누적 규칙 (Red-Green)
lib/simulator/generate.ts                actedSinceFullRaise 제거
lib/simulator/index.ts                   procedure 재수출

── 공용 (수정) ────────────────────────────────
lib/rush/score.ts                        RunState<K> 제네릭화
lib/rush/record.ts                       createBestRecord 팩토리
components/rush/ResultPanel.tsx          labels prop
components/rush/rush.module.css          축 2 클래스 추가
app/rush/page.tsx                        위 변경에 맞춘 호출부 수정

── 축 2 (신규) ────────────────────────────────
lib/action-rush/types.ts                 문제 타입 · 제한시간 · 배분
lib/action-rush/articles.ts              조항 번호 + 원문
lib/action-rush/chain.ts                 액션 연쇄 재생
lib/action-rush/generate.ts              진입점
lib/action-rush/questions/minraise.ts
lib/action-rush/questions/reopen.ts
lib/action-rush/questions/oversize.ts
lib/action-rush/questions/multichip.ts
lib/action-rush/questions/outofturn.ts
components/action-rush/ActionTable.tsx
components/action-rush/ActionLog.tsx
components/action-rush/ArticlePanel.tsx
components/action-rush/ActionQuestionPanel.tsx
app/action-rush/page.tsx
app/page.tsx                             진입 카드 활성화
```

**`reduce.ts` · `pots.ts` · `evaluate.ts` 는 건드리지 않는다.** 고쳐야 할 이유가 보이면
멈추고 설계를 다시 본다.

---

## 7. 단계와 검증 (단계마다 실행 출력으로 확인)

| 단계 | 내용 | 그 자리에서 실행할 검증 |
|---|---|---|
| 1 | **엔진 A** — 갈라지는 사례 테스트 **먼저**(Red 확인) → `canReopen` 구현 → Green | `npm test` — Red 출력과 Green 출력 둘 다 남긴다 |
| 2 | 엔진 A 여파 정리 — 픽스처 이름 교체 · `nlh.test.ts:217` 숫자 조정 · 테스트 안 사본 제거 | `npm test` (297 + 신규 전부) |
| 3 | **엔진 B** — `procedure.ts` + 15조합 전수 | `npm test` |
| 4 | 공용 인프라 — `score.ts` 제네릭 · `record.ts` 팩토리 · `ResultPanel` labels | `npm test` · `npm run typecheck` (축 1 무회귀) |
| 5 | 축 2 타입 · 조항 · `chain.ts` | `npm test` |
| 6 | 생성기 5종 + 유형별 1,000판 대조 + 분포 검사 | `npm test` |
| 7 | 화면 컴포넌트 4종 + `page.tsx` + 홈 진입 | `npm run build` |
| 8 | 렌더 검증 (§8) | dev 서버에서 10문제 완주 · 360/560px |
| 9 | 마무리 | `npm test` · `typecheck` · `lint` · `build` 전부 |

커밋은 단계마다. 메시지는 `<type>: <설명>` 한국어, **왜 그렇게 했는지**를 적는다.
**push 와 PR 은 하지 않는다** (명시 요청 없음).

---

## 8. 렌더 검증 — 실제 브라우저로 눈으로 본다

축 1 에서 **렌더로만 잡힌 결함이 다섯**이었다. 정적 검사로는 안 잡힌다.

- 10문제를 끝까지 실제로 푼다. 5종이 각 2번 나오는지 센다
- **360px** 가로 넘침 0 · **560px** 정상
- 액션 로그가 길어질 때(레이즈 4연쇄 + 올인 2) 테이블을 밀어내지 않는지
- 조항 패널 원문이 잘리지 않는지 — 제35조 4항이 가장 길다
- 채점 전에 정답이 새지 않는지 (선다형 버튼 순서·툴팁·DOM 속성)
- 타이머 0 도달 시 시간초과 판정이 한 번만 나는지

---

## 9. 완료 기준 (전부 실행 출력으로 증명한다)

- [ ] `npm test` — 기존 297 테스트의 **어서션이 그대로 통과** + 축 2 테스트 통과
- [ ] `npm run typecheck` · `npm run lint` · `npm run build` 통과
- [ ] 설계 §5.1 갈라지는 사례가 **수정 전 실패 → 수정 후 통과** (Red-Green 출력 둘 다)
- [ ] 시험 6·7번이 여전히 24,800 · 35,500
- [ ] `resolveOutOfTurn` 15조합 전수 통과
- [ ] 생성기 5종 각 1,000판 → 엔진 재계산과 일치 · 불변식 위반 0 · 재개 분포 양쪽 ≥ 10%
- [ ] 10문제 완주 · 5종 각 2문제 · 결과 집계 정확 · 기록이 재방문에 살아 있음
- [ ] 조항 패널이 다섯 유형 모두 올바른 조항을 보여준다
- [ ] 360px · 560px 렌더 확인
- [ ] 축 1 (`/rush`) 이 수정 후에도 정상 동작 (공용 파일을 건드렸으므로 직접 확인)

---

## 10. 안 건드리는 것

- `lib/simulator/reduce.ts` · `pots.ts` · `evaluate.ts` · `cards.ts` · `rng.ts`
- `app/simulator/` · `app/simulator-harness/` · `components/table/` · `components/simulator/`
- 프로토타입 `docs/superpowers/prototypes/*.html` (참조만)
- `PRD.md` — 바꿀 이유가 생기면 **사용자에게 먼저 묻는다**

## 11. 범위 밖

데드 버튼 · 50% 규칙(제29조 3항) · 셔플 중 바인(제16조) · 축 3 믹스게임 룰셋 ·
일일 시드 챌린지 · 오답 리뷰 · 계정 · 기록 서버 저장 · 결제 · AI 채점.

---

## 12. 이 계획이 뒤집힐 수 있는 지점

정직하게 미리 적어 둔다. 아래가 실제로 일어나면 **멈추고 보고한다.**

1. **`seatBet` 이 "직면한 총 증가액"의 올바른 기준이 아닌 경우.** 콜한 좌석과 레이즈한
   좌석 모두 `seatBet` 이 마지막 액션 시점의 벳 수준과 같다고 판단했다. 반례가 나오면
   `HandState` 에 좌석별 "마지막 액션 시점 벳"을 추가해야 하고, 그건 `reduce.ts` 수정이라
   §10 의 경계를 넘는다 — 그때 다시 승인을 받는다
2. **`generate.test.ts` 의 시드 의존 테스트가 뒤집히는 경우.** §1 의 절차대로 처리하되,
   불변식 테스트(스택 보존·팟 0)가 깨지면 그건 규칙이 아니라 내가 뭔가 부순 것이다
3. **`score.ts` 제네릭화가 축 1 타입을 흔드는 경우.** 흔들면 제네릭화를 포기하고
   축 2 전용 스코어러를 두되, **공식은 `score.ts` 를 import 해서 쓴다**


---

## 13. 구현 결과 (2026-09-01)

사용자 승인을 받고 구현했다 (엔진 수정 · 제27조 별도 모듈, 둘 다 권장안 채택).
아래는 전부 이 세션의 실행 출력으로 확인한 것이다.

| 완료 기준 | 결과 |
|---|---|
| 기존 297 테스트 어서션 그대로 통과 | ✅ `npm test` **333 통과** (297 + 리오픈 5 + 순서위반 4 + 러시 27) |
| typecheck · lint · build | ✅ 전부 통과 · `/action-rush` 라우트 생성 |
| §5.1 갈라지는 사례 Red-Green | ✅ Red: `canReopen is not a function` 5건 + 옛 규칙 실측 대조 / Green: 통과 |
| 시험 6·7번이 여전히 24,800 · 35,500 | ✅ `nlh.exam.test.ts` 통과 |
| `resolveOutOfTurn` 15조합 전수 | ✅ 통과 |
| 생성기 5종 × 1,000판 엔진 재계산 일치 | ✅ 27 테스트 통과 |
| 재개 분포 양쪽 ≥ 10% | ✅ **44.5%** (수정 전 0.8%) |
| 10문제 완주 · 5종 각 2문제 · 집계 정확 | ✅ Playwright 완주, 5/10 정답 집계 일치 |
| 조항 패널이 다섯 유형 모두 올바른 조항 | ✅ 매 문제 `제NN조` 노출 확인 |
| 360px · 560px 렌더 | ✅ 가로 넘침 0px · 콘솔 오류 0 |
| 축 1(`/rush`) 무회귀 | ✅ 정상 로드 · 넘침 0 · 오류 0 · `potrush.best` 미변경 |

### 갈라짐의 실측 증거 (수정 전)

```
좌석 3(UTG+1, 13,500 레이즈)에게 액션이 돌아왔다
현재 벳 23,000 · 폭 8,800 · 유효 최소 폭 8,800
직면한 총 증가액 = 23,000 − 13,500 = 9,500
규정(제35조 4항)  : 9,500 >= 8,800 -> 레이즈 가능
엔진(옛 canRaise) : actedSinceFullRaise={3,4,5} -> 레이즈 불가
```

### 계획과 달라진 것

| 항목 | 계획 | 실제 | 왜 |
|---|---|---|---|
| `score.ts` 의 `initialRun` | 언급 없음 | `emptyRun<K>()` 함수로 교체 | 상수로는 어느 축의 유형 집합인지 정할 수 없다 |
| `ResultPanel` | `labels` prop | prop + **컴포넌트 제네릭화** | `RunState<RushKind>` → `RunState<string>` 대입이 타입으로 안전하지 않다 |
| `isFullRaise` | 언급만 | `lib/simulator/index.ts` 에 **export 추가** | 생성기가 "짧은 올인인가"를 스스로 판단하지 않으려면 필요하다 |
| 축 1 `app/rush/page.tsx` | `labels` 만 넘김 | 헤더 줄바꿈도 함께 수정 | 같은 마크업이라 같은 결함이 있었다 — 내 화면만 고치면 옆에 남는다 |

### §12 위험 중 실제로 일어난 것

1. **`seatBet` 기준** — 문제 없었다. 콜·레이즈 어느 쪽이든 마지막 액션 시점의 벳 수준과
   같다는 판단이 맞았고, `reduce.ts` 를 건드릴 일이 없었다
2. **시드 의존 테스트** — 하나도 뒤집히지 않았다. 규칙 수정이 권리를 넓히기만 하므로
   기존 액션이 새로 무효가 될 수 없고, 불변식 테스트는 그대로 통과했다
3. **`score.ts` 제네릭화** — 축 1 타입을 흔들지 않았다 (위 표의 두 항목으로 흡수)

### 렌더가 잡은 결함 넷 (정적 검사로는 안 잡힌다)

| 결함 | 원인 |
|---|---|
| 액션 로그가 안 읽힘 (`rgb(23,23,23)` on `rgb(4,52,44)`) | `--felt-ink` 가 `.root` 에만 있는데 로그는 펠트 바깥 |
| `MP 이(가)` · `콜은(는)` | 조사를 얼버무렸다 |
| 좌석 라벨 "스몰블라인 / 드" | 좌석 폭 초과 |
| 360px 헤더 3줄 깨짐 | 헤더 다섯 요소가 안 들어감 (축 1 도 같음) |

**축 1 설계 §10 의 "렌더로만 잡힌 결함이 다섯"이 축 2 에서 넷으로 반복됐다.**
실제 렌더러에서 돌려보는 단계를 빼면 안 된다.
