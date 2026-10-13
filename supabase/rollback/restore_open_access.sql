-- ROLLBACK for 20261012000003_access_control.sql
-- Restores the pre-login "anyone with the link" access. Touches no data.
-- Use only if login activation has to be reverted; pair with unsetting
-- REACT_APP_AUTH_ENABLED in Vercel and redeploying.

do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in (
             'tasks','task_history','leads','notes','flags','interactions','projects','reminders',
             'sean_week','inbox_triage','companies','contacts','company_contacts','orders',
             'order_milestones','activity_log','profiles')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema public to anon;
grant execute on function public.search_hub(text, int) to anon;

do $$ declare t text; begin
  foreach t in array array['tasks','task_history','leads','notes','flags','interactions','projects','reminders',
                           'sean_week','inbox_triage','companies','contacts','company_contacts','orders','order_milestones'] loop
    execute format('create policy "Allow all (pre-login)" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
create policy "Read (pre-login)" on public.activity_log for select to anon, authenticated using (true);
create policy "Add notes (pre-login)" on public.activity_log for insert to anon, authenticated with check (action = 'note');
-- profiles keep RLS on with no anon policy (never publicly readable).
