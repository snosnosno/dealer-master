# 다음 세션 프롬프트 — 2단계 구현 (서브에이전트 주도)

아래 블록을 새 세션에 그대로 붙여넣으세요.

---

```
시뮬레이터 2단계(테이블뷰와 재생)를 구현해줘. 설계와 계획서는 이미 승인돼 있다 —
이번 세션은 계획서를 태스크 단위로 실행하는 일이다.

`superpowers:subagent-driven-development` 로 진행해라. 태스크마다 새 서브에이전트를
띄우고, 그 결과를 네가 독립 검증한 뒤 다음 태스크로 간다.

## 지금 상태 (이 세션의 실제 명령으로 검증된 값)

브랜치 `feat/simulator-table-view`, HEAD `0bd057e`.
`origin/main` 보다 2커밋 앞서 있고(설계 문서 + 계획서) push 는 안 했다.
트리 clean(`.claude/` 만 untracked). npm 명령은 전부 `app/` 에서 돈다.

게이트: `npm test` 215/215(13파일) · `npm run typecheck` exit 0 · `npm run lint` exit 0.

`app/src/components/` 는 **아직 없다.** 이번 세션이 처음 만든다.
`app/src/app/page.tsx` 는 아직 Next.js 기본 템플릿이다 — Task 9 가 교체한다.

## 읽을 것 (순서대로)

1. `docs/superpowers/plans/2026-08-29-simulator-table-view.md` — **정본이다.**
   Task 1~10, 실제 코드와 실행 명령·기대 출력이 전부 들어 있다.
   맨 앞의 **Global Constraints** 와 **엔진이 하지 않는 약속** 을 먼저 읽어라
2. `docs/superpowers/specs/2026-08-29-simulator-table-view-design.md` — 왜 그렇게
   짓는지의 근거. 계획서가 애매하면 여기로 온다
3. `app/src/lib/simulator/index.ts` — 쓸 수 있는 API 의 전부다

상위 스펙(`2026-08-25-dealer-simulator-design.md`)과 1단계 백로그는 이미 위 두 문서에
반영돼 있다. 처음부터 다시 읽을 필요 없다.

## 절대 건드리지 않는 것

- **엔진 `app/src/lib/simulator/`** — 파일을 고치지도, 거기에 파일을 추가하지도 마라.
  import 는 항상 `@/lib/simulator` 에서 한다(개별 모듈 직접 import 금지).
  2단계가 엔진 변경을 요구한다고 판단되면 **고치지 말고 그 판단을 보고**해라
- **하네스 `app/src/app/simulator-harness/`** — 수정도 삭제도 금지. 엔진 회귀 확인에 쓴다.
  그 `format.ts` 의 `describeEvent` 는 좌석을 `#4` 처럼 0-based 로 찍으므로
  **학습자 화면에 재사용 금지** (Task 3 이 제품용 포매터를 따로 만든다)
- **`app/vitest.config.mts`** — `include: ['src/**/*.test.ts']` 가 새 테스트를 이미 잡는다
- **`app/package.json`** — 새 의존성 0개. jsdom·@testing-library·애니메이션 라이브러리
  전부 도입 금지다. 그러려고 순수 리듀서 구조를 고른 것이다

## 서브에이전트 디스패치 규칙

- 구현 태스크(1~9)는 `model: "opus"` — 구현·작성 계층
- 태스크 사이 검토는 `code-reviewer`(`fable`). 다만 **1~2파일 저위험 diff 는
  `model: "opus"` 오버라이드 허용**
- **에이전트의 "성공" 보고를 그대로 믿지 마라.** `git diff` 와 실제 테스트 실행으로
  독립 검증한 뒤에 다음 태스크로 간다
- 디스패치 프롬프트에 위 "절대 건드리지 않는 것" 을 그대로 실어라. 계획서를 안 읽은
  에이전트가 엔진을 "개선" 하려 드는 것이 가장 흔한 사고다

## 태스크 순서와 의존

```
Task 1  player.ts (재생 상태기계)        ← 이 계획의 심장. 여기부터
Task 2  geometry.ts + chips.ts           ┐ Task 1 과 독립 — 동시 디스패치 가능
Task 3  log.ts (학습자용 포매터)          ┘
Task 4  테이블 뷰 4종 + globals.css      ← Task 2·3 필요
Task 5  ActionLog                        ← Task 3 필요
Task 6  DecisionPrompt                   ← Task 3 필요
Task 7  HandReview                       ← 독립
Task 8  hand.ts + HandPlayer             ← Task 1·4·5·6·7 전부 필요
Task 9  라우트 (/ 와 /simulator)          ← Task 8 필요
Task 10 브라우저 실렌더 검증              ← 전부 필요
```

Task 2·3 은 Task 1 과 독립이므로 한 메시지에 같이 디스패치해도 된다.
Task 5·6·7 도 Task 3 이 끝나면 셋이 독립이다.

## 이 계획의 핵심 — Task 1 과 Task 10 Step 5

설계 착수 전 엔진을 직접 돌려 찾은 결함이 하나 있고, 계획서 전체가 그것을 중심으로 짜여
있다. **이걸 모르고 구현하면 조용히 망가진다.**

