# 딜러 시뮬레이터 설계

**작성일:** 2026-08-25
**상태:** 설계 승인 대기
**대상:** 축2(딜러교육) 본체, 축3(믹스게임) 확장 기반

---

## 1. 왜 만드는가

기존 계획은 축1(TDA 서술형 케이스)을 리텐션 엔진으로 쓰려 했으나 구조적으로 성립하지 않는다. 케이스는 손으로 만들어야 해서 유한하고(런칭 재고 30개, 발행 월 8개), AI 비용 모델이 가정한 월 16회 플레이면 2주에 소진된다.

딜러 시뮬레이터는 **핸드를 절차적으로 생성**하므로 이 문제가 발생하지 않는다. 동시에:

- 딜러가 실제로 하는 일을 훈련한다 (기존 축1은 TD·플로어 업무에 가까웠다)
- 무료 TDA 번역본으로는 배울 수 없다 — PDF로 딜링을 익힐 수는 없다
- 채점이 절차로 확정되어 AI가 필요 없다 (비용 0, 오판정 없음)
- 탭·숫자 입력이라 모바일 마찰이 없다

### 3축과의 관계

| 축 | 내용 | 구현 |
|---|---|---|
| 축1 TDA | 이번 주 케이스 | 별도. 기존 설계·케이스 30개 유지 |
| 축2 딜러교육 | 노리밋 홀덤 시뮬레이터 | **본 문서의 엔진** |
| 축3 믹스게임 | 스터드·드로우 시뮬레이터 | 같은 엔진 + 룰셋 데이터 교체 |

축3은 별도 개발이 아니라 룰셋 추가다. 이 구분이 설계의 핵심 제약이 된다.

---

## 2. 범위

### V1 포함

- 노리밋 홀덤 6-max
- 두 모드: 가이드(A) / 이상감지(B)
- 판단 지점 4종: 딜링 절차, 금액 계산, 액션 유효성, 승자 판정·팟 분배
- 이상 상황 5종 이상
- 테이블뷰 + 애니메이션 + 재생 속도 조절
- 스킬축별 채점 및 등급

### V1 제외

- 팟리밋 · 픽스드리밋 (인터페이스만 준비)
- 스터드 · 드로우 계열 (인터페이스만 준비)
- 오답 분기 시뮬레이션 — 잘못된 절차의 결과를 그대로 전개하는 것. 상태 공간이 폭발해 개발비가 몇 배가 된다
- 멀티플레이 · 실시간 대전
- 9-max 테이블

---

## 3. 핵심 개념 — 핸드 하나가 문제 하나다

네 종류의 미니게임을 따로 만들지 않는다. **한 핸드를 딜러로 끝까지 진행**하면 네 종류가 제 위치에서 자동으로 발생한다.

```
버튼 이동 · 블라인드 포스팅   →  딜링 절차
프리플랍 액션 라운드          →  액션 유효성 판정
플랍 전 번카드                →  딜링 절차
올인 발생                     →  사이드팟 계산
쇼다운                        →  승자 판정 · 팟 분배
```

출제할 필요가 없다. 핸드를 생성하면 문제가 딸려 나온다.

---

## 4. 아키텍처

### 4-1. 핸드 생성기

시드를 받아 결정론적으로 핸드 하나를 만든다. **같은 시드는 항상 같은 핸드**여야 한다 — 복기, 공유, 버그 재현, 주간 공통 문제 세트가 전부 여기 의존한다.

```ts
type Hand = {
  seed: string
  rulesetId: RulesetId
  seats: Seat[]              // 좌석별 스택·플레이어명
  buttonSeat: number
  blinds: { sb: number; bb: number; ante?: number }
  events: HandEvent[]        // 핸드 전체 진행
  decisionPoints: DecisionPoint[]
  anomalies: Anomaly[]       // B 모드용, A 모드에서는 비어 있을 수 있음
}
```

`Math.random()`은 시드를 못 받으므로 쓰지 않는다. 시드 기반 PRNG(mulberry32 수준이면 충분)를 직접 두고 셔플·스택 배분·이상 상황 삽입이 전부 그 하나를 쓰게 한다. 어딘가에서 `Math.random()`이 한 번이라도 섞이면 결정론이 조용히 깨지고, 이건 재현이 안 되는 종류의 버그가 된다.

