# 다음 세션 프롬프트 — 홀덤펍 점장 1.6 「이야기」 뒤

> 이 파일을 새 세션에 그대로 붙여 넣는다. 매번 **새로 쓴다** — 지난 지시 위에 덧붙이지 않는다.

---

## 0. 먼저 할 것

1. **사용자에게 1.6 · 1.5 소감을 받는다** — `DESIGN.md` §32 끝 「1.6 해 보고 답해 줄 것」(이야기 · 챔피언십), §31 끝(라이벌 · 딜러 실수 · 업적). 1.4.x 질문(§29 시즌 목표 1,500만 · 작은 폰 글씨 · ⚡ 막대)도 아직 열려 있다.
   - 답이 오면 그에 맞춰 고친다. 「추천으로」면 사람 없이 **잴 수 있는 것**만(§3 아래쪽).
   - 「새로운것들」이면 §30 기획안의 남은 후보(E 2층 확장 · G 손님 사연 — B · C 는 1.6 에서 만들었다)에서 고르게 한다 — `AskUserQuestion` 으로.
2. **ECC** 로 진행한다 — `.claude/` 에 설치(사용법 `.claude/ECC-사용법.md`).
   - 흐름: **계획 → 구현 → `tools/` 자동 점검 → code-reviewer 에이전트(백그라운드, 그동안 회귀 점검) → 지적 반영 → 커밋 · 푸시 → 게시**
   - GateGuard: 첫 Bash · 파일 첫 수정 · 새 파일 전에 「사실(쓰는 곳 · 바뀌는 것 · 데이터 꼴 · 사용자 지시 원문)」을 밝히라고 막는다. 밝힌 뒤 **같은 명령을 그대로** 다시 보낸다. 「검색」은 Grep/Glob 도구로 해야 인정된다
   - `sed`/스크립트로 고친 파일을 편집 도구로 다시 고치려면 그 줄을 `Read` 로 다시 읽는다

## 1. 프로젝트 · 브랜치

- 레포 `snosnosno/dealer-master`. 게임은 **`pub-sim/`** — 딜러마스터와 **별도 게임**, 빌드 없음
  - `index.html` · `game.js`(약 4,700줄, ES5 IIFE) · `vendor/three.min.js`(r149, MIT)
  - `DESIGN.md` — 설계 정본(§9~§32). 실행 · 배포는 `README.md`
  - `tools/` — `build-artifact.py` · `autoplay.js`(perfect · **human** · random) · `ach.js` · `spot.js` · `rival.js` · `story.js` · `cases.js` · `drill.js` · `events.js` · `staff.js` · `growth.js` · `week.js` · `release.js` · `decor.js` · `table.js` · `av.js` · `weekend.js` · `noshow.js`
- **브랜치**: 1.4.1 부터는 `claude/wizardly-turing-61nkca`(1.4 브랜치 `claude/confident-lovelace-dmv6yd` 를 병합해 이어 감). 새 세션이 다른 브랜치로 열리면 그 브랜치에 `claude/wizardly-turing-61nkca` 를 병합하고 거기서 일한다
- 폰 링크(비공개 Artifact): **https://claude.ai/artifact/K1UXZgBs2dT8LTZvX9X9BP** — 지금 **1.6**

## 2. 지금 게임 (1.6 까지 — 다시 만들지 마라)

- 3D 홀덤펍. 점장을 탭 · WASD 로 걸려 플로어 판정 · 아나운스 · 밸런싱 · 청소. 판정 중 시간 정지
- 하루: 오픈 준비(탭 8) → 영업 18:00~02:00 → 레지 정산 → 보고서. 주간 캠페인 · 8주 시즌(목표 평판 85 + 자금 **1,500만**) · 단골 12명 · 예약
- 8~14판: 돌발 7종 · 직원 깊이 · 꾸미기 · 테이블(족보 · PLO8) · 그래픽 · 사운드 · 성장 길 · 난이도 곡선 · 주간 도전 · 쇼다운 연출
- 1.0~1.4: 설정 · 일시정지 · 도움말 · 기록 · 리디자인 · 케이스 판정 27종 · 도감 · ⚡ 막대 · 연습실
- 1.4.1 선택지 길이로 정답이 보이던 것 · 1.4.2 작은 폰 판정 창 · 시즌 목표 1,500만
- **1.5**: 🎖️ 업적 34개 · 칭호(명예뿐) · 🔍 딜러 실수 잡기(`spot` 호출 — 누가 이겼나 · 팟 나누기, 족보 · 셈이라 「원문 확인 전」 없음) · 🥊 라이벌 「로열 라운지」(일요일 한 주 손님 수 대결 · 2주차부터 월요일 수 하나를 막거나 둔다)
- **1.6**: 📖 단골 이야기(여섯 × 3막, 하루 한 장면, 정답 없는 대답 · 3막 장식 선물) · 🏆 시즌 포인트(방문 +1 · 우승 +10) · 8주마다 토요일 시즌 챔피언십(상위 여섯 초대 · 챔피언) · 업적 38개

## 3. 다음 후보

사람 답에 따라:
- 라이벌이 쉽다/어렵다 → `rivalBase`(170 + 20×(주차−1)) · 수의 효과(`rivalArrK` 0.85/0.9 · +8%) · 막기 비용(`RIVAL_MOVES`) · 승패 평판(+2/−1)
- 딜러 실수가 잦다/드물다 → `startHand` 의 types 에 `spot` 두 개(약 20%) · 「누가 이겼나」/「팟」 비율(0.62)
- 업적 조건 숫자 → `ACHS`
- 이야기 조건 · 글 → `STORY_NEED` · `STORIES`, 챔피언십 → `CHAMP_N` · `champSchedule`
- 시즌 목표 1,500만 · 평판 상승 속도(4일차 100)

