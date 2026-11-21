# 다음 세션 프롬프트 — 홀덤펍 점장 1.4.1 뒤

> 이 파일을 새 세션에 그대로 붙여 넣는다. 매번 **새로 쓴다** — 지난 지시 위에 덧붙이지 않는다.

---

## 0. 먼저 할 것

1. **사용자에게 소감을 받는다** — 지난 세션(1.4.1)도 플레이 소감 없이 「추천으로 진행」이었다. 그래서 사람이 해 봐야 답할 수 있는 질문이 그대로 남아 있다:
   `DESIGN.md` §27 「1.4 해 보고 답해 줄 것」 셋(⚡ 막대 · 연습실 · 도감 보상), §25 넷(판정 빈도 · 글 길이 · 이상한 케이스 — 「정답이 길이로 보이나」는 1.4.1 에서 측정으로 고쳤다), §24 넷(1.1 리디자인), §22 14판 게이트 셋, §23 「밸런스 메모」 · 「출시 전에 사람이 할 것」 넷.
   답이 오기 전에는 새 기능을 얹지 않는다(출시판이다 — 버그 · 밸런스 · 사람이 정한 것만).
   또 「추천으로」라고 하면: 사람 없이 **잴 수 있는 것**만 고른다(1.4.1 처럼). 남은 후보는 §3.
2. **ECC** 로 진행한다 — `.claude/` 에 설치돼 있다(사용법 `.claude/ECC-사용법.md`).
   - 흐름: **계획 → 구현 → `tools/` 자동 점검 → code-reviewer 에이전트(백그라운드, 그동안 회귀 점검) → 지적 반영 → 커밋 · 푸시 → 게시**
   - GateGuard: 첫 Bash · 파일 첫 수정 전에 「사실(쓰는 곳 · 바뀌는 것 · 사용자 지시 원문)」을 밝히라고 막는다. 밝힌 뒤 **같은 명령을 그대로** 다시 보낸다
   - `sed`/스크립트로 `game.js` 를 고친 뒤 편집 도구를 쓰려면 고칠 줄을 `Read` 로 다시 읽는다

## 1. 프로젝트 · 브랜치

- 레포 `snosnosno/dealer-master`. 게임은 **`pub-sim/`** — 딜러마스터와 **별도 게임**, 빌드 없음
  - `index.html` · `game.js`(약 4,400줄, ES5 IIFE) · `vendor/three.min.js`(r149, MIT)
  - `DESIGN.md` — 설계 정본(§9~§28). 실행 · 배포는 `README.md`
  - `tools/` — `build-artifact.py` · `autoplay.js` · `weekend.js` · `noshow.js` · `events.js` · `staff.js` · `decor.js` · `table.js` · `av.js` · `growth.js` · `week.js` · `release.js` · `cases.js` · `drill.js`
- **브랜치**: 1.4 까지는 `claude/confident-lovelace-dmv6yd`. 1.4.1 은 세션 브랜치 `claude/wizardly-turing-61nkca` 에 있다(1.4 를 병합한 뒤 커밋).
  새 세션이 또 다른 브랜치로 열리면: 그 세션이 푸시할 수 있는 브랜치에 **`claude/wizardly-turing-61nkca` 를 병합**하고 거기서 일한다. 어느 쪽이 최신인지는 `git log` 로 확인
- 폰 링크(비공개 Artifact): **https://claude.ai/artifact/K1UXZgBs2dT8LTZvX9X9BP** — 지금 **1.4.1**(Version 22)

## 2. 지금 게임 (1.4.1 까지 — 다시 만들지 마라)

- 3D 홀덤펍. 점장을 탭 · WASD 로 걸려 플로어 판정 · 아나운스 · 밸런싱 · 청소. 판정 중 시간 정지
- 하루: 오픈 준비(탭 8) → 영업 18:00~02:00(1배속 6분) → 레지 정산 → 보고서. 주간 캠페인 · 8주 시즌 · 단골 12명 · 예약
- 8판 돌발 7종 · 9판 직원 깊이 · 10판 꾸미기 · 11판 테이블(족보 · 보드 · PLO8) · 12판 그래픽 · 사운드 · 13판 성장 길 넷 + 난이도 곡선 · 14판 주간 도전 · 쇼다운 연출
- 1.0 설정 · 일시정지 · 도움말 · 기록 · 오류 안전망 · 1.1 리디자인 · 1.2 케이스 판정 27종 · 1.3 도감 · 1.4 ⚡ 막대 · 연습실 · 도감 보상
- **1.4.1**: 선택지 길이로 정답이 보이던 것 — 케이스 · 응대 교육 · 돌발(다툼 · 환전)의 **오답 문장**을 늘려 맞췄다(§28). 정답 문장은 그대로

## 3. 다음 후보

사람 답에 따라:
- 난이도 → `diffK` 분모(42) · `planEvents` · `pickType` · `startHand` · 대기 만족 감소
- 성장 길 → 실전 경험량 · 멘토 +35 · 세미나 가격 / 시즌 동기 → `WEEK_CH` · 시즌 보상 · 단골 이야기
- 케이스 → 빈도(`startHand` 의 `case`) · 사용자가 꼽은 케이스 / ⚡ 시간(`6 + 글자 수 / 18`) · `QUICK_BONUS`
- 판정 확장은 **원문 대조를 마친 TDA 규칙만**(`docs/superpowers/plans/2026-11-16-nlh-sandbox-analysis.md` §9). 밸런싱 이동 좌석 · 새 손님 버튼~BB · 헤즈업 버튼 · 팟 리밋 레이즈는 출제하지 않는다

