# 시뮬레이터 2단계 — 테이블뷰와 재생 설계

**작성일:** 2026-08-29
**상태:** 설계 승인 완료 (브레인스토밍 5개 섹션 전건 승인)
**전제:** 1단계 엔진 코어 완료 (`app/src/lib/simulator/`, 테스트 215/215)
**상위 문서:** `2026-08-25-dealer-simulator-design.md` — 이 문서는 그 §9 구현 순서의 **2단계**를 상세화한다

---

## 0. 이 문서가 정하는 것

스펙 §9가 2단계를 "테이블뷰와 재생 — 컴포넌트, 애니메이션, 속도 조절, 액션 로그. 가이드
모드까지. 이 단계가 끝나면 사람이 실제로 플레이할 수 있다" 로 정의했다. 그 한 문단을
구현 가능한 설계로 펼친 것이 이 문서다.

**엔진은 수정하지 않는다.** `app/src/lib/simulator/` 에 파일을 고치지도, 더하지도 않는다.
공개 표면이 `index.ts` 하나라는 1단계 결정을 2단계가 흐리면 안 된다. 2단계가 엔진 변경을
요구한다고 판단되면 고치지 말고 그 판단을 별도 결정 항목으로 올린다.

---

## 1. 설계를 바꾼 관찰 — 재생 순서가 정답을 미리 흘린다

설계 착수 전 엔진을 직접 실행해 seed `1` 과 seed `7`(`require: ['calculation']`)의 출력을
관찰했고, 거기서 나온 사실 하나가 재생 설계를 결정했다.

seed 7 실측:

```
[ 36] collect_bets
[ 37] award_pot potIndex=0 seat=1 amount=32300   <<< DP calculation (atEventIndex=37)
[ 38] award_pot potIndex=1 seat=1 amount=13500
       events.length = 39                          <<< DP showdown (atEventIndex=39)
```

- `calculation` DP 의 앵커는 `마지막 collect_bets + 1` = **첫 `award_pot` 자리** (`decisions.ts`)
- `showdown` DP 의 앵커는 `hand.events.length` — **배열 끝을 넘는 인덱스** (`decisions.ts`)

이벤트를 순서대로 재생하면 `award_pot` 두 개가 승자(좌석 1)를 애니메이션으로 보여준 **뒤에**
"메인팟은 누구에게 갑니까?" 를 묻게 된다. 답을 보여주고 문제를 내는 것이다.

**엔진 버그가 아니다.** `atEventIndex` 는 "이 인덱스의 이벤트를 적용하기 전" 이라는 뜻이고
그 정의로는 두 앵커 모두 정확하다. 재생 컨트롤러가 풀어야 할 문제이며, §3의 봉인 경계
규칙 두 줄로 엔진 수정 없이 해소된다.

### 함께 확인된 것

