# 다음 세션 프롬프트 — 3단계(이상감지 모드) 설계 착수

아래 블록을 새 세션에 그대로 붙여넣으세요.

> ⚠️ 이 파일은 **2026-08-30 기준**이다. 3단계 설계 문서가 나오면 다시 교체한다.

---

```
1단계(엔진)·2단계(테이블뷰와 재생)·UI 정비까지 전부 main 에 머지됐다.
이번 세션은 **3단계 이상감지(B) 모드의 설계**다. 구현 세션이 아니다.

## 지금 상태 (직접 확인된 값)

`main` = `384f0d6` (PR #1 머지). 워킹트리 깨끗.
게이트: `npm test` **249/249 통과(18파일)** — 2026-08-30 실행 확인.
npm 명령은 전부 `app/` 에서 돈다.

동작하는 라우트: `/` (축 3종 선택) · `/simulator` (핸드 재생) ·
`/simulator-harness` (엔진 점검용, 제품 UI 아님)

사이드팟이 나오는 시드: `t2`(4축 전부·사이드팟 3) · `t4`(사이드팟 4) ·
`t9`(짧은 핸드) · `t3`

## 읽을 것

1. `docs/superpowers/specs/2026-08-25-dealer-simulator-design.md` — 1단계 엔진 설계
2. `docs/superpowers/specs/2026-08-29-simulator-table-view-design.md` — 2단계 설계
3. `docs/superpowers/plans/2026-08-25-simulator-engine-core-BACKLOG.md` — 잔여 백로그
4. `docs/superpowers/reviews/2026-08-30-mockup-comparison/README.md` — 목업 대조 결과
5. `12_design_system.md` — 브랜드/디자인 정본 (§2-1 에 색 hex 정본)
6. `09_db_schema.sql` — `hand_sessions` 저장이 3단계 범위다

## 절대 건드리지 않는 것

- **엔진 `app/src/lib/simulator/`** — 3단계는 이상 상황 삽입이 필요해 엔진 변경이
  실제로 필요할 수 있다. **설계 세션에서는 고치지 말고, 필요한 변경을 설계 문서에
  적어라.** 구현 착수 전 승인받는다
- **하네스 `app/src/app/simulator-harness/`** — 수정·삭제 금지
- **`app/vitest.config.mts`**

---

# 이번 세션에 할 일

## 1. 미결 2건을 먼저 결정해라 (사용자와 함께)

3단계 설계가 이 둘 없이는 못 나간다.

- **이상 상황 발생 빈도** — 핸드당 몇 건인가? 항상 1건인가, 0건인 핸드도 섞나?
  0건 핸드가 없으면 학습자가 "무조건 어딘가 있다"를 학습해버린다
- **`detectWindow` 폭** — 이상 발생 시점부터 몇 초/몇 이벤트까지를 정답 탐지로
  인정하나? 너무 좁으면 반응속도 시험이 되고, 너무 넓으면 변별력이 없다

## 2. 3단계 설계 문서를 써라

`docs/superpowers/specs/2026-08-30-anomaly-detection-design.md` (날짜는 실제 날짜로)

범위:
- 이상 상황 5종: `oot_action` · `undercall` · `multi_chip_bet` ·
  `button_error` · `exposed_card`
- 재생이 멈추지 않고 **학습자가 STOP 을 직접 누른다** (2단계는 엔진이 멈췄다)
- `detectWindow` 기반 타이밍 채점
- `hand_sessions` 저장 (Supabase)
- 등급 계산·표시 — **senior 상한** 규칙
- 목업 `#result` 의 `stat-row`(응답시간/연속정답/이번 달) 도입 시점

설계 문서가 답해야 할 것:
- 이상 상황을 **어디서** 주입하나 — 엔진 안인가, 이벤트 스트림 후처리인가?
  (엔진 순수성 vs 삽입 난이도의 절충을 적어라)
- STOP 을 누른 뒤 UI 흐름은? 무엇을 물어보나?
- 오탐(정상인데 STOP)과 미탐(이상인데 안 누름)의 점수 처리
- 등급 산식과 senior 상한의 정확한 의미
- `hand_sessions` 스키마가 `09_db_schema.sql` 로 충분한가

## 3. 설계가 승인되면 계획서를 써라

`docs/superpowers/plans/` 에 Task 단위로. 2단계 계획서 형식을 따라라.

---

## 2단계 UI 정비에서 남은 잔여물 (3단계 전에 정리 가능)

`docs/superpowers/reviews/2026-08-30-mockup-comparison/README.md` 참조.

- **6번 — 주 CTA 와 로그 패널이 `bg-zinc-900`(검정)이다.** 브랜드는 딥 틸이다.
  `c0c4fe9` 의 토큰화가 hex 만 훑고 Tailwind 기본 팔레트는 안 건드려서 남았다.
  `HandReview.tsx:82` · `DecisionPrompt.tsx:233` · `ActionLog.tsx:43`
- 1번(칩 색 범례) · 2번(팟 상시 표시) — 제품 결정 필요
- 5번 — 정답일 때의 리뷰 연출을 아직 눈으로 못 봤다

## 작업 방식

- **완료 주장은 이 세션의 실제 도구 출력에만 근거해라.** 통과 개수와 exit 코드를
  그대로 보고한다
- 렌더 산출물은 **실제 브라우저에서 관찰**해라. 정적 파싱은 관찰이 아니다.
  `cd app && npm run dev` — 3000번에 이미 떠 있으면 그걸 써라
- 커밋 메시지는 `<type>: <설명>` 한국어
- **push 와 PR 은 명시 요청 없이 하지 마라**
- 게이트: `cd app && npm test && npm run typecheck && npm run lint && npm run build`

## 이번 세션 범위가 아닌 것

축1 TDA 케이스 화면 · 9-max · 팟리밋/픽스드리밋 · 스터드/드로우 ·
AI 채점 파이프라인. 그리고 **구현** — 이번 세션은 설계까지다.
```

---

## 참고 — 여기까지 끝난 것

| 단계 | 결과 |
|---|---|
| 1단계 엔진 코어 | ✅ main |
| TDA 조항 대조 | ✅ 원문 2종으로 전건 대조 |
| 2단계 설계·계획서 | ✅ specs + plans (Task 1~10) |
| 2단계 구현 | ✅ main (`0ba4d03`), 249테스트 |
| UI/디자인 정비 (A/B 파트) | ✅ main (`384f0d6`, PR #1) |
| B-3 목업 대조 | ✅ `docs/superpowers/reviews/2026-08-30-mockup-comparison/` |

### UI 정비 세션이 실제로 처리한 것

- A-1 360px 폭 잘림 → 비율 좌표 (`0688e61`)
- A-2 로그 `scrollIntoView` 가 페이지를 끌던 것 + 부분 점수 표기 (`cedbb56`)
- B-1 한글 웹폰트 Pretendard (`714528f`)
- B-2 하드코딩 hex 14종 → 브랜드 토큰, 다크 대비 미달 3종 (`c0c4fe9`)
- B-4 디자인 문서 색 정본 기재, §6 미결 3건 종결 (`2fb7015`)
- B-5 브라우저 실렌더 확인 → 상단 좌석 홀카드 펠트 이탈 수정 (`cf51653`)

### 엔진 부채 (동결 중, 백로그 D절)

`score.ts` number 분기 꼬리 낙하 · `reduce.ts` `return_uncalled` 음수 하한 ·
`bots.ts` 픽스처 `stacks: []` 함정. 3단계에서 엔진을 여는 김에 같이 볼 수 있다.