사람 없이 잴 수 있는 것(「추천으로」일 때):
- **시즌이 너무 쉬운가** — 고친 자동 플레이(배속 3)에서 정답만 고르는 점장이 1일차 평판 98, **1주차 금요일에 시즌 목표(평판 85 + 자금 500만)를 넘는다**(시즌은 8주, 1.0 QA 는 1주차 끝 274만). 사람은 느리지만 가장 먼저 물어볼 밸런스 질문이다 — §28. 손볼 곳: 시즌 목표치 · 케이스 · 콤보 · ⚡ 평판 · 평일 순이익
- 상황 글 길이(케이스 중앙값 60자 · 최장 7번 123자) — 폰 한 화면에 들어가는지 스크린샷으로
- 실제 3D 에셋은 사용자가 「나중에」 — 먼저 꺼내지 않는다

## 4. 지켜야 할 것

- **합법 운영**: 매출은 참가비 · 음료 · 예약 보증금 · 믹스 참가비뿐. 시상은 트로피 · 시드권. 칩 환전 · 현금 시상 · 상품권 교환은 게임 안에도 없다(환전 이벤트에서도 오답으로만 — 오답 문장이 **정당해 보이지 않게**, 높임말 금지). 직원 채용에 실제 구인 · 매칭 표현 금지
- **판정 근거**: TDA 케이스 문서, 채점 화면에 「원문 확인 전」. 응대 교육은 접객 원칙만
- **화면에 답 노출 금지** — 선택지는 섞고 「권장」 없음. **선택지 길이도 답이 된다**: 문장을 바꾸면 `ch[0]`(정답)이 혼자 가장 긴지 다시 잰다(§28 의 측정 방식 — `CASES` · `SERVICE_QS` 를 잘라 `new Function` 으로 읽는다). 오답을 늘릴 땐 그럴듯해서 정답처럼 읽히지 않게
- HUD 에 블라인드 금액 · 레벨 번호를 띄우지 않는다
- 사용자가 좋아한 것: 직접 걷기 · 정시 아나운스 · 세팅 단계 · 공부가 되는 퀴즈 · 연출 · 긴장감 · 결정감 · 조금씩 오르는 난이도. 싫어한 것: 너무 바쁨 · 말풍선이 가림 · 답이 보이는 것
- 모바일 우선 · `prefers-reduced-motion` · 색은 토큰 + 다크 모드. UI 문구 · 커밋 메시지는 한국어
- 모달 중엔 시뮬레이션 정지. 자동 점검 훅은 `window.__pub`(= `G`), 열린 문제는 `G.current.correct`
- 자동 플레이에서 **두 날 모두 우승자** — 결판 속도는 `endHand` 의 레지 마감 뒤 배율(3.2) · 탈락 상한(0.9)

## 5. 검증 · 게시 절차

```bash
cd pub-sim
node -e "new Function(require('fs').readFileSync('game.js','utf8'))"   # 문법
node tools/autoplay.js 2 perfect          # errors [] · 두 날 모두 우승자 · 판정 못 감 0 에 가깝게
node tools/weekend.js; node tools/noshow.js
node tools/events.js [handle|timeout] [종류,…]
node tools/cases.js [shot]   # bad [] · mix 에 X 없음
node tools/drill.js [shot]
node tools/staff.js; node tools/growth.js [shot]; node tools/week.js [shot]; node tools/release.js [shot]; node tools/decor.js [shot]; node tools/table.js [shot]; node tools/av.js [shot]
python3 tools/build-artifact.py <스크래치패드>/pub-artifact
cp game.js <스크래치패드>/pub-artifact/game.js; mkdir -p <스크래치패드>/pub-artifact/vendor; cp vendor/three.min.js <스크래치패드>/pub-artifact/vendor/
```

- **자동 플레이 주의(1.4.1 에서 발견)**: 클라우드 컨테이너는 소프트웨어 그래픽이라 약 8fps. 예전 도구는 10배속 고정이라 봇이 할 일을 다 놓쳐(클릭 471 중 469 빗나감) 평판이 0 으로 무너졌다 — **게임 버그가 아니다**(1.4 코드도 똑같았다).
  지금 `autoplay.js` 는 fps 를 재서 20 미만이면 배속 3(`AP_SPEED` 로 고정 가능)으로 돌리고, 결과에 `seen.speed` · `seen.fps` · `seen.clickMiss` 를 남긴다. **`clickMiss` 가 많으면 결과를 믿지 마라.** 배속 3이라 하루 약 7~10분 — 7일은 백그라운드로
- 점검 도구는 실행한 폴더에 스크린샷을 남긴다 — 스크래치패드에서 실행한다. 여러 도구를 동시에 돌리면 더 느려진다
- 게시: Artifact 도구로 `<스크래치패드>/pub-artifact/index.html` 을 publish, `files` 에 `{"game.js": …, "vendor/three.min.js": …}`, **url 은 위 링크**, `label` 은 「1.4.x — …」(game.js 의 VERSION 도 함께 올린다)
- 새 대화에서는 먼저 `action: "read"` 로 읽고, 게시된 `game.js` 도 `path: "game.js"` 로 읽는다(안 읽으면 게시가 막힌다). 레포 커밋의 sha256 과 같은지 확인한다

## 6. 끝나면

`DESIGN.md` 에 §29~ 로 게이트 답 · 변경 · 자동 점검 결과를 남기고, 사용자에게 링크와 다음 재미 게이트 질문을 준다. 이 파일을 다음 세션용으로 **새로 쓴다**.