- 판단 지점 개수는 핸드마다 다르다 — seed 1은 2개, seed 7은 3개 (브리프 #4 실측 확인)
- 좌석 번호가 두 벌이다 — `buttonSeat=4` 인데 문항 문구는 "버튼은 정하늘(**5번**)입니다" (브리프 #5)
- 올인 런아웃은 `showdown_reveal` 이 보드보다 **먼저** 나온다(seed 7 이벤트 24~27) — 홀카드
  노출 타이밍이 엔진에서 이미 올바르다
- 하네스 포매터(`app/src/app/simulator-harness/format.ts`)의 `describeEvent` 는 좌석을 `#4` 처럼
  **0-based 로 찍는다.** 진단용으로는 옳지만 학습자 화면에 재사용하면 브리프 #5가 경고한
  오독이 바로 발생한다 → 제품용 포매터를 따로 쓴다. 하네스는 건드리지 않는다

---

## 2. 아키텍처 — 순수 리듀서 + 멍청한 뷰

재생 전체를 **React 에 의존하지 않는 순수 TS 상태기계** 하나로 만든다. `HandPlayer.tsx` 는
그 리듀서를 `useReducer` 로 돌리는 껍데기이고, 뷰 컴포넌트는 props 만 받는다.

이 선택의 결정적 이점은 테스트다. 1단계는 "순수 TS 로 짜서 테스트로 증명" 하는 방식으로
성공했고, 2단계에서 그 방식을 유지할 수 있는 유일한 구조가 이것이다. 상태 로직이 React
훅 안에 갇히면 검증하기 위해 jsdom·@testing-library 를 새 의존성으로 들여야 한다.

### 채택하지 않은 대안

| 대안 | 기각 사유 |
|---|---|
| Context Provider | 컴포넌트 8개 규모에 과하고, 상태가 React 안에 갇혀 jsdom 도입이 강제된다. 커서가 context 로 흐르면 좌석 전체가 매 틱 리렌더된다 |
| 컴포넌트별 `useState` 분산 | 커서·속도·phase·타이머가 서로를 읽어야 해서 `useEffect` 가 서로를 트리거하는 상태가 된다. 특히 재생 인터벌과 카운트다운이 둘 다 effect 라 정지·속도변경에서 경합한다. 사실상 테스트 불가 |

---

## 3. 재생 상태기계 (`player.ts`)

```ts
type Phase = 'playing' | 'awaiting' | 'feedback' | 'review'

type PlayerState = {
  cursor: number            // 적용된 이벤트 개수. 화면 = stateAt(init, events, cursor)
  phase: Phase
  speed: 0.5 | 1 | 2 | 0    // 0 = 즉시
  pending: DecisionPoint[]  // 아직 안 물은 DP, atEventIndex 오름차순
  answers: Answer[]
  results: DecisionResult[]
  remainingMs: number       // awaiting 일 때 카운트다운
  elapsedMs: number         // playing 일 때 현재 이벤트의 경과
}
```

액션은 넷뿐이다.

| 액션 | 의미 |
|---|---|
| `{type:'tick', ms}` | 시간이 흘렀다. `playing` 이면 커서 전진, `awaiting` 이면 카운트다운 |
| `{type:'answer', answer}` | 학습자가 답을 냈다 → `scoreDecision` → `feedback` |
| `{type:'continue'}` | 피드백을 읽었다 → `playing` |
| `{type:'setSpeed', speed}` | 속도 변경 |

**리듀서는 `Date.now()` 를 부르지 않는다.** 시간이 `tick` 으로 들어오므로 순수하게 남고,
테스트가 시계 조작 없이 돈다. 실제 시계는 `HandPlayer.tsx` 의 인터벌 하나뿐이다.

### 3-1. 정답 봉인 경계 (§1의 해법)

```ts
// 핸드마다 한 번만 계산한다 — 이벤트 열이 불변이라 상수다.
const firstAward = events.findIndex((e) => e.type === 'award_pot')
const sealIndex = firstAward === -1 ? events.length : firstAward

const stopAt = pending.length > 0
  ? Math.min(pending[0].atEventIndex, sealIndex)
  : events.length
```

`cursor === stopAt && pending.length > 0` 이면 `awaiting` 으로 전이한다. 이 두 줄이 전부다.

seed 7 추적:

| cursor | stopAt | 벌어지는 일 |
|---|---|---|
| 0 → 3 | `min(3, 37)` = 3 | 버튼 이동·블라인드 재생 → **procedure 질문** |
| 3 → 37 | `min(37, 37)` = 37 | 딜링·액션·보드 전부 재생 → **calculation 질문** |
| 37 | `min(39, 37)` = 37 | 커서 정지 → **showdown 질문** ← 승자 노출 전 |
| 37 → 39 | `pending` 빔 → 39 | `award_pot` 2개 재생 → `review` |

seed 1 추적(봉인 경계가 DP 보다 뒤에 있는 평범한 경우):

| cursor | stopAt | 벌어지는 일 |
|---|---|---|
| 0 → 3 | `min(3, 43)` = 3 | **procedure 질문** |
| 3 → 18 | `min(18, 43)` = 18 | **action_validity 질문** |
| 18 → 44 | `pending` 빔 → 44 | 끝까지 재생 → `review` |

부수 효과로 `award_pot` 애니메이션이 문제 뒤로 밀려 **자연스러운 정답 공개 연출**이 된다.

### 3-2. 속도와 시간

이벤트 종류별 기본 지속시간을 테이블로 둔다(단위 ms, 1x 기준).

| 이벤트 | ms | | 이벤트 | ms |
|---|---|---|---|---|
| `deal_hole` | 120 | | `collect_bets` | 600 |
| `burn` | 250 | | `return_uncalled` | 600 |
| `post_blind` | 350 | | `player_action` | 700 |
| `move_button` | 400 | | `award_pot` | 800 |
| `showdown_reveal` | 400 | | `deal_board` | 500 |

실제 지연은 `기본 / speed`. **즉시(`speed === 0`)는 커서가 `stopAt` 까지 한 번에 점프한다.**
종류별 차등이 필수인 이유: 홀카드 12장을 700ms씩 돌리면 프리플랍 딜링만 8.4초다.

`prefers-reduced-motion` 은 **CSS transition 만 0으로 만들고 이벤트 간격은 유지한다.**
reduced-motion 은 움직임을 지우라는 뜻이지 순서를 건너뛰라는 뜻이 아니다 — 스펙 §4-7이
"이때 로그가 주 채널" 이라고 했고, 로그가 주 채널이 되려면 한 줄씩 쌓일 시간이 있어야 한다.

### 3-3. 타이머의 정직성

`awaiting` 진입 시 `remainingMs = dp.timeLimitSec * 1000` (10/20/45/30초, `TIME_LIMITS`).
0이 되면 `{type:'timeout'}` 이 자동 제출되어 0점이 된다.

**`awaiting`·`feedback` 에서 정지 버튼을 비활성화한다.** 정지로 타이머를 멈출 수 있으면
45초짜리 사이드팟 문제를 무한정 붙들고 계산할 수 있다. 속도 컨트롤은 눌러도 되지만
다음 재생부터 적용되고 카운트다운에는 영향이 없다.

---

## 4. 테이블뷰

### 4-1. 좌석 좌표 — 딜러 자리를 비운다

```ts
// 화면 좌표는 y가 아래로 증가한다. 90° = 하단 중앙.
const angleDeg = (i: number, n: number) => 90 + (360 / n) * (i + 0.5)
const x = cx + rx * Math.cos(toRad(angleDeg(i, n)))
const y = cy + ry * Math.sin(toRad(angleDeg(i, n)))
```

`+0.5` 가 핵심이다. n=6이면 좌석 각도가 120·180·240·300·0·60°가 되어 **하단 중앙 90°가
정확히 비고, 거기가 딜러(학습자) 자리**가 된다. 스펙 §4-7이 요구한 "인원수 3~9 대응"이
한 식으로 나온다.

**목업(`dealermaster_mockup.html`)의 배치를 바꾼다.** 목업은 좌석 1을 하단 중앙에 놓았는데,
그것이 그려진 뒤 제품이 **학습자 = 딜러** 시점으로 재정의됐다. 비워서 얻는 것:

- 카드 애니메이션의 **원점이 확정된다** — 덱이 딜러 앞(하단 중앙)에 있고 카드가 거기서 나간다
- 칩이 팟에 모였다가 딜러가 승자에게 미는 방향이 물리적으로 맞는다
- 학습자가 "내가 딜러다" 를 화면에서 즉시 안다. 목업 배치는 "내가 1번 자리 플레이어" 로 읽힌다

좌석 인덱스가 늘수록 화면상 **반시계**다. 위에서 내려다본 테이블에서 각자의 왼쪽이 화면
왼쪽이므로 딜링 순서(각자의 왼쪽으로)가 그렇게 보이는 것이 맞다. 목업도 같은 방향이었다.

좌석 0을 하단 왼쪽에 고정한다. 버튼은 `move_button` 으로 움직이고 테이블은 회전하지
않는다 — 딜러의 물리적 위치는 고정이고 버튼이 도는 것이 실제다.

### 4-2. 칩은 팟과 벳에만

`ChipStack.tsx` 는 금액을 표준 단위(**100 / 500 / 1,000 / 5,000 / 25,000 / 100,000**)로 그리디
분해해 색 원반을 쌓는다. 색은 `12_design_system.md` §5-1의 6색(회색/블루/틸/블랙/퍼플/앰버).

**칩 그래픽은 중앙 팟과 각 좌석의 현재 벳(`seat.bet`)에만 쓴다. 좌석 스택은 숫자다.**
스택 42,500을 칩으로 그리면 원반 7개가 좌석마다 붙어 6-max에서 42개가 된다. 벳과 팟은
실제로 움직이는 대상이라 칩이어야 애니메이션이 되고, 스택은 움직이지 않는 숫자다.

### 4-3. 애니메이션 — 전부 `transform`, 라이브러리 없음

| 이벤트 | 움직임 |
|---|---|
| `move_button` | 버튼 디스크 translate |
| `post_blind` · `player_action`(bet/raise/call/allin) | 칩 좌석 → 벳 자리 |
| `deal_hole` | 카드 덱 → 좌석, 뒷면 유지 |
| `burn` | 카드 덱 → 번 더미 |
| `deal_board` | 카드 덱 → 보드, `rotateY` 로 앞면 |
| `player_action`(fold) | 카드 → 머크 + 페이드 |
| `player_action`(check) | 좌석 펄스 |
| `return_uncalled` | 칩 벳 자리 → 좌석 |
| `collect_bets` | 모든 벳 칩 → 중앙 팟 |
| `showdown_reveal` | 홀카드 `rotateY` |
| `award_pot` | 팟 칩 → 좌석 |

지속시간은 CSS 변수 하나(`--tempo`)로 통제한다. `HandPlayer` 가 `speed` 와 reduced-motion 에
따라 그 변수를 세팅하고, 컴포넌트는 duration 을 하드코딩하지 않는다. 즉시·reduced-motion
이면 `0ms`.

### 4-4. 홀카드 노출

**`SeatState.revealed` 가 유일한 기준이다.** 엔진이 `showdown_reveal` 로만 세우므로 UI는
따로 판단하지 않는다. seed 7처럼 올인 런아웃이면 보드가 깔리기 전에 공개되고, seed 1처럼
모두 폴드로 끝나면 승자 홀카드도 끝까지 안 보인다 — 둘 다 실제 딜링 그대로다.

### 4-5. 좌석 번호 단일 변환점

`displaySeat(i) = i + 1` 헬퍼 하나를 두고 **화면에 좌석 숫자를 찍는 모든 곳이 그것만 쓴다.**
엔진이 준 라벨 문자열(`이민아 — 3h 8h`, `버튼은 이민아(3번)입니다`)은 이미 이름·1-based
이므로 그대로 통과시킨다. API 인덱스는 끝까지 0-based로 남는다.

### 4-6. `ActionLog.tsx`

이벤트를 한국어 한 줄로 옮기되 **이름 기반**이다 — `#4` 가 아니라 `정하늘(5번) 레이즈 → 800`.
현재 커서 위치의 줄이 강조되고 자동 스크롤된다. `prefers-reduced-motion` 이면 이쪽이
주 채널이므로 폰트·대비를 키운다.

---

## 5. 판단 프롬프트와 채점

`DecisionInput` 3종을 그대로 받아 그린다.

| 입력 | UI | 만들 `Answer` |
|---|---|---|
| `choice` | 선택지 버튼 목록 | `{type:'choice', index}` |
| `number` | 정확히 `fields.length` 개의 숫자 칸 | `{type:'number', values:(number\|null)[]}` |
| `seat` | 좌석 **다중** 선택 | `{type:'seat', seats:[]}` |

조용한 오답을 만드는 세 지점을 못 박는다.

1. **빈 칸은 `null` 로 보낸다.** 0으로 메꾸면 "0이라고 답했다"로 채점되고, 배열을 앞으로
   당기면 사이드팟 답이 메인팟 칸과 대조된다. 그리고 `score.ts` 가 값이 필드보다 **많으면
   throw** 하므로 칸을 절대 초과 생성하지 않는다
2. **좌석 선택은 항상 다중이다.** `correctSeats.length === 1` 일 때 단일 선택으로 바꾸면
   **정답 개수가 UI 모양으로 유출된다** — 분할 팟인지 아닌지가 문제를 풀기 전에 새어 나간다.
   항상 다중으로 두면 여러 명을 고른 답이 오답으로 채점되는 것도 `scoreDecision` 의 정확
   일치 규칙 그대로다
3. 숫자 입력은 `inputMode="numeric"`, 표시에 천단위 콤마, 제출값은 순수 숫자

### 피드백

제출 즉시 `feedback` 으로 간다 — 정오, `dp.explanation`, `dp.ruleRef`. **"계속" 을 눌러야
재생이 재개되고 여기엔 타이머가 없다.** 설명을 읽는 것이 훈련의 절반이다.

스펙 §5의 "오답이어도 정답 절차로 계속" 은 **공짜로 성립한다** — 학습자의 답이 `events` 를
바꾸지 않으므로 재생은 원래 이벤트 열 그대로 이어진다. 오답 분기는 V1 제외 그대로다.

---

## 6. 리뷰, 셸, 시드

### 6-1. `HandReview.tsx`

`scoreHand(results)` 의 축별 점수를 보여주되 **`null` 축을 0점으로 그리지 않는다.** "이 핸드에
없었음" 으로 표시한다 — `gradeFrom` 의 `avg` 가 `null` 을 걸러내는 것과 화면이 같은 말을
해야 한다. seed 1처럼 `calculation`·`showdown` 이 아예 없는 핸드가 흔하다.

**2단계 리뷰는 등급을 표시하지 않는다.** `gradeFrom` 은 최근 20핸드(`GRADE_WINDOW`)가
필요한데 저장이 3단계 범위다. 부수 효과로 브리프 #3(master 미노출)이 저절로 지켜진다 —
3단계가 저장을 붙일 때 senior 상한을 그 자리에서 넣는다.

그 아래 문항별로 문제 / 내 답 / 정답 / 설명 / 조항, 그리고 "다음 핸드".

### 6-2. 라우트

```
/                    축 3종 카드 — 딜러 교육만 활성, TDA 룰·믹스게임은 "준비 중"
/simulator?seed=xxx  시뮬레이터 본체
/simulator-harness   엔진 확인용 (유지, 손대지 않음)
```

**대시보드를 만들지 않는다.** 등급 카드·스트릭 배지는 `hand_sessions` 를 읽어야 하는데
그 테이블이 3단계 범위라, 2단계에서 만들면 더미 데이터 화면이 된다. 축 3종 선택만 둔다.

### 6-3. 시드와 `require`

`seed` 쿼리가 없으면 생성해 **URL에 반영한다.** 그러면 어떤 핸드든 링크로 복기·공유·버그
재현이 되고, 스펙 §4-1이 결정론 생성에 걸어둔 값을 2단계가 이미 회수한다.

**`require` 는 시드가 결정한다.**

```ts
// 1/3 확률로 사이드팟 핸드. 학습자에게 노출되는 컨트롤이 아니다.
const require = createRng(`${seed}:require`).int(3) === 0 ? ['calculation'] : undefined
```

이 장치가 필요한 이유: `require` 없이는 300시드 실측 올인 **0건**, `['calculation']` 을 걸면
**300/300** 이다. 컨트롤로 노출하지 않으면서 이걸 안 걸면 4축 중 하나이자 등급 조건 3축 중
하나인 계산 축이 훈련 기회 0이 된다. 시드에서 유도하므로 **시드 하나가 여전히 핸드 하나를
완전히 결정**해 재현성이 유지된다.

빈도를 1/3으로 정한 근거: `GRADE_WINDOW = 20` 기준 창마다 계산 표본이 기대 6~7개라 등급
판정에 충분하고, `require:['calculation']` 시드가 올인을 강제해 플레이가 비현실적이라는
백로그 경고(Task 7 #6)를 과반복하지 않는다.

### 6-4. 노출하지 않는 컨트롤

- **`difficulty`** — 아무 효과가 없다 (`generate.ts` 선언부에 문서화됨)
- **`rulesetId`** — 값이 하나뿐이라 룰셋을 고르지 않는다
- **좌석 수** — 6 고정. 스펙 V1이 6-max다 (`MIN_SEATS`~`MAX_SEATS` 3~9 대응은 좌표 식에만 남긴다)
- **`require`** — §6-3대로 시드가 정한다

### 6-5. 판단 지점이 0개인 핸드

**그대로 재생하고 끝낸다.** 리뷰에 "이 핸드에는 판단 지점이 없었습니다" 로 표시한다.
관람도 딜러 훈련이고, 재시도 루프 금지(브리프 #1)를 지키며, 학습자가 왜 아무것도 안
물었는지 알 수 있다. `require: ['action_validity']` 가 약 32.7% 핸드에서 축을 못 만드는
것도 같은 경로로 흡수된다.

---

## 7. 파일 배치

```
src/app/page.tsx                    축 3종 선택
src/app/simulator/page.tsx          시드 결정 → HandPlayer 마운트

src/components/simulator/
  player.ts        ★ 순수 TS 상태기계. React import 없음
  player.test.ts   ★ 리듀서 테스트
  HandPlayer.tsx   useReducer + 틱 루프. 뷰 조립만
  DecisionPrompt.tsx
  HandReview.tsx

src/components/table/
  PokerTable.tsx   타원 좌표 + 좌석 배치
  Seat.tsx
  ChipStack.tsx
  Card.tsx
  ActionLog.tsx
```

`player.ts` 는 **스펙 §8에 없는 파일**이라 자리를 새로 정한 것이다. `src/components/simulator/`
에 둔 이유는 둘이다 — 기능 단위 묶음이 §8의 정신이고, `vitest.config.mts` 의
`include: ['src/**/*.test.ts']` 가 설정 변경 없이 그대로 잡는다.

**각 파일 400줄 상한**(스펙 §8)은 그대로 유효하다. 순수 로직을 `.ts` 로 빼는 구조가 이 상한을
자연히 만족시킨다.

---

## 8. 테스트 전략

`player.ts` 를 순수하게 만든 대가를 여기서 받는다. **jsdom·@testing-library 를 도입하지 않고,
`vitest.config.mts` 를 한 줄도 바꾸지 않는다.**

| 대상 | 검증 |
|---|---|
| `player.ts` | 정지점이 첫 `award_pot` 을 넘지 않는다 (seed 7 회귀) |
| `player.ts` | 타임아웃이 `{type:'timeout'}` 으로 0점 채점된다 |
| `player.ts` | 즉시 속도가 커서를 `stopAt` 까지 한 번에 옮긴다 |
| `player.ts` | DP 0개 핸드가 곧장 `review` 로 간다 |
| `player.ts` | 오답을 내도 커서가 원래 이벤트 열대로 계속 전진한다 |
| 좌표 함수 | n=3~9에서 좌석이 겹치지 않고, 하단 중앙(90°)에 좌석이 없다 |
| 칩 분해 | 표준 단위만 쓰고 합이 원금액과 같다 |
| 로그 포매터 | 좌석 숫자가 1-based로 나온다 |

React 컴포넌트는 단위 테스트하지 않고 **브라우저 실렌더로 확인**한다 — 1단계 하네스와 같은
방식이며, 그쪽이 렌더 결함을 실제로 잡아낸 방식이다.

---

## 9. 2단계 완료 기준

스펙 §10 V1 완료 기준 중 2단계가 책임지는 항목이다.

- [ ] 테이블뷰에서 카드·칩·버튼 이동이 애니메이션된다
- [ ] 재생 속도 4단계(0.5x/1x/2x/즉시)가 동작한다
- [ ] 액션 로그가 병행 표시되고 이름·1-based 좌석으로 읽힌다
- [ ] `prefers-reduced-motion` 에서 transition 이 0이 되고 로그가 주 채널이 된다
- [ ] 판단 지점 3종 입력(choice/number/seat)이 모두 답을 만들고 채점된다
- [ ] 문항별 제한시간이 동작하고 초과 시 0점으로 채점된다
- [ ] 오답 시 즉시 피드백 후 정답 절차로 핸드가 계속된다
- [ ] 승자·팟 문제가 `award_pot` 애니메이션 **전에** 출제된다 (§1의 회귀)
- [ ] 핸드 종료 후 축별 점수 리뷰가 나오고, 없던 축이 0점으로 표시되지 않는다
- [ ] 같은 `?seed=` 로 같은 핸드가 재생된다
- [ ] 모바일 375px 에서 조작 가능
- [ ] `npm test` · `npm run typecheck` · `npm run lint` 전부 통과

2단계 범위가 **아닌** 것: 이상감지(B) 모드, 타이밍 채점, `hand_sessions` 저장, 등급 계산과
표시, 대시보드, 축1 케이스 — 전부 3단계 이후다.

---

## 10. 미결정으로 남기는 것

| 항목 | 결정 시점 |
|---|---|
| 이상 상황 발생 빈도 (핸드당 확률) | 3단계 — 이상감지 모드 구현 전 |
| `detectWindow` 폭 | 3단계 — 타이밍 채점 구현 전 |
| 무료 미리보기를 시뮬레이터로 할지 축1로 할지 | 랜딩 제작 전 |
| `junior` 를 폴백이 아닌 조건으로 바꿀지 | "junior 도 자격" 으로 쓸 때 (백로그 C절 R32) |

상위 스펙 §11의 "축1 케이스와 시뮬레이터를 대시보드에서 어떻게 배치할지" 는 **이 문서
§6-2에서 해소됐다** — 대시보드를 만들지 않고 축 3종 선택 화면만 둔다.
