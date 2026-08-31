# 다음 세션 프롬프트 — 팟 판독 러시 계획 + 구현

> ✅ **2026-08-31 재미 게이트 통과.** 사용자가 프로토타입 10문제를 끝까지 풀었고
> 셋 다 통과했다 — 다시 하기가 눌린다 · 지루한 유형 없다 · 제한시간 맞다.
> 정본 설계는 [3단계 설계 문서](../specs/2026-08-31-pot-rush-design.md) 다.

아래 블록을 새 세션에 그대로 붙여넣으세요.

---

```
제품 정체성: **"딜러가 되는 법"이 아니라 "판정을 내리는 법"**.
진행 모드(C모드)는 폐기됐다 — ADR-002 를 다시 열지 마라.

이번 세션은 **3단계 구현 계획서를 쓰고, 승인받고, 구현하는 것**이다.
설계는 끝났다. 재미도 확인됐다(2026-08-31, 10문제 실플레이).
**재미를 다시 논하지 말고, 설계를 다시 하지 마라.**

## 순서

1. 설계 문서와 프로토타입을 읽는다
2. 계획서를 쓴다 → `docs/superpowers/plans/2026-XX-XX-pot-rush.md`
3. **사용자 승인을 받는다** (승인 전에 코드 금지 — 3파일 이상 바뀌는 작업이다)
4. 구현한다. 단계마다 검증하고, 검증 출력으로만 완료를 주장한다

## 먼저 읽을 것

| 파일 | 무엇 |
|---|---|
| `docs/superpowers/specs/2026-08-31-pot-rush-design.md` | **정본 설계.** 여기와 어긋나면 설계가 이긴다 |
| `docs/superpowers/prototypes/pot-rush.html` | **참조 구현.** 재미가 확인된 실물 |
| `docs/superpowers/prototypes/assets/CREDITS.md` | 카드 에셋 출처·라이선스·크기 실측 |
| `docs/superpowers/decisions/ADR-002-run-mode-dropped.md` | 왜 판정 중심인가 |

**프로토타입 코드를 복사하지 마라.** 그건 `file://` 로 열려고 덱·평가·buildPots·칩분해를
파일 안에 재구현한 것이다. 앱에서는 전부 엔진으로 대체한다. 참조할 것은
**화면 구성과 문제 설계**지 로직이 아니다.

## 지금 상태 (2026-08-31 실행 확인)

- `cd app && npm test` → **18파일 249테스트 전부 통과** (4.66s)
- 앱 코드는 2026-08-30 이후 변경 없음. `node_modules` 설치돼 있음
- 프로토타입은 유형 5종 · 테이블 배치 · CC0 카드 에셋까지 완성

## 명령 (전부 `app/` 에서)

```
npm test          vitest run
npm run typecheck tsc --noEmit
npm run lint      eslint
npm run build     next build
npm run dev       next dev
```

## 엔진 API — 읽기만 한다

`app/src/lib/simulator/index.ts` 가 전부 재export 한다. 실제 시그니처:

```ts
createRng(seed: string): Rng
makeDeck(): Card[]                      // Card = { rank: Rank; suit: Suit }, suit = 's'|'h'|'d'|'c'
shuffle(deck: readonly Card[], rng: Rng): Card[]
evaluateHand(cards: Card[]): HandRank   // 7장 넣으면 최적 5장
compareHands(a: HandRank, b: HandRank): number
CATEGORY_LABEL: Record<HandCategory, string>
buildPots(contributed: number[], folded: boolean[]): Pot[]   // Pot = { amount, eligibleSeats }
awardPots(pots, hole, board, buttonSeat): PotAward[]
ODD_CHIP_UNIT = 100
PLAYER_NAMES, MIN_SEATS = 3, MAX_SEATS
```

주의 둘:

- **`chipBreakdown` 은 엔진이 아니다.** `app/src/components/table/chips.ts` 에 있고
  반환이 `{ chips: ChipPile[]; remainder: number }` 다. `CHIP_UNITS` 도 여기 있고
  프로토타입이 쓴 단위와 같다. **재사용 확정**
