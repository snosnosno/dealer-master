\set ON_ERROR_STOP off
\pset pager off

-- ============================================
-- 테스트 픽스처: 유저 2명 + 케이스 2개
-- ============================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.com','x',now(),now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.com','x',now(),now(),now()),
  ('99999999-9999-9999-9999-999999999999','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@test.com','x',now(),now(),now());

-- A는 미구독(pending), B는 구독중(active)
insert into subscriptions (user_id, status) values
  ('11111111-1111-1111-1111-111111111111','pending'),
  ('22222222-2222-2222-2222-222222222222','active');

-- 무료 미리보기 1개 + 유료 케이스 1개 + draft 1개
insert into cases (track, status, situation_text, correct_answer_summary, explanation, is_free_preview)
values
  ('tda','published','무료 미리보기 케이스','요약','해설', true),
  ('tda','published','유료 케이스','요약','해설', false),
  ('tda','draft','작성중 케이스','요약','해설', false);

-- B의 시도 기록 1건
insert into attempts (user_id, case_id, user_answer_text)
select '22222222-2222-2222-2222-222222222222', id, 'B의 답변' from cases where situation_text='유료 케이스';

-- 관리자 등록
insert into private.admins (user_id) values ('99999999-9999-9999-9999-999999999999');

\echo ''
\echo '=============================================='
\echo ' 공격 1: 유저 A가 자기 구독을 active로 변경'
\echo ' 기대: 0 rows (차단)'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update subscriptions set status='active' where user_id='11111111-1111-1111-1111-111111111111';
rollback;

\echo ''
\echo '=============================================='
\echo ' 공격 2: 유저 A가 자기 등급을 master로 변경'
\echo ' 기대: 0 rows (차단)'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into streaks (user_id, grade) values ('11111111-1111-1111-1111-111111111111','master')
  on conflict (user_id) do nothing;
update streaks set grade='master' where user_id='11111111-1111-1111-1111-111111111111';
rollback;

\echo ''
\echo '=============================================='
\echo ' 공격 3: 유저 A가 케이스를 직접 발행'
\echo ' 기대: RLS 위반 에러 (차단)'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into cases (track, status, situation_text, correct_answer_summary, explanation, created_by)
values ('tda','published','악성 케이스','요약','해설','11111111-1111-1111-1111-111111111111');
rollback;

\echo ''
\echo '=============================================='
\echo ' 공격 4: 유저 A가 B의 시도 기록 조회'
\echo ' 기대: 0건'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select count(*) as "A가 볼 수 있는 attempts 건수" from attempts;
rollback;

\echo ''
\echo '=============================================='
\echo ' 공격 5: 유저 A가 랭킹 뷰 직접 조회'
\echo ' 기대: permission denied (차단)'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select count(*) from private.weekly_rankings;
rollback;

\echo ''
\echo '=============================================='
\echo ' 공격 6: 유저 A가 관리자 명단 조회'
\echo ' 기대: permission denied (차단)'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select count(*) from private.admins;
rollback;

\echo ''
\echo '=============================================='
\echo ' 정상 1: 비로그인(anon)이 무료 미리보기 조회'
\echo ' 기대: 무료 케이스 1건만'
\echo '=============================================='
begin;
set local role anon;
select situation_text from cases;
rollback;

\echo ''
\echo '=============================================='
\echo ' 정상 2: 미구독 유저 A가 케이스 조회'
\echo ' 기대: 무료 케이스 1건만'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select situation_text from cases;
rollback;

\echo ''
\echo '=============================================='
\echo ' 정상 3: 구독중 유저 B가 케이스 조회'
\echo ' 기대: published 2건 (draft 제외)'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select situation_text from cases;
rollback;

\echo ''
\echo '=============================================='
\echo ' 정상 4: 관리자가 draft 포함 전체 조회'
\echo ' 기대: 3건 전부'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
select situation_text from cases;
rollback;

\echo ''
\echo '=============================================='
\echo ' 정상 5: 관리자가 케이스 발행'
\echo ' 기대: INSERT 1건 성공'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
insert into cases (track, status, situation_text, correct_answer_summary, explanation)
values ('tda','published','관리자가 만든 케이스','요약','해설');
rollback;

\echo ''
\echo '=============================================='
\echo ' 정상 6: 유저 A가 본인 시도 기록 작성'
\echo ' 기대: INSERT 1건 성공'
\echo '=============================================='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into attempts (user_id, case_id, user_answer_text)
select '11111111-1111-1111-1111-111111111111', id, 'A의 답변' from cases where is_free_preview limit 1;
rollback;

\echo ''
\echo '=============================================='
\echo ' 정상 7: updated_at 자동 갱신 트리거'
\echo '=============================================='
begin;
update cases set situation_text = situation_text where situation_text='무료 미리보기 케이스';
select (updated_at > created_at) as "updated_at이 갱신됨" from cases where situation_text='무료 미리보기 케이스';
rollback;

\echo ''
\echo '=============================================='
\echo ' 정상 8: 랭킹 뷰 concurrently refresh'
\echo '=============================================='
refresh materialized view concurrently private.weekly_rankings;
select count(*) as "랭킹 행 수" from private.weekly_rankings;
