# 딜러마스터 — 개발 환경 세팅

**최종 갱신:** 2026-08-24

핸드오프 문서 `13_claude_code_handoff.md` §10 "개발 착수 순서" 기준.
이 문서는 **Claude Code 가 이미 끝낸 것**과 **Sno 가 직접 해야 하는 것**을 나눈다.

---

## A. 완료된 세팅 (검증됨)

| 항목 | 상태 | 검증 근거 |
|---|---|---|
| 별도 git 레포 (`dealer master/`) | ✅ | `git rev-parse --show-toplevel` → `C:/Users/user/Desktop/dealer master` |
| Next.js 16.3.2 + React 19.2.8 + Tailwind 4 (App Router, src/, TS) | ✅ | `app/` 스캐폴딩 완료 |
| 의존성 설치 (`@supabase/ssr`, `@supabase/supabase-js`, `@anthropic-ai/sdk`, `zod`, `server-only`) | ✅ | `npm audit` → 0 vulnerabilities |
| Supabase CLI 2.115.0 (devDependency, `npx supabase`) | ✅ | `npx supabase --version` |
| DB 스키마 → 마이그레이션 파일 | ✅ | `app/supabase/migrations/20260824000000_init_schema.sql` |
| 환경변수 검증 (zod, 부팅 시 전수검사) | ✅ | `app/src/lib/env.ts` |
| Supabase 클라이언트 3종 (browser / server / proxy) | ✅ | `app/src/lib/supabase/` |
| 세션 자동 갱신 (Next 16 `proxy.ts`) | ✅ | 빌드 출력에 `ƒ Proxy (Middleware)` |
| Anthropic 클라이언트 + 모델 상수 | ✅ | `app/src/lib/ai/anthropic.ts` |
| 타입체크 / 린트 / 프로덕션 빌드 | ✅ | `tsc --noEmit` exit 0, `eslint` 0 error, `next build` 성공 |

### 확인된 로컬 도구
Node v22.15.0 · npm 10.9.2 · git 2.49.0 · gh 2.89.0 · Python 3.14.4 · Docker CLI 29.3.1

---

## B. Sno 가 직접 해야 하는 것

### B-0. ⚠️ 최우선 — TDA use policy 확인 (개발과 무관, 법적 리스크)
`13_claude_code_handoff.md` §9 에 명시된 대로 PokerTDA.com 의 규정 사용 정책이 **미확인 상태**다.
케이스 30개가 TDA 조항 원문을 인용하므로, 콘텐츠 공개 전에 반드시 확인할 것.
이건 코딩으로 해결되지 않는다.

### B-1. Docker Desktop 실행 (로컬 DB 쓸 경우만)
Docker CLI 는 설치돼 있으나 데몬이 꺼져 있다.
```
docker info   # 현재: daemon 미실행
```
Docker Desktop 을 실행한 뒤:
```
cd app
npx supabase start          # 로컬 Postgres + Auth + Storage 기동
npx supabase migration up   # 스키마 적용
```
로컬 없이 클라우드 프로젝트만 쓸 거면 이 단계는 건너뛰어도 된다.

### B-2. Supabase — 기존 계정에 새 조직 + 새 프로젝트
UNIQN과 **같은 계정**을 쓰되, **새 Organization**을 만들어 그 안에 프로젝트를 생성한다.

조직을 나누는 이유: 한 조직 안에서는 Free/Pro 플랜을 섞을 수 없다. 같은 조직에 두면
UNIQN이 Pro로 올라갈 때 딜러마스터도 같이 유료로 끌려간다. 청구서 분리 효과도 있다.

> 무료 프로젝트 한도 2개는 **계정 단위 합산**이라 조직을 나눠도 늘어나지 않는다.
> UNIQN이 이미 2개를 쓰고 있으면 Pro($25/mo)를 켜거나 안 쓰는 프로젝트를 pause 해야 한다.
> (paused 프로젝트는 한도에 잡히지 않음)

1. Dashboard 좌상단 조직 선택 → **New organization** (이름 예: `dealermaster`)
2. 그 조직 안에서 **New project** — 리전은 **Northeast Asia (Seoul)** 권장
3. Settings → **API Keys** 탭 → `Create new API Keys` → 아래 3개 복사