사람 없이 잴 수 있는 것(「추천으로」일 때):
- **`autoplay.js 7 human`** 을 여러 번 — 라이벌 승패가 주차마다 어떻게 되나(1주차는 이길 만, 후반은 버거워야), 시즌 1,500만이 몇 주차에 닿나. 컨테이너가 재시작되면 긴 실행이 끊긴다(§5)
- 라이벌 수를 매번 그냥 둔 봇 vs 매번 막은 봇 — 막기 비용이 값어치를 하나

## 4. 지켜야 할 것

- **합법 운영**: 매출은 참가비 · 음료 · 예약 보증금 · 믹스 참가비뿐. 시상은 트로피 · 시드권. 칩 환전 · 현금 시상 · 상품권은 게임 안에도 없다(이벤트 오답으로만, 오답 문장이 정당해 보이지 않게). **라이벌도 같다**. 직원 채용에 실제 구인 · 매칭 표현 금지
- **판정 근거**: TDA 케이스 문서는 「원문 확인 전」. 원문 대조 안 된 규칙은 출제하지 않는다(칩 레이스 · 컬러업 · 밸런싱 이동 좌석 · 헤즈업 버튼 · 팟 리밋 레이즈). 규칙이 아닌 족보 · 셈은 된다(`spot`)
- **화면에 답 노출 금지** — 선택지는 섞고 「권장」 없음. **선택지 길이 · 숫자 크기 순서도 답이 된다**: 문장을 바꾸면 정답이 혼자 가장 긴지(§28 방식), 숫자 문제면 정답의 크기 순위가 고른지(`tools/spot.js` 방식) 잰다
- HUD 에 블라인드 금액 · 레벨 번호를 띄우지 않는다. 영업 중 할 일을 늘리지 않는다(「너무 바쁨」)
- 사용자가 좋아한 것: 직접 걷기 · 정시 아나운스 · 세팅 단계 · 공부가 되는 퀴즈 · 연출 · 긴장감 · 결정감 · 조금씩 오르는 난이도. 싫어한 것: 너무 바쁨 · 말풍선이 가림 · 답이 보이는 것
- 모바일 우선(작은 폰 iPhone SE 568px 도 판정 창이 스크롤 없이) · `prefers-reduced-motion` · 색은 토큰. UI 문구 · 커밋 메시지는 한국어
- 자동 점검 훅은 `window.__pub`(= `G`), 열린 문제는 `G.current.correct`. 1.6 훅: `__story · __champ · __report` · 1.5 훅: `__achs · __checkAch · __openAch · __achGot · __spotGen · __spotCall · __rival · __prep · __save · __best · __cmp`

## 5. 검증 · 게시 절차

```bash
cd pub-sim
node -e "new Function(require('fs').readFileSync('game.js','utf8'))"   # 문법
node tools/autoplay.js 2 human            # errors [] · 두 날 모두 우승자 · clickMiss 적게 (perfect 는 위 한계, human 이 사람에 가깝다)
node tools/ach.js; node tools/spot.js; node tools/rival.js; node tools/story.js   # 1.5 · 1.6 — bad [] · errors []
node tools/cases.js; node tools/drill.js; node tools/events.js handle; node tools/events.js timeout
node tools/staff.js; node tools/growth.js; node tools/week.js; node tools/release.js; node tools/decor.js; node tools/table.js; node tools/av.js; node tools/weekend.js; node tools/noshow.js
python3 tools/build-artifact.py <스크래치패드>/pub-artifact
cp game.js <스크래치패드>/pub-artifact/game.js; mkdir -p <스크래치패드>/pub-artifact/vendor; cp vendor/three.min.js <스크래치패드>/pub-artifact/vendor/
```

- 클라우드 컨테이너는 소프트웨어 그래픽(약 8~10fps) — `autoplay.js` 가 fps 를 재서 배속 3 으로 돈다(하루 약 10분). `clickMiss` 가 많으면 결과를 믿지 마라
- **컨테이너가 재시작되면 백그라운드 실행이 사라진다**(1.5 · 1.6 작업 중 여러 번 — `AP_LOG=파일` 로 하루마다 남기고, 긴 실행은 `nohup` 으로 띄운다). 긴 점검은 쪼개고, 커밋 · 푸시를 자주
- 점검 도구는 실행한 폴더에 스크린샷을 남긴다 — 스크래치패드에서 실행. 여러 도구를 동시에 돌리면 느려진다
- 게시: Artifact 도구로 `<스크래치패드>/pub-artifact/index.html` 을 publish, `files` 에 `{"game.js": …, "vendor/three.min.js": …}`, **url 은 위 링크**, `label` 「1.6.x — …」(game.js 의 VERSION 도 함께)
- 새 대화에서는 먼저 `action: "read"` 로 읽고, 게시된 `game.js` 도 `path: "game.js"` 로 읽는다(안 읽으면 게시가 막힌다). 레포 커밋의 sha256 과 같은지 확인

## 6. 끝나면

`DESIGN.md` 에 §33~ 로 게이트 답 · 변경 · 자동 점검 결과를 남기고, 사용자에게 링크와 다음 질문을 준다. 이 파일을 다음 세션용으로 **새로 쓴다**.