생성기 입력은 시드·룰셋·난이도, 그리고 **어떤 판단 지점을 포함시킬지**다. "사이드팟 계산이 반드시 나오는 핸드"를 요청할 수 있어야 훈련 설계가 가능하다.

```ts
generateHand({
  seed,
  rulesetId: 'nlh',
  difficulty: 'intermediate',
  require: ['calculation'],   // 다중 올인이 발생하도록 스택 배분
})
```

### 4-2. 이벤트 모델

핸드 진행은 이벤트 배열이고, 화면 상태는 이벤트를 접어서 만든다.

```ts
type HandEvent =
  | { type: 'move_button'; toSeat: number }
  | { type: 'post_blind'; seat: number; amount: number; kind: 'sb'|'bb'|'ante' }
  | { type: 'deal_hole'; seat: number; card: Card }
  | { type: 'burn' }
  | { type: 'deal_board'; street: Street; cards: Card[] }
  | { type: 'player_action'; seat: number; action: PlayerAction }
  | { type: 'collect_bets' }
  | { type: 'showdown_reveal'; seat: number }
  | { type: 'award_pot'; potIndex: number; seat: number; amount: number }

state = events.slice(0, i).reduce(applyEvent, initialState)
```

이 구조를 택하는 이유는 **되감기와 스크럽이 공짜**로 얻어지기 때문이다. 핸드 끝 리뷰에서 "3번째 판단 지점으로 돌아가기"가 인덱스 하나로 끝난다. 애니메이션도 이벤트 단위로 재생하면 된다.

### 4-3. 판단 지점

```ts
type DecisionPoint = {
  atEventIndex: number
  kind: 'procedure' | 'calculation' | 'action_validity' | 'showdown'
  prompt: string
  input: 
    | { type: 'choice'; choices: Choice[]; correctId: string }
    | { type: 'number'; fields: NumberField[] }      // 메인팟+사이드팟 등
    | { type: 'seat'; correctSeats: number[] }       // 승자 지목
  ruleRef?: string          // TDA 조항 번호
  explanation: string
  timeLimitSec: number      // 절차 10초, 계산 45초 등 종류별로 다름
}
```

제한시간을 판단 지점마다 따로 두는 것이 기존 PRD의 "일괄 30초"를 대체한다. 절차 선택과 사이드팟 계산에 같은 시간을 주는 건 말이 안 된다.

### 4-4. 이상 상황 (B 모드)

정상 흐름에 삽입되는 문제 상황이다. V1 목표 5종:

| 종류 | 상황 | 근거 |
|---|---|---|
| `oot_action` | 순서를 건너뛴 액션 | Rule 53-B |
| `undercall` | 오픈 벳에 미달하는 콜 | Rule 51-B |
| `multi_chip_bet` | 선언 없는 다수 칩 벳 | Rule 45-A |
| `button_error` | 버튼 위치 오류 | Rule 34-A |
| `exposed_card` | 카드 노출 · 조기 딜 | Rule 38, 39 |

```ts
type Anomaly = {
  atEventIndex: number
  type: AnomalyType
  detectWindow: [number, number]   // 개입이 유효로 인정되는 이벤트 인덱스 구간
  correctResponse: DecisionPoint   // 개입 후 물어볼 내용
}
```

`detectWindow`가 채점의 근거다. 너무 이르면 근거 부족, 너무 늦으면 실질 액션이 성립해 처리 방법이 달라진다 — 이건 실제 TDA 규정의 구조와 일치한다.

### 4-5. A 모드와 B 모드는 같은 엔진이다

유일한 차이는 **재생기가 판단 지점에서 멈추는가**이다.

| | 가이드 모드 (A) | 이상감지 모드 (B) |
|---|---|---|
| 대상 | 초급 · 중급 | 고급 |
| 재생 | `decisionPoints`에서 자동 정지 | 멈추지 않음 |
| 유저 입력 | 제시된 선택지에 응답 | STOP 버튼을 직접 누름 |
| 채점 | 답의 정오 | 답의 정오 + 개입 타이밍 |
| 놓쳤을 때 | 해당 없음 | 미검출로 기록, 핸드는 계속 |