| 대시보드 위치 | 형태 | .env.local 키 |
|---|---|---|
| Settings → Data API → Project URL | `https://<ref>.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| Settings → API Keys → Publishable key | `sb_publishable_...` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Settings → API Keys → Secret keys | `sb_secret_...` | `SUPABASE_SECRET_KEY` |

- **Legacy API Keys 탭의 `anon` / `service_role` 은 쓰지 말 것** — 2026년 말 deprecated 예정이다.
  신규 프로젝트라면 처음부터 publishable/secret 키로 간다.
- `sb_secret_...` 은 RLS를 전부 우회(BYPASSRLS)한다. 절대 `NEXT_PUBLIC_` 접두사를 붙이지 말 것.
  브라우저에서 쓰면 Supabase가 401로 막지만, 유출되면 다른 도구로는 그대로 쓰인다.

4. 스키마 적용 — 둘 중 하나:
   - SQL Editor에 `app/supabase/migrations/20260824000000_init_schema.sql` 붙여넣고 실행
   - 또는 CLI: `cd app && npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`
     (`<ref>` 는 Project URL의 `https://<ref>.supabase.co` 부분)

### B-3. Anthropic API 키 발급
https://console.anthropic.com → API Keys → `ANTHROPIC_API_KEY`
채점 모델은 Haiku 4.5 (`claude-haiku-4-5`). 기획서 기준 1인당 월 20~35원.

### B-4. 토스페이먼츠 가맹점 심사 신청 (병렬 착수)
**심사 기간이 병목**이므로 지금 신청해 둘 것. 심사에 필요한 것:
- 사업자등록증
- 이용약관 / 환불정책 (§9 기준 아직 초안 없음 — 별도 작성 필요)
- 서비스 소개 (랜딩페이지)

키가 나오기 전까지 `NEXT_PUBLIC_TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` 는 비워둬도 앱이 뜬다 (선택값 처리됨).

### B-5. Vercel 프로젝트 연결
```
cd app && npx vercel link
```
Root Directory 를 `app` 으로 지정할 것 (레포 루트에는 기획문서만 있음).
환경변수는 Vercel Dashboard → Settings → Environment Variables 에 동일하게 등록.

---

## C. 환경변수 채우기

```
cd app
cp .env.local.example .env.local
```
`.env.local` 에 위에서 받은 값을 채운다. **필수값**이 하나라도 비면 서버가 부팅 시점에
어떤 키가 비었는지 메시지와 함께 즉시 실패한다 (런타임에 조용히 undefined 로 터지지 않게 하려는 의도).

필수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAIL`
선택: 토스 키 2개

---

## D. 명령어

```
cd app
npm run dev         # 개발 서버 (http://localhost:3000)
npm run build       # 프로덕션 빌드
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run db:push     # 원격 Supabase 에 마이그레이션 적용
npm run db:diff     # 스키마 변경분 확인
```

---

## E. 다음 개발 순서 (핸드오프 §10)

- [x] 1. ~~Next.js + Vercel 프로젝트 초기화~~
- [ ] 2. TDA use policy 확인 ← **B-0, 코딩보다 우선**
- [ ] 3. Supabase 신규 프로젝트 생성 + 스키마 실행 ← **B-2**
- [ ] 4. 토스페이먼츠 심사 신청 ← **B-4, 병렬**
- [ ] 5. Auth (이메일/소셜 로그인) 구현
- [ ] 6. 케이스 30개 seed 스크립트 (`05_pilot_cases_v1.md` + `11_pilot_cases_v2.md` → `cases` 테이블)
- [ ] 7. AI 채점 API 연동 + 24개 테스트셋 정확도 검증
- [ ] 8. 무료 미리보기 + 케이스 플레이 UI
- [ ] 9. 관리자 콘텐츠 발행 화면
- [ ] 10. 결제 연동 (심사 통과 후)
- [ ] 11. 베타 오픈

---

## F. 아직 결정 안 된 것 (개발 중 확정 필요)

핸드오프 §9 기준. 코드 작성 전에 답이 필요한 순서대로:

| 항목 | 언제 필요한가 |
|---|---|
| 등급 승급 기준 구체 수치 (junior→senior→master) | 6단계(seed) 전 |
| 이용약관 / 환불정책 초안 | 토스 심사 제출 시 |
| 랜딩페이지 카피 | 8단계 |
| 케이스 변형 생성 워크플로우 | V1 이후 (보류 확정) |