`showdown` 문항의 앵커는 `events.length`(배열 끝 너머)이고 `calculation` 문항은 첫
`award_pot` 자리다. 이벤트를 순서대로 재생하면 **`award_pot` 애니메이션이 승자를
보여준 뒤에 "누가 이겼나" 를 묻게 된다** — 답을 보여주고 문제를 내는 것이다.

엔진 버그가 아니다. `atEventIndex` 는 "이 인덱스의 이벤트를 적용하기 전" 이고 두 앵커
모두 정의상 정확하다. 해법은 `player.ts` 의 두 줄이다:

```ts
const stopAt = pending.length > 0
  ? Math.min(pending[0].atEventIndex, sealIndex)   // sealIndex = 첫 award_pot
  : events.length
```

Task 1 의 첫 테스트가 이것의 회귀 테스트고, Task 10 Step 5 가 브라우저에서 눈으로
확인하는 절차다. **둘 중 하나라도 건너뛰지 마라.**

## 작업 방식

- 계획서의 각 Step 은 그대로 실행하라. 테스트를 먼저 쓰고, **실패하는 것을 확인하고**,
  구현하고, 통과를 확인하고, 커밋한다. RED 를 건너뛴 GREEN 은 증거가 아니다
- 테스트가 빨간데 통과시키려고 **테스트를 느슨하게 고치지 마라.** 구현을 고쳐라
- 완료 주장은 **이 세션의 실제 도구 출력**에만 근거해라. 통과 개수와 exit 코드를
  그대로 보고한다
- 계획서와 실제 코드가 어긋나면 계획서를 갱신해라(R12-b). 이 레포는 계획서를 정본으로
  쓰고, 어긋난 채 두면 다음 사람이 낡은 코드를 재생성한다
- push 와 PR 은 **명시 요청 없이 하지 마라.** 로컬 커밋만

## Task 10 은 실제 브라우저다

컴포넌트를 단위 테스트하지 않기로 한 대가를 여기서 치른다. **정적 파싱은 관찰이 아니다.**
`cd app && npm run dev` 로 띄우고 실제로 눌러 봐야 한다.

주의: 3000번에 dev 서버가 이미 떠 있을 수 있다. 그러면 새로 띄우지 말고 그걸 써라
(Next 가 "Another next dev server is already running" 으로 거부한다).

playwright MCP 로 볼 때 `Browser is already in use ... mcp-chrome-<id>` 가 나오면
프로필이 다른 인스턴스에 잠긴 것이다. 사용자의 Chrome 을 죽이지 말고, 사용자에게
알리고 수동 확인을 요청해라.

## 2단계 범위가 아닌 것 — 끌어오지 마라

이상감지(B) 모드 · 이상 상황 삽입 · 타이밍 채점 · `hand_sessions` 저장 ·
등급 계산과 표시(`gradeFrom` 호출 금지) · 스트릭 · 대시보드 · 축1 TDA 케이스 화면 ·
오답 분기 전개 · 9-max · 팟리밋/픽스드리밋 · 스터드/드로우.

1단계 백로그 D·E절 유예 Minor 약 28건도 범위 밖이다. 눈에 걸려도 **고치지 말고 보고**해라 —
`score.ts` 의 `number` 분기 꼬리 낙하 · `reduce.ts` 의 `return_uncalled` 음수 하한 ·
`bots.ts` 픽스처의 `stacks: []` 함정.
```

---

## 참고 — 지금까지 끝난 것

| 단계 | 결과 |
|---|---|
| 1단계 엔진 코어 | ✅ Task 1~10 + 최종 리뷰·수정·재검토. main 머지·push 완료 |
| TDA 조항 대조 | ✅ 원문 2종으로 전건 대조 |
| 문서 부채 (R45·R46·R47) | ✅ 완료. 계획서 코드블록 드리프트 0 |
| C절 설계 결정 6건 | ✅ 창 N=20 · require 정직성 · `(number\|null)[]` · master 미노출 · Rule 12 · 선택지 균일화 |
| 확인용 하네스 | ✅ `/simulator-harness` |
| **2단계 설계** | ✅ `specs/2026-08-29-simulator-table-view-design.md` (커밋 `4ed5e11`) |
| **2단계 계획서** | ✅ `plans/2026-08-29-simulator-table-view.md` Task 1~10 (커밋 `0bd057e`) |

**2단계 설계에서 결정된 것** (스펙 §11 미결정 1건 해소 포함):

- 대시보드를 만들지 않는다 — 축 3종 선택 화면만. 등급 표시는 3단계 (§11 항목 해소)
- 순수 TS 리듀서 + 멍청한 뷰 — jsdom·@testing-library 미도입
- 좌석 타원 배치에서 **하단 중앙을 딜러 자리로 비운다** (목업 배치 변경)
- `require` 를 시드가 결정한다 — 1/3 사이드팟. 컨트롤 미노출 + 재현성 유지
- 좌석 선택은 항상 다중 — 단일 선택은 정답 개수를 유출한다
- 설계 §4-3 애니메이션 11항목 중 `fold` 슬라이드·`check` 펄스 2항목은 축소(계획서 Task 4 Step 6에 근거 명시)

**3단계 예고**: 이상감지 모드와 기록. `master` 등급의 나머지 절반, 스펙 §11 의 미결정
2건(이상 발생 빈도, `detectWindow` 폭), `hand_sessions` 저장과 등급 표시가 그때 결정된다.
