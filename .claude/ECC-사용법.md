# ECC (Everything Claude Code) — 딜러마스터용 사용법

설치: `affaan-m/ECC` v2.2.3, `--target claude-project --profile developer`
+ security / database / typescript / nextjs / react / ko-KR, 훅 활성화.
Next.js · React · TypeScript · Supabase(Postgres) 와 무관한 언어/도메인 항목은 제거했다.

| 구성 | 개수 | 위치 |
|---|---|---|
| 에이전트 | 33 | `.claude/agents/` |
| 슬래시 커맨드 | 78 | `.claude/commands/` |
| 스킬 | 82 | `.claude/skills/` |
| 규칙 (경로별 자동 적용) | common · typescript · react · web | `.claude/rules/ecc/` |
| 훅 | 27 | `.claude/settings.json` → `.claude/scripts/hooks/` |
| 한국어 문서 | | `.claude/docs/ko-KR/` |

## 처음부터 끝까지 — 추천 흐름

정본 스펙은 루트 `PRD.md`. 각 단계에서 PRD 를 기준으로 삼으라고 지시한다.

1. **계획** — `/plan-prd` 또는 `/plan` : PRD.md 를 읽고 기능 단위 구현 계획을 만든다.
   큰 덩어리는 `/epic-decompose` 로 쪼갠다.
2. **MVP 골격** — `/orch-build-mvp` : planner → 구현 → 리뷰를 오케스트레이션.
3. **기능 하나씩** — `/feature-dev` 또는 `/orch-add-feature` (TDD: `tdd-guide` 에이전트, `tdd-workflow` 스킬).
4. **DB** — `database-reviewer` 에이전트, `postgres-patterns` · `database-migrations` 스킬
   (마이그레이션은 `app/supabase/migrations/`).
5. **검증** — `/quality-gate`, `/test-coverage`, `/react-test`, E2E 는 `e2e-runner` 에이전트(Playwright).
6. **빌드 깨짐** — `/build-fix`, `/react-build`.
7. **리뷰 · 보안** — `/code-review`, `/react-review`, `/security-scan`
   (결제·RLS·AI 채점 프롬프트 인젝션 구간은 `security-reviewer` 필수).
8. **문서 · PR** — `/update-docs`, `/pr`.
9. **긴 작업 이어가기** — `/save-session` · `/resume-session`, `/checkpoint`.

전체 안내: `/ecc-guide`

## 훅 메모

- **GateGuard** (`gateguard-fact-force`): 세션 첫 Bash, 파일 첫 수정, 파괴적 명령(`rm -rf`, `git reset --hard` 등) 전에
  "사실 확인"을 요구한다. 재시도는 **완전히 같은 명령**이어야 통과된다.
  - 너무 번거로우면: `ECC_GATEGUARD=off` 또는 `ECC_DISABLED_HOOKS=pre:bash:gateguard-fact-force`
  - 일상 Bash 만 끄기: `GATEGUARD_BASH_ROUTINE_DISABLED=1` (파괴적 명령 검사는 유지)
- 훅 전체 강도: `ECC_HOOK_PROFILE=minimal|standard|strict`
- 훅 런타임 데이터(관찰 로그 등)는 저장소가 아니라 `~/.claude/` 에 쌓인다.
- 훅 경로는 `CLAUDE_PROJECT_DIR` 기준으로 고쳐 두어 Windows 로컬 / 클라우드 어디서나 동작한다. Node 필요.
- `settings.json` 의 `includeCoAuthoredBy: false` 는 ECC 기본값이다.

## 재설치 / 업데이트

```bash
git clone --depth 1 https://github.com/affaan-m/ECC /tmp/ecc
cd <이 저장소 루트>
/tmp/ecc/install.sh --target claude-project --profile developer \
  --with capability:security --with lang:typescript --with framework:nextjs \
  --with framework:react --with capability:database --with locale:ko-kr --enable-hooks
```
재설치하면 제거했던 항목과 `settings.json` 의 절대경로가 되돌아오므로, 정리·경로 수정을 다시 해야 한다.