같은 `Hand` 객체가 두 모드를 모두 구동한다. 콘텐츠를 한 벌만 만들면 된다.

### 4-6. 룰셋 인터페이스

축3 확장과 베팅구조 확장이 전부 이 인터페이스 교체로 이뤄진다. **V1은 `nlh` 하나만 구현하되 인터페이스는 정확히 잡는다.**

```ts
interface Ruleset {
  id: RulesetId
  family: 'flop' | 'stud' | 'draw'
  bettingStructure: 'no-limit' | 'pot-limit' | 'fixed-limit'

  holeCardCount: number
  streets: Street[]                          // 플랍: flop/turn/river, 스터드: 3rd~7th

  dealingSequence(state: HandState): DealStep[]   // 번카드 위치 포함
  validateAction(state: HandState, action: PlayerAction): ValidationResult
  minRaise(state: HandState): number
  maxRaise(state: HandState): number         // 노리밋=스택, 팟리밋=팟 계산
  evaluateHand(hole: Card[], board: Card[]): HandRank
  awardPots(state: HandState): PotAward[]    // 사이드팟·하이로우 스플릿·홀칩
}
```

주의할 점: 게임군과 베팅구조는 직교하지 않는다. 스터드는 관례상 픽스드리밋, 2-7 트리플드로우도 주로 픽스드리밋이다. 매트릭스 9칸을 전부 채울 일은 없고 실무 조합 5~6개면 충분하다.

### 4-7. 테이블뷰

- 6-max 오벌 테이블. 좌석 좌표는 타원 파라메트릭으로 계산해 인원수 변경에 대응
- 칩 단위 표준 준수: 100 / 500 / 1,000 / 5,000 / 25,000 / 100,000 (기존 디자인시스템)
- 카드 뒤집기는 CSS `transform: rotateY`, 이동은 `transform: translate`

**애니메이션 라이브러리를 쓰지 않는다.** 이 제품의 애니메이션은 전부 위치 이동이고 CSS transform으로 충분하다. spring 물리가 딜링 학습에 보태는 것이 없다.

필수 3항목:

1. **재생 속도 조절** (0.5x / 1x / 2x / 즉시) — 숙련자는 기다리기를 싫어하고, B 모드에서는 속도가 곧 난이도다
2. **텍스트 액션 로그 병행** — 애니메이션이 정보이므로 애니메이션 없이도 읽혀야 한다. 복기 수단이기도 하다
3. `prefers-reduced-motion` 존중 — 이 경우 로그가 주 채널이 된다

---

## 5. 실패 처리

**즉시 피드백 후 정답 절차로 계속 진행한다.**

- 틀리면 바로 알려주고, 올바른 상태로 핸드를 이어간다
- B 모드에서 이상을 놓친 경우도 미검출로 기록만 하고 정상 진행
- 핸드가 끝나면 스킬축별 리뷰

즉시 중단을 택하지 않는 이유: 한 핸드에 판단 지점이 3~5개인데 첫 지점에서 끊기면 나머지를 경험하지 못한다. 핸드는 무한이지만 "제대로 한 핸드를 끝내본 경험"은 쌓여야 한다.

오답 분기 전개를 택하지 않는 이유: 학습 효과는 가장 크지만(실수가 눈덩이처럼 커지는 걸 체감), 잘못된 분기까지 시뮬레이션하려면 상태 공간이 폭발한다. V1 제외.

---

## 6. 채점과 등급

핸드마다 4개 축으로 점수를 낸다.

```ts
type HandScore = {
  procedure: number       // 0~100
  calculation: number
  actionValidity: number
  showdown: number
  timing?: number         // B 모드에서만
  missedAnomalies: number
}
```

### 등급 정의

기획서 §9에서 미정으로 남아 있던 항목이 이 구조로 해결된다. "누적 정답 몇 개"라는 임의 숫자가 필요 없다.

| 등급 | 조건 |
|---|---|
| junior | 절차 축 정확도 80% 이상 |
| senior | 절차 + 계산 + 유효성 3축 모두 80% 이상 |
| master | 3축 90% 이상 + B 모드 이상 검출률 70% 이상 |

