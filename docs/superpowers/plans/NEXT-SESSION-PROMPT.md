# 다음 세션 프롬프트

이전 프롬프트(머지·정리·잔여작업·로컬 하네스)는 **2026-08-29 세션에서 전부 소진됐다.**
아래 "끝난 것"을 확인하고, 남은 일은 백로그 문서에서 골라 시작하면 된다.

---

## 끝난 것 (2026-08-29)

| 단계 | 결과 |
|---|---|
| 머지 | `review/simulator-engine-plan` 35커밋 → main **fast-forward**. 브랜치 삭제됨 |
| 원격 | `origin` = `https://github.com/snosnosno/dealer-master` 추가. **원격이 완전히 비어 있었으므로**(ls-remote 0 refs) 충돌 없음. main push 완료 |
| 게이트 | 머지 결과에서 재실행 — `npm test` 200/200 |
| 정리 | `.superpowers/sdd/2026-08-25-simulator-engine-core/` 삭제. 내용은 아래 백로그로 추출 |
| 하네스 | `app/src/app/simulator-harness` 신설. 브라우저 실렌더 확인 완료 |

## 남은 작업

**→ `docs/superpowers/plans/2026-08-25-simulator-engine-core-BACKLOG.md`** 하나만 보면 된다.
판정 원장(R1~R47)과 최종 리뷰의 유예 Minor 약 50건이 등급별로 정리돼 있다.

우선순위:

1. **A절 — TDA 2024 PDF 로 조항 2건 대조.** 사람이 해야 하고 발행 전 필수다.
   `Rule 43-A`·`Rule 21` 이 학습자 화면에 렌더되는 문자열이라 틀리면 잘못 가르친다
2. **B절 — R46(계획서 코드블록 18건 재동기화) · R47(`score.ts:93` 24%→32.7%) · R45(주석 참조).**
   기계적이고 안전. R46 은 ⚠️ 전역 치환 금지(절별 타겟)
3. **C절 — 2단계 UI 착수 전 설계 결정 7건.** 특히 이동평균 창 N 과 `require` 정직성
4. D·E절 — 유예 Minor. 급하지 않다

## 로컬에서 엔진 보기

```
cd app && npm run dev
# http://localhost:3000/simulator-harness
```

시드 입력 → 생성. 같은 시드를 두 번 누르면 "이벤트 열 지문"이 동일로 뜬다.
`require: calculation` 프리셋 버튼을 누르면 사이드팟이 나온다 — **require 없이는 안 나온다.**

하네스가 화면에 박아둔 주의사항(모르면 "버그다"라고 오판한다):
`action_validity` 는 약 33% 핸드에서 부재(의도된 동작) · 판단 지점 0개 핸드 가능 ·
`difficulty` 무효과 · `rulesetId` 는 값이 하나뿐.

**좌석 번호가 두 벌이다.** API 인덱스는 0-based(`#0`), 학습자 문항 문구는
1-based(`1번`, `decisions.ts:106` 의 `buttonSeat + 1`). 하네스 표에 둘을 나란히 둔다.

## 규칙 (이어서 유효)

- 엔진 파일(`app/src/lib/simulator/`)은 함부로 수정하지 마라. B절의 문서 정정은 예외
- 하네스가 엔진 결함을 드러내면 고치지 말고 **보고**해라 — 별도 판단이다
- npm 명령은 전부 `app/` 에서 돈다
- 완료 주장은 그 세션의 실제 도구 출력에만 근거해라
