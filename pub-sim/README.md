# 홀덤펍 점장 1.0

3D 홀덤펍 경영 시뮬레이션. 점장이 되어 직접 걸어 다니며 플로어 판정 · 아나운스 · 밸런싱 · 청소를 처리하고,
직원을 키우고 펍을 꾸며 8주 시즌 안에 동네의 **홀덤 명소**를 만든다.

> 이 게임에는 실제 돈 · 칩 환전 · 현금 시상이 없다. 게임 속 매출도 참가비와 음료뿐이고, 우승 상품은 트로피와 시드권이다.

## 실행

빌드도 서버도 필요 없다. `index.html` 을 브라우저로 열면 된다.

- 의존: `vendor/three.min.js` (three.js r149, MIT) — 폴더에 들어 있다
- 글꼴은 Google Fonts 에서 받는다. 오프라인이면 시스템 글꼴로 바뀔 뿐이다
- 저장은 브라우저 localStorage 에 마감마다 (`pubsim.save.v1`). 설정은 `pubsim.settings`, 시즌 기록은 `pubsim.records`

### 배포

정적 파일 셋이면 된다 — `index.html` · `game.js` · `vendor/three.min.js`. 어떤 정적 호스팅(GitHub Pages, Netlify, S3 …)에 폴더째 올리면 된다.
claude.ai Artifact 로 올릴 때는 `python3 tools/build-artifact.py <출력 폴더>` 로 게시용 `index.html` 을 만든다(노치 · 측면 여백 보정).

## 조작

| 무엇 | 폰 | PC |
|---|---|---|
| 점장 걷기 | 바닥 탭 | 바닥 클릭 · WASD · 방향키 |
| 할 일 처리 | 아래 할 일 목록 탭 → 점장이 걸어가 처리 | 오른쪽 목록 클릭 |
| 카메라 | 드래그 회전 · 두 손가락 확대 | 드래그 · 휠 |
| 일시정지 · 메뉴 | ❚❚ | ❚❚ · **Esc** |
| 배속 | 배속 버튼(1 → 2 → 4) | 1× · 2× · 4× |

## 담긴 것

- 하루: 오픈 준비(상점 · 꾸미기 · 직원 · 칩 구조 · 음료 · 딜러 배치/교육 · 예약 · 단골) → 영업 18:00~02:00 → 레지 정산 → 보고서
- 플로어 판정 넷(버튼 위치 · 카드 장수 · 레이즈 금액 · 데드 버튼), 레벨마다 정시 아나운스, 밸런싱 · 청소
- 직원 다섯 역할 · 노쇼 · 대타 · 특성 · 사기 · 교육 트리(교육 · 실전 · 멘토 · 세미나)
- 돌발 상황 일곱(단체 · 인플루언서 · 정전 · 딜러 다툼 · 칩 환전 요구 · 취객 · 위생 점검)
- 단골 12명 · 금/토 예약 · 테마 셋 · 장식 넷과 배치 · 실제 카드와 족보 · PLO8 믹스 테이블
- 주간 캠페인(요일별 대회 · 주간 도전 · 일요일 정산) · 8주 시즌 · 6주에 걸쳐 오르는 난이도
- WebAudio 라운지 음악 · 웅성거림 · 효과음, 설정(음량 · 그래픽 · 움직임 줄이기 · 잡담), 도움말

## 판정 근거에 대해

판정 문제의 정답은 딜러마스터 레포의 TDA 케이스 문서를 따른다. **원문 대조 전**이라 채점 화면에 「원문 확인 전」을 붙였고,
원문이 확인되지 않은 규칙(밸런싱 이동 좌석 · 새 손님의 버튼~BB 착석 · 헤즈업 버튼 · 팟 리밋 레이즈)은 문제로 내지 않는다.
실제 대회의 판정은 그 대회의 규정과 플로어를 따른다.

## 개발

- 설계와 판별 기록: `DESIGN.md` · 다음 작업 지시: `NEXT-SESSION-PROMPT.md`
- 자동 점검(Playwright · SwiftShader): `tools/` — `autoplay.js <일수> perfect|random` · `weekend.js` · `noshow.js` · `events.js` · `staff.js` · `growth.js` · `decor.js` · `table.js` · `av.js` · `week.js` · `release.js`

## 라이선스 · 크레딧

- three.js r149 — MIT License (`vendor/THREE-LICENSE`)
- Noto Sans KR · JetBrains Mono — SIL Open Font License (Google Fonts)
- 음악 · 효과음 — 코드로 생성(WebAudio), 외부 음원 없음