최근 N핸드 이동 평균으로 계산한다. 누적으로 하면 초기 실수가 영구히 발목을 잡는다.

### 스트릭

기존 결정(주 단위, 이번 주 최소 1회 플레이) 그대로 유지한다. 핸드가 무한이라 콘텐츠 부족으로 스트릭이 끊길 일이 없다.

PRD 본문의 "연속 정답 스트릭"은 삭제해야 한다 — 오답에 리셋하면 유저가 어려운 상황을 피하게 되는데, 어려운 판단 훈련이 제품의 존재 이유다.

---

## 7. DB 스키마 변경

기존 `cases` / `attempts`는 서술형 케이스 전제라 시뮬레이터에 맞지 않는다(`attempts.case_id`가 NOT NULL). **기존 테이블은 축1 전용으로 두고 신규 테이블을 추가한다.**

```sql
create table hand_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  seed text not null,                     -- 같은 핸드 재현용
  ruleset_id text not null,               -- 'nlh' 등
  mode text not null check (mode in ('guided','vigilance')),
  difficulty text not null,
  score_procedure smallint,
  score_calculation smallint,
  score_action_validity smallint,
  score_showdown smallint,
  timing_score smallint,                  -- vigilance 전용
  missed_anomalies smallint not null default 0,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index idx_hand_sessions_user_created on hand_sessions(user_id, created_at desc);
```

RLS는 `attempts`와 동일한 정책을 적용한다 — 본인 조회·본인 작성만, UPDATE/DELETE 정책 없음(기록 조작 차단).

`streaks` 테이블에는 스킬축별 이동 평균을 담을 컬럼을 추가하거나, 등급 계산을 조회 시점에 수행한다. 후자가 단순하므로 V1은 후자로 간다.

룰셋은 DB에 두지 않는다. 코드다.

---

## 8. 파일 배치

엔진은 React에 의존하지 않는 순수 TypeScript로 둔다. 테스트가 쉬워지고, 나중에 서버에서 검증할 때 그대로 쓸 수 있다.

```
src/lib/simulator/
  types.ts              // Hand, HandEvent, DecisionPoint, Anomaly
  generate.ts           // 핸드 생성기 (시드 → Hand)
  reduce.ts             // applyEvent, 상태 접기
  score.ts              // 채점
  rulesets/
    types.ts            // Ruleset 인터페이스
    nlh.ts              // V1 유일 구현
  anomalies/
    index.ts            // 이상 상황 삽입기

src/components/table/
  PokerTable.tsx        // 오벌 테이블, 좌석 배치
  Seat.tsx
  ChipStack.tsx         // 칩 단위 표준
  Card.tsx
  ActionLog.tsx

src/components/simulator/
  HandPlayer.tsx        // 재생 제어, 속도, 정지
  DecisionPrompt.tsx    // 선택지 / 숫자입력 / 좌석지목
  HandReview.tsx        // 핸드 종료 리뷰
```

각 파일 400줄을 넘기지 않는다. 넘으면 책임이 섞인 신호다.

---

## 9. 테스트 전략

엔진이 순수 함수라 테스트하기 좋다. TDD로 간다.

| 대상 | 검증 |
|---|---|
| 생성기 결정론 | 같은 시드 → 같은 핸드 (deep equal) |
| 생성기 제약 | `require: ['calculation']` → 다중 올인이 실제로 발생 |
| 액션 유효성 | 테이블 테스트 |
| 승자 판정 | 알려진 핸드 조합 (동점·킥커·보드플레이 포함) |
| 사이드팟 | 3인·4인 다중 올인, 홀칩 배분 |
| 상태 접기 | 임의 인덱스까지 접은 상태가 순차 적용과 일치 |

**파일럿 케이스 30개가 그대로 테스트 픽스처가 된다.** 케이스 2(다수 칩 벳이 콜인가 레이즈인가), 케이스 3(오픈 벳 언더콜), 케이스 4(최소 레이즈 총액)는 이미 상황·정답·조항이 갖춰진 룰셋 검증 케이스다. 축1 콘텐츠 제작 노력이 축2 테스트로 회수된다.