- **`generateHand` 는 쓰지 마라.** 핸드를 통째로 만드는 함수다. 러시가 필요한 건
  핸드가 아니라 문제 하나다 — 사이드팟 문제에 쇼다운은 없고 홀칩 문제엔 보드도 없다

`awardPots` 안의 좌석 정렬(버튼 왼쪽 첫 좌석부터 시계방향, 버튼이 맨 뒤)이
**홀칩 규칙의 정본**이다. 러시 쪽에서 다시 구현하게 되면 이 규칙과 전수 대조해라.

## 디자인 토큰 — 색을 하드코딩하지 마라

`app/src/app/globals.css` 에 이미 있다: `--color-dm-chip-100`~`--color-dm-chip-100000`,
`--felt`, `--felt-edge`, `--color-dm-teal-*`, `--color-dm-amber-*`, `--dm-danger`,
`--font-app-sans`, `--font-mono`. 프로토타입은 이 값을 파일 안에 복사해 뒀을 뿐이다.

`app/src/app/simulator/page.tsx` 가 `'use client'` + `?seed=` URL 패턴의 선례다.
러시도 클라이언트 컴포넌트다. 시드를 URL 에 두면 나중에 일일 챌린지가 공짜로 열린다
(다만 **일일 챌린지 자체는 이번 범위가 아니다**).

## 생성기 — 프로토타입이 알려준 함정 셋

1. **동점은 유도한 뒤 반드시 `evaluateHand` 로 확인**하고, 아니면 다시 만든다.
   유도는 두 방식 — 보드가 완성 핸드(전원 분할) / 같은 랭크를 두 좌석에 거울로.
   거울 방식은 **나머지 좌석을 더 약한 패로 채워야 한다.** 랜덤으로 채우면 그쪽이
   더 강한 판이 절반을 넘고 재생성이 보드플레이로 쏠려 "전원 분할"이 59%가 된다
2. **홀칩은 정확히 하나만 남긴다** (`units % winners === 1`).
   **버튼이 자격자가 아닌 경우가 나와야 한다** — 아니면 "버튼 다음 사람"이라는
   틀린 규칙을 배운다
3. **사이드팟은 올인 금액이 콜 금액보다 뚜렷이 낮아야** 층 자르기가 눈에 보인다

**공통: 생성한 문제는 정답을 엔진으로 재계산해 일치를 확인한 뒤에만 낸다.**
생성기와 채점기가 같은 코드를 쓰면 둘이 함께 틀려도 아무도 모른다.

## 파일 배치 (설계 §9)

```
app/src/app/rush/page.tsx           러시 화면 ('use client')
app/src/lib/rush/generate.ts        유형 5종 생성기
app/src/lib/rush/types.ts           문제 타입
app/src/lib/rush/score.ts           점수·연속배수
app/src/lib/rush/sound.ts           음향 (실패해도 조용히 꺼진다)
app/src/components/rush/*.tsx       테이블·문제·결과
app/public/cards/                   CC0 카드 에셋
```

## 계획서에서 정할 것 (설계 §12 미결정)

1. **`PokerTable` 재사용 범위** — `app/src/components/table/` 를 실제로 읽고 정해라.
   2단계 컴포넌트는 재생·관전용이라 러시의 압축 레이아웃과 요구가 다르다
2. **카드 에셋 배포 형태** — 개별 파일 대 스프라이트.
   앱은 CORS 제약이 없다. **인라인 1.6MB 는 쓰지 마라** (`domComplete` 687ms)
3. **음향 CC0 에셋 출처** — 라이선스는 배포처 명시가 근거다. "CC0라더라"는 근거가 아니다.
   카드 에셋과 같은 방식으로 `CREDITS.md` 에 기록해라

## 완료 기준 — 전부 실행 출력으로 증명한다

