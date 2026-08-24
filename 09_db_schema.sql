-- 딜러마스터 DB 스키마
-- Supabase(Postgres) 신규 프로젝트용
-- 작성일: 2026-08-20

-- ============================================
-- 1. subscriptions (구독 상태)
-- ============================================
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'canceled')),
  plan_tier text not null default 'basic',
  billing_key text,                          -- 토스페이먼츠 빌링키
  next_billing_date timestamptz,
  grace_period_ends_at timestamptz,           -- 결제 실패 시 유예 종료 시점 (실패+3일)
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_subscriptions_user on subscriptions(user_id);

-- ============================================
-- 2. cases (케이스 콘텐츠 — 축1/2/3 공용)
-- ============================================
create table cases (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('tda', 'dealer', 'mixgame')),
  axis_game text,                             -- 'game_a' | 'game_b' | 'game_c' 등, 축2/3 게임 구분용
  difficulty text not null default 'basic' check (difficulty in ('basic', 'intermediate', 'advanced')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  situation_text text not null,
  options jsonb,                              -- 선택형: [{id, text}], 서술형이면 null
  correct_option text,                        -- 선택형 정답 id, 서술형이면 null
  grading_criteria text,                      -- 서술형 채점 기준 (AI 프롬프트에 포함될 체크리스트)
  correct_answer_summary text not null,       -- 정답 요약 (해설 상단 표시용)
  tda_rule_ref text,                          -- 예: "Rule 45-A"
  explanation text not null,
  is_free_preview boolean not null default false,
  scheduled_publish_at timestamptz,           -- 발행 캘린더 슬롯
  created_by uuid references auth.users(id),
  reviewed_at timestamptz,                    -- 검수 완료 시각, null이면 미검수
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_cases_status on cases(status);
create index idx_cases_track on cases(track);
create index idx_cases_publish_schedule on cases(scheduled_publish_at) where status = 'published';

-- ============================================
-- 3. attempts (유저별 시도 기록)
-- ============================================
create table attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  mode text not null default 'snapshot' check (mode in ('snapshot', 'timeline')),
  user_answer_text text,                      -- 서술형 답변 원문
  selected_option text,                       -- 선택형 답변
  is_correct boolean,
  ai_feedback text,                           -- AI 채점 피드백 (서술형)
  response_time_ms integer,
  intervene_at_event_index integer,           -- timeline 모드 전용
  timing_score integer,                       -- timeline 모드 전용 (0~100)
  created_at timestamptz not null default now()
);
create index idx_attempts_user on attempts(user_id);
create index idx_attempts_case on attempts(case_id);
create index idx_attempts_user_created on attempts(user_id, created_at desc);

-- ============================================
-- 4. streaks (유저별 스트릭/등급 — 주 단위 리셋)
-- ============================================
create table streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak_weeks integer not null default 0,
  longest_streak_weeks integer not null default 0,
  last_played_week date,                      -- 해당 주의 월요일 날짜로 저장 (date_trunc('week', ...))
  total_correct integer not null default 0,
  total_attempts integer not null default 0,
  grade text not null default 'junior' check (grade in ('junior', 'senior', 'master')),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 5. rankings (주간 랭킹 집계 — materialized view)
-- ============================================
create materialized view weekly_rankings as
select
  a.user_id,
  date_trunc('week', a.created_at) as week_start,
  count(*) filter (where a.is_correct) as correct_count,
  count(*) as attempt_count,
  round(count(*) filter (where a.is_correct)::numeric / nullif(count(*), 0) * 100, 1) as accuracy_pct,
  avg(a.response_time_ms) as avg_response_time_ms
from attempts a
group by a.user_id, date_trunc('week', a.created_at);

create index idx_weekly_rankings_week on weekly_rankings(week_start);
-- refresh 방법: Supabase Edge Function cron으로 매일 `refresh materialized view weekly_rankings;` 실행

-- ============================================
-- RLS 정책
-- ============================================
alter table subscriptions enable row level security;
alter table cases enable row level security;
alter table attempts enable row level security;
alter table streaks enable row level security;

-- subscriptions: 본인 것만 조회/수정 가능
create policy "본인 구독 정보 조회" on subscriptions for select using (auth.uid() = user_id);
create policy "본인 구독 정보 수정" on subscriptions for update using (auth.uid() = user_id);

-- cases: published + (무료 미리보기 or 구독 active)만 조회 가능
create policy "발행된 케이스 조회" on cases for select using (
  status = 'published' and (
    is_free_preview = true
    or exists (
      select 1 from subscriptions s
      where s.user_id = auth.uid() and s.status = 'active'
    )
  )
);
-- draft/archived 케이스는 관리자만 조회 (created_by 본인, 1인 운영이라 단순화)
create policy "관리자 전체 케이스 조회" on cases for select using (auth.uid() = created_by);
create policy "관리자 케이스 작성/수정" on cases for all using (auth.uid() = created_by);

-- attempts: 본인 기록만 조회/작성 가능
create policy "본인 시도 기록 조회" on attempts for select using (auth.uid() = user_id);
create policy "본인 시도 기록 작성" on attempts for insert with check (auth.uid() = user_id);

-- streaks: 본인 것만 조회, 갱신은 서버(Edge Function)에서만 수행하므로 update는 service_role만 허용
create policy "본인 스트릭 조회" on streaks for select using (auth.uid() = user_id);

-- ============================================
-- 참고: 스트릭 갱신 로직은 애플리케이션/Edge Function에서 처리
-- last_played_week = date_trunc('week', now())로 비교해서
-- 이번 주 첫 플레이면 current_streak_weeks += 1, 한 주 이상 건너뛰었으면 0으로 리셋
-- ============================================