---

### 구현 순서

범위가 한 번에 짜기엔 크므로 구현 계획은 세 단계로 나눈다. 각 단계가 끝난 시점에 실제로 확인할 수 있는 것이 있어야 한다.

1. **엔진 코어** — 생성기·이벤트·상태 접기·NLH 룰셋·채점. UI 없이 테스트로만 검증된다. 이 단계가 끝나면 "핸드가 올바르게 생성되고 채점된다"가 증명된다.
2. **테이블뷰와 재생** — 컴포넌트, 애니메이션, 속도 조절, 액션 로그. 가이드 모드까지. 이 단계가 끝나면 사람이 실제로 플레이할 수 있다.
3. **이상감지 모드와 기록** — 이상 삽입, 타이밍 채점, `hand_sessions` 저장, 등급 계산.

## 10. V1 완료 기준

- [ ] 노리밋 홀덤 6-max 핸드를 시드로 결정론 생성
- [ ] 판단 지점 4종이 모두 발생하고 채점된다
- [ ] 이상 상황 5종이 삽입되고 검출·미검출이 기록된다
- [ ] 가이드 모드와 이상감지 모드가 같은 Hand로 동작한다
- [ ] 테이블뷰에서 카드·칩·버튼 이동이 애니메이션된다
- [ ] 재생 속도 4단계, 액션 로그, reduced-motion 대응
- [ ] 스킬축별 점수가 `hand_sessions`에 저장된다
- [ ] 등급이 최근 N핸드 이동 평균으로 계산된다
- [ ] 모바일(375px)에서 조작 가능
- [ ] 엔진 테스트 커버리지 80% 이상

---

## 11. 미결정 사항

| 항목 | 결정 필요 시점 |
|---|---|
| ~~등급 이동 평균의 N값~~ → **N = 20 으로 결정 (2026-08-29)** | ~~채점 구현 전~~ 결정됨 |
| 이상 상황 발생 빈도 (핸드당 확률, 난이도별) | 이상감지 모드 구현 전 |
| `detectWindow` 폭 — 몇 이벤트까지 유효 개입으로 볼지 | 타이밍 채점 구현 전 |
| 축1 케이스와 시뮬레이터를 대시보드에서 어떻게 배치할지 | UI 착수 전 |
| 무료 미리보기를 시뮬레이터로 할지 축1 케이스로 할지 | 랜딩 제작 전 |

**N = 20 근거**: `action_validity` 축이 설계상 핸드의 약 32.7% 에서 나오지 않는다(300시드 실측 98건).
창 전체가 그 축을 한 번도 못 보는 확률이 N=3 이면 3.5%, N=5 면 0.37%, N=20 이면 1.6e-10 이다.
표본 1개 이하일 확률도 N=3 이면 25%, N=20 이면 사실상 0. 정본은 `score.ts` 의 `GRADE_WINDOW`
상수이고 `score.test.ts` 의 회귀 테스트가 창이 좁아지면 빨개진다(N=3 으로 낮춰 실제 확인).

마지막 항목은 전환율에 직접 영향이 있다. 시뮬레이터 쪽이 "와 이거 진짜 같다"를 만들기 유리하다고 보지만, 실측 전에는 단정하지 않는다.

---

## 12. 이 설계가 해소하는 기존 문제

| 기존 문제 | 해소 방식 |
|---|---|
| 케이스 2주 소진 | 절차적 생성, 핸드 무한 |
| AI 채점 비용·오판정 | 절차 기반 채점, AI 불필요 |
| 서술형 30초 제한시간 충돌 | 판단 지점별 시간, 선택·입력 방식 |
| 등급 승급 기준 미정 (§9) | 4개 스킬축 정확도로 정의 |
| 스트릭 정의 충돌 (PRD vs 유저플로우) | 주 단위 유지, 연속 정답 방식 폐기 |
| 축1이 딜러 업무가 아님 | 딜러 시점으로 전환 |
| 무료 룰북과 차별화 부족 | 딜링은 PDF로 배울 수 없다 |
| 축3 개발 부담 | 룰셋 데이터 추가로 축소 |
