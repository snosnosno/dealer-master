-- Supabase 클라우드는 public 스키마에 default privileges 가 설정돼 있어
-- 새로 만든 테이블에 anon/authenticated 전체 권한이 자동 부여된다.
-- (로컬 CLI 스택은 이 설정이 달라서, 로컬 테스트만으로는 이 차이가 드러나지 않는다)
-- RLS 가 최종 방어선이지만 권한 자체를 최소화해 방어를 2겹으로 되돌린다.

revoke all on subscriptions from anon, authenticated;
revoke all on cases         from anon, authenticated;
revoke all on attempts      from anon, authenticated;
revoke all on streaks       from anon, authenticated;

-- 필요한 것만 다시 부여 (실제 행 단위 통과 여부는 RLS 가 결정)
grant select on cases to anon, authenticated;
grant select on subscriptions, attempts, streaks to authenticated;
grant insert on attempts to authenticated;
grant insert, update, delete on cases to authenticated;

-- 외래키에 커버링 인덱스가 없으면 auth.users 삭제 시 cases 전체를 훑는다.
create index idx_cases_created_by on cases(created_by);
