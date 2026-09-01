# 규정 자료 정본 — 어디에 있고, 어떻게 읽나

- **작성일**: 2026-09-01

원본 파일은 **레포에 넣지 않는다.** 3자 저작물이고(대회사 공식 규정집·행사 자료),
레포는 공개될 수 있다. 원본은 로컬 `참고문서/` 에 두고 `.gitignore` 로 막았다.

**대신 규칙 사실은 이 디렉터리에 정리한다.** 엔진이 참조할 근거가 로컬 파일에만 있으면
다음 사람이 문제를 만들 때 근거 없이 짐작하게 된다.

## 자료 목록 (로컬 `참고문서/`)

| 파일 | 용도 | 추출 |
|---|---|---|
| `Mixgame 설명자료.pdf` (8p) | **Mix Game Guide v1** — 축 3 게임 6종 + 베팅 구조 3종 | `pypdf` 텍스트 추출 가능 |
| `Mixed Games Rules - January 2026.docx` | 축 3 예외 처리 · 게임 전환 · 캡 | `zipfile` + `word/document.xml` |
| `2025 WINNABLE Rules_Vers 1.0 FINAL.pdf` (38p, 60조) | **축 1·2 조항 정본** | `pypdf` 텍스트 추출 가능 |
| `2024 Poker TDA Rules ...pdf` (영문/한글 2종) | WINNABLE 제1조 2항이 준용하는 상위 규정 | `pypdf` |
| `KakaoTalk_20260824_*.png` (8장) | APT 실제 이벤트 스케줄 + 변형 게임 규칙 | 이미지 — 눈으로 읽어야 함 |

추출 예:

```bash
python -c "
import pypdf
r = pypdf.PdfReader('참고문서/Mixgame 설명자료.pdf')
print('\n'.join((p.extract_text() or '') for p in r.pages))
"
```

```bash
python -c "
import zipfile, re, html
x = zipfile.ZipFile('참고문서/Mixed Games Rules - January 2026.docx').read('word/document.xml').decode('utf8')
print(html.unescape(re.sub(r'<[^>]+>', '', re.sub(r'</w:p>', '\n', x))))
"
```

## 정리본

- [`mixgame-facts.md`](mixgame-facts.md) — 축 3 이 문제로 낼 규칙 사실. `GameSpec` 필드 단위로 정리했다.

## 주의

- **`articles.ts` 의 조항 문구는 이 자료의 원문이다.** 요약·의역하지 마라 (그 파일 주석 참고).
- WINNABLE 규정은 **제60조까지** 있다. PRD §8 은 "56개 조"라고 적혀 있는데 원문과 다르다 —
  조항을 인용할 때 PDF 를 직접 확인할 것.
