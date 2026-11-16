# 다음 세션 프롬프트 — 홀덤펍 점장, 12판 재미 게이트 → 다음 단계

> 이 파일을 새 세션에 그대로 붙여 넣는다. 매번 **새로 쓴다** — 지난 지시 위에 덧붙이지 않는다.

---

## 0. 먼저 할 것

1. **사용자에게 12판 재미 게이트 답을 받는다** — `DESIGN.md` 맨 아래 「12판 재미 게이트」 여덟 문항.
   답이 없으면 묻고, 답에 맞춰 바꿀 것을 정한 뒤 시작한다. 짐작으로 새 기능을 얹지 않는다.
2. **ECC(Everything Claude Code)** 로 진행한다.
   - 레포 브랜치 `claude/great-ramanujan-r33ul4` 의 `.claude/` 에 프로젝트 단위로 설치돼 있다(v2.2.3, 사용법 `.claude/ECC-사용법.md`).
     그 브랜치를 체크아웃한 세션이면 에이전트(planner · code-reviewer · typescript-reviewer …) · 스킬 · GateGuard 훅이 켜진다.
   - 게임 브랜치 `claude/confident-lovelace-dmv6yd` 는 **git worktree** 로 따로 연다 — 체크아웃을 바꾸면 `.claude/` 가 사라져 훅이 깨진다:
     `git fetch origin claude/confident-lovelace-dmv6yd && git worktree add -B claude/confident-lovelace-dmv6yd ../pub-wt origin/claude/confident-lovelace-dmv6yd`
   - ECC 가 세션에 없으면 한 줄로 알리고 같은 흐름을 기본 도구로 밟는다.
   - 흐름: **계획 → 구현 → `tools/` 자동 점검 → code-reviewer 에이전트(백그라운드로 띄우고 그동안 회귀 점검) → 지적 반영 → 커밋 · 푸시 → 게시**
   - GateGuard: 파일 첫 수정 · 새 파일 · 파괴적 명령(`rm -rf`, `git rm` …) 전에 「사실(쓰는 곳 · 바뀌는 것 · 사용자 지시 원문)」을 먼저 밝히라고 막는다. 밝힌 뒤 **같은 명령을 글자 그대로** 다시 보내야 통과한다

## 1. 프로젝트

- 레포 `snosnosno/dealer-master`, 브랜치 **`claude/confident-lovelace-dmv6yd`** (여기에 커밋 · 푸시)
- 게임은 **`pub-sim/`** — 딜러마스터와 **별도 게임**. 빌드 없음, 폴더째 옮길 수 있다
  - `index.html`(스타일 · 껍데기) · `game.js`(약 3,700줄, 전부 여기, ES5 IIFE) · `vendor/three.min.js`(r149, MIT)
  - `DESIGN.md` — **설계 정본**. §9~§14 판별 피드백, **§15~§20 로드맵 ③~⑦(8~12판)**
  - `tools/` — `build-artifact.py` · `autoplay.js` · `weekend.js` · `noshow.js` · `events.js` · `staff.js` · `decor.js` · `table.js` · `av.js`
- 폰 링크(비공개 Artifact): **https://claude.ai/artifact/K1UXZgBs2dT8LTZvX9X9BP** — 지금 **12판**

## 2. 지금 게임 (12판까지 — 다시 만들지 마라)

- 3D 홀덤펍. 점장을 탭 · WASD 로 걸려 플로어 판정 · 아나운스(레벨마다 정시) · 밸런싱 · 청소. 판정 중 시간 정지
- 하루: 오픈 준비(탭 8 — 상점 · **꾸미기** · 직원 · 칩 구조 · 음료 · 딜러 배치/교육 · 예약 · 단골) → 영업 18:00~02:00(1배속 6분) → 레지 정산 → 보고서
- 직원 채용 · 노쇼 · 대타 · 능력 성장, 주간 캠페인(금 딥스택 · 토 메인 · 일 정산 · 8주 시즌 · 폐업), 단골 12명 · 금/토 예약
- **8판 돌발 이벤트 7종**(`kind:'event'`): 단체 · 인플루언서 · 정전(차단기) · 딜러 다툼 · 칩 환전 요구(거절이 정답) · 취객 · 위생 점검
- **9판 직원 깊이**: 특성 6 · 사기(저장, 20↓ 퇴사) · 칭찬(하루 한 번) · 인상 요청 · 교육 트리(판정 · 속도 · 응대, 판정 2 = 믹스 자격)
- **10판 꾸미기**: 테마 3(클래식 · 라운지 · 네온) · 장식 4(화분 · 소파 · 아트월 · 트로피 진열장) · 배치 모드(금지 구역 붉게) · 반경 3 만족(+0.15/초 상한)
- **11판 테이블 깊이**: 실제 덱 · 보드 카드 면 · 족보 평가기(홀덤 · PLO 하이 · 8-or-better 로우)로 실제 승자 · 「♠ 플러시!」 · 믹스 테이블 PLO8(상점 120만)
- **12판 그래픽 · 사운드**: 머리카락 · 눈 · 팔 · 나비넥타이, WebAudio 라운지 음악(Cmaj7–Am7–Dm7–G7 + 워킹 베이스) · 웅성거림, 🎵/🔊 분리

