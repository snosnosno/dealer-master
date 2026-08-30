# 다음 세션 프롬프트 — 팟 판독 러시 프로토타입 검증

> ⚠️ **2026-08-30 방향 전환.** 3단계는 더 이상 "이상감지"도 "진행 모드"도 아니다.
> 반드시 [ADR-002](../decisions/ADR-002-run-mode-dropped.md) 를 먼저 읽어라.

아래 블록을 새 세션에 그대로 붙여넣으세요.

---

```
제품 정체성이 바뀌었다 — **"딜러가 되는 법"이 아니라 "판정을 내리는 법"**.
진행 모드(C모드)는 폐기됐다. 이유는 ADR-002 에 있다. 다시 열지 마라.

## 지금 상태

`main` = `384f0d6`. `npm test` 249/249(18파일) — 2026-08-30 실행 확인.
npm 명령은 전부 `app/` 에서 돈다.
라우트: `/` · `/simulator` · `/simulator-harness`

## 반드시 먼저 읽을 것

1. `docs/superpowers/decisions/ADR-002-run-mode-dropped.md` — **방향 전환의 근거**
2. `docs/superpowers/reviews/2026-08-30-dealersim-teardown.md` — 20년짜리 반례
3. `docs/superpowers/reviews/2026-08-30-mockup-comparison/README.md` — 목업 대조
4. `docs/superpowers/specs/2026-08-25-dealer-simulator-design.md` — 1단계 엔진 설계
5. `12_design_system.md` — 브랜드 정본 (§2-1 색 hex)

## 이번 세션에 할 일

**팟 판독 러시 프로토타입의 재미를 검증한다.** 설계 문서를 먼저 쓰지 마라.

매일 3분 · 10문제 · 개인 기록. 문제 4종을 엔진이 자동 생성한다:

| 유형 | 생성 근거 |
|---|---|
| 팟 금액 | `chipBreakdown` |
| 사이드팟 분리 | `buildPots` |
| 승자 판정 | `evaluateHand` |
| 팟별 지급 | `awardPots` |

- 콘텐츠 저작 0 — `generateHand` 가 문제와 정답을 동시에 만든다
- 난이도는 시드 조건(인원·올인 수·스택 편차)으로 조절
- 저장·인증 없이 `localStorage` 로 시작. 인증은 4단계

**검증 방법**: 사용자가 10문제를 직접 풀고 재미를 판단한다.
재미가 확인되면 그때 설계 문서 → 계획서 → 구현.
확인이 안 되면 만들지 않는다.

## 절대 건드리지 않는 것

- **엔진 `app/src/lib/simulator/`** — 읽기만. import 는 `@/lib/simulator` 에서
- **하네스 `app/src/app/simulator-harness/`**
- **`app/vitest.config.mts`**

## 작업 방식

- 완료 주장은 이 세션의 실제 도구 출력에만 근거해라
- 렌더 산출물은 실제 브라우저에서 관찰해라. 정적 파싱은 관찰이 아니다
  (`cd app && npm run dev` — 3000번에 떠 있으면 그걸 써라)
- 커밋 메시지는 `<type>: <설명>` 한국어
- **push 와 PR 은 명시 요청 없이 하지 마라**
- 게이트: `cd app && npm test && npm run typecheck && npm run lint && npm run build`

## 범위 밖

4단계 전부 — TDA 판정관 · 저장 · 인증 · 등급 · `hand_sessions` · 스트릭 · 대시보드.
그리고 룰셋 확장(오마하·스터드·드로우·팟리밋)도 그 이후다.
```

---

## 참고 — 여기까지 끝난 것

| 단계 | 결과 |
|---|---|
| 1단계 엔진 코어 | ✅ main · 249테스트 |
| TDA 조항 대조 | ✅ 원문 2종 전건 대조 |
| 2단계 테이블뷰·재생 | ✅ main (`0ba4d03`) |
| UI/디자인 정비 (A/B 파트) | ✅ main (`384f0d6`, PR #1) |
| B-3 목업 대조 | ✅ `reviews/2026-08-30-mockup-comparison/` |
| 3단계 방향 전환 | ✅ ADR-002 — 진행 모드 폐기, 판정 중심으로 |

### 살아남은 자산

엔진 전부(문제 생성기) · 테이블뷰와 재생(상황 표시) · 디자인 시스템 · Pretendard.
**버린 것은 진행 모드 설계 하나뿐이고, 코드는 0줄 썼다.**

### 4단계로 넘어간 결정들

핸드당 이상 최소 1건 · 오탐 감점 · `detectWindow` 고정 3스텝 · 이상 13종 목록.
그중 **조항 미확인 8종**은 4단계 콘텐츠 작업에서 TDA 원문으로 확인하고, 못 찾으면 뺀다.

### 엔진 부채 (동결 중, 백로그 D절)

`score.ts` number 분기 꼬리 낙하 · `reduce.ts` `return_uncalled` 음수 하한 ·
`bots.ts` 픽스처 `stacks: []` 함정.