- [ ] `npm test` — 엔진 249테스트 **그대로** 통과 (엔진 무수정의 증거) + 러시 생성기 테스트
- [ ] `npm run typecheck` · `npm run lint` · `npm run build` 통과
- [ ] 생성기 5종 각 1,000판 → 정답을 엔진으로 재계산해 일치
- [ ] 홀칩 순서 전수 대조 — 좌석 2~9 × 모든 버튼 × 모든 자격자 조합 8,148건
- [ ] 10문제 완주 · 5종 전부 출제 · 결과 집계 정확 · 기록이 재방문에 살아 있음
- [ ] 360px · 560px 렌더 확인, 가로 넘침 없음
- [ ] 음향 — 첫 입력 전 무음, 음소거 토글 동작, 로딩 실패해도 게임 정상

**정적 검사로는 안 잡히는 것이 있다.** 프로토타입에서 렌더로만 잡힌 결함이 다섯이다 —
정답 금액 미리 보임 · 칩 더미가 행 밖으로 넘침 · 인라인 스타일이 칩 텍스처를 지움 ·
피드백이 버튼 아래에 나옴 · 덱이 아예 안 보임(span 에 display 미지정).
**실제 브라우저에서 돌려보고 눈으로 확인해라.**

## 절대 건드리지 않는 것

- **엔진 `app/src/lib/simulator/`** — 읽기만. 고쳐야 할 이유가 보이면
  그건 러시 쪽 설계가 틀린 것이다
- **하네스 `app/src/app/simulator-harness/`**
- 기존 `app/src/app/simulator/` 화면

## 범위 밖 — 4단계다

일일 시드 챌린지 · 오답 리뷰 · 유형별 기록/약점 · 저장 · 인증 · 등급 · `hand_sessions`.
2순위 유형(액션 유효성 · 다음 액션 좌석)은 3단계 실사용 기록을 보고 판단한다.
룰셋 확장(오마하 · 스터드 · 드로우 · 팟리밋)은 그 이후다.

## 작업 방식

- 완료 주장은 **이 세션의 실제 도구 출력**에만 근거해라
- 커밋 메시지는 `<type>: <설명>` 한국어. 왜 그렇게 했는지를 적어라
- **push 와 PR 은 명시 요청 없이 하지 마라**
```

---

## 참고 — 여기까지 끝난 것

| 단계 | 결과 |
|---|---|
| 1단계 엔진 코어 | ✅ main · 249테스트 (2026-08-31 재확인) |
| TDA 조항 대조 | ✅ 원문 2종 전건 대조 |
| 2단계 테이블뷰·재생 | ✅ main (`0ba4d03`) |
| UI/디자인 정비 (A/B 파트) | ✅ main (`384f0d6`, PR #1) |
| 3단계 방향 전환 | ✅ ADR-002 — 진행 모드 폐기, 판정 중심으로 |
| 팟 판독 러시 프로토타입 | ✅ 유형 5종 · 테이블 배치 · CC0 카드 에셋 |
| **재미 게이트** | ✅ **2026-08-31 실플레이 10문제, 셋 다 통과** |
| **3단계 설계 문서** | ✅ `specs/2026-08-31-pot-rush-design.md` |
| 3단계 계획 + 구현 | ⬜ **다음 세션** |

### 2026-08-31 에 정한 것

| 결정 | 내용 |
|---|---|
| 유형 범위 | **5종 그대로.** 2순위 2종은 실사용 기록을 보고 판단 |
| 리텐션 | **음향만.** 일일 시드 챌린지·오답 리뷰·유형별 기록은 4단계 |
| 정본 | **엔진.** 프로토타입의 로직 재구현은 앱에서 전부 버린다 |

### 엔진 부채 (동결 중, 백로그 D절)

`score.ts` number 분기 꼬리 낙하 · `reduce.ts` `return_uncalled` 음수 하한 ·
`bots.ts` 픽스처 `stacks: []` 함정.