## 3. 다음 후보 — 게이트 답을 듣고 고른다

- 게이트에서 「바쁘다」면: 이벤트 빈도 · 제한 시간 · 플로어 보조가 맡는 범위를 조정
- 보드가 폰에서 작다면: 테이블을 누르면 확대 카메라 · 보드 카드 크기 · 쇼다운 순간 홀카드 뒤집기 연출
- 판정 사고 확장 — **원문 대조를 마친 TDA 케이스만**. 확인 목록은 `docs/superpowers/plans/2026-11-16-nlh-sandbox-analysis.md` §9
- 밸런싱 이동 좌석 · 새 손님 버튼~BB 착석 · 헤즈업 버튼 — 원문 대조 전이라 **여전히 출제하지 않는다**
- 실제 3D 에셋(Patch · Higgsfield)은 빌드 도구(Vite) 전환과 외부 연결 승인이 필요하다 — **사용자에게 먼저 묻는다**

## 4. 지켜야 할 것

- **합법 운영**: 매출은 참가비 · 음료 · 예약 보증금 · 믹스 참가비뿐. 시상은 트로피 · 시드권. 칩 환전 · 현금 시상 · 상품권 교환은 게임 안에도 없다(환전 요구 이벤트에서도 오답으로만 나온다). 직원 채용에 실제 구인 · 매칭 표현 금지
- **판정 근거**: TDA 케이스 문서, 채점 화면에 「원문 확인 전」. 원문 확인 안 된 규칙은 출제하지 않는다. 응대 교육은 접객 원칙만
- **화면에 답 노출 금지** — 선택지는 섞고 「권장」 표시 없음. HUD 에 블라인드 금액 · 레벨 번호를 띄우지 않는다
- 사용자가 좋아한 것: 직접 걷기 · 정시 아나운스 · 세팅 단계 · 공부가 되는 퀴즈 · 연출. 싫어한 것: 너무 바쁨 · 말풍선이 가림 · 답이 보이는 것
- 모바일 우선(세로 화면 · 하단 할 일 목록), `prefers-reduced-motion`, 색은 토큰 + 다크 모드. UI 문구 · 커밋 메시지는 한국어
- 모달 중엔 시뮬레이션 정지, 효과는 실시간. 자동 점검 훅은 `window.__pub`(= `G`), 열린 문제는 `G.current.correct`

## 5. 검증 · 게시 절차

```bash
cd pub-sim
node -e "new Function(require('fs').readFileSync('game.js','utf8'))"   # 문법
node tools/autoplay.js 2 perfect          # 이틀(약 5분) — errors [] · 두 날 모두 우승자가 나오는지
node tools/weekend.js; node tools/noshow.js
node tools/events.js [handle|timeout] [종류,…]   # 돌발 이벤트
node tools/staff.js; node tools/decor.js [shot]; node tools/table.js [shot]; node tools/av.js [shot]
python3 tools/build-artifact.py <스크래치패드>/pub-artifact
cp game.js <스크래치패드>/pub-artifact/game.js; mkdir -p <스크래치패드>/pub-artifact/vendor; cp vendor/three.min.js <스크래치패드>/pub-artifact/vendor/
```

- 점검 도구는 **현재 폴더에 스크린샷을 남긴다** — 스크래치패드에서 실행한다(`pub-sim/.gitignore` 가 `*.png` 를 막는다)
- 게시: Artifact 도구로 `<스크래치패드>/pub-artifact/index.html` 을 publish, `files` 에 `{"game.js": …/pub-artifact/game.js, "vendor/three.min.js": …/pub-artifact/vendor/three.min.js}`
  (파일은 작업 폴더나 스크래치패드 안이어야 한다), **url 은 위 링크**, `label` 은 「13판 — …」
- 새 대화에서는 먼저 `action: "read"` 로 읽는다. 게시된 `game.js` 를 안 읽었다고 막히면 `list`(scope files) · 레포 커밋의 sha256 과 비교해 같은 판인지 확인한다

## 6. 끝나면

`DESIGN.md` 에 §21~ 로 게이트 답 · 변경 · 자동 점검 결과를 남기고, 사용자에게 링크와 다음 재미 게이트 질문을 준다.
이 파일을 다음 세션용으로 **새로 쓴다**.
