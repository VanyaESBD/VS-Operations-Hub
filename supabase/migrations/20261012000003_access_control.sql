-- =====================================================================
-- 0003 — ACCESS CONTROL  ⚠ DO NOT APPLY TO PRODUCTION UNTIL APPROVED ⚠
--
-- Applying this switches the hub from "anyone with the link" to
-- "signed-in, active members only". Before applying in production:
--   1. Vanya approves the access matrix (docs/ACCESS_CONTROL.md).
--   2. Accounts are created for the approved people and their profiles
--      rows inserted with active = true.
--   3. The app is deployed with REACT_APP_AUTH_ENABLED=true.
-- Applying it before step 3 locks every current user out.
--
-- Roles
--   admin   — everything, incl. private items, user profiles, and removing
--             low-value records (notes, flags, Sean's Week, inbox triage)
--   manager — everything, incl. private items; cannot manage users
--   staff   — team items only (no private finance/personal items)
--   viewer  — read team items only
-- =====================================================================

create or replace function public.hub_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;
create or replace function public.hub_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;
create or replace function public.hub_can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.hub_role() in ('admin','manager','staff'), false)
$$;
create or replace function public.hub_sees_private() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.hub_role() in ('admin','manager'), false)
$$;
revoke all on function public.hub_role(), public.hub_is_member(), public.hub_can_write(), public.hub_sees_private() from public, anon;
grant execute on function public.hub_role(), public.hub_is_member(), public.hub_can_write(), public.hub_sees_private() to authenticated;

-- 1. Remove every existing open policy on hub tables.
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

-- 2. RLS on everywhere (leads and notes had it off).
do $$ declare t text; begin
  foreach t in array array['tasks','task_history','leads','notes','flags','interactions','projects','reminders',
                           'sean_week','inbox_triage','companies','contacts','company_contacts','orders',
                           'order_milestones','activity_log','profiles'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 3. Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
revoke execute on function public.search_hub(text, int) from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.search_hub(text, int) to authenticated;

-- 4. Standard member policies (read: members; write: admin/manager/staff).
do $$ declare t text; begin
  foreach t in array array['task_history','leads','flags','projects','sean_week','inbox_triage',
                           'companies','contacts','company_contacts','orders','order_milestones','notes'] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.hub_is_member())', t);
    execute format('create policy "members add" on public.%I for insert to authenticated with check (public.hub_can_write())', t);
    execute format('create policy "members edit" on public.%I for update to authenticated using (public.hub_can_write()) with check (public.hub_can_write())', t);
  end loop;
end $$;

-- 5. Rows that can be private (finance / personal): visible to admin + manager only.
do $$ declare t text; begin
  foreach t in array array['tasks','interactions','reminders'] loop
    execute format($f$create policy "members read team rows" on public.%I for select to authenticated
      using (public.hub_is_member() and (visibility = 'team' or public.hub_sees_private()))$f$, t);
    execute format($f$create policy "members add" on public.%I for insert to authenticated
      with check (public.hub_can_write() and (visibility = 'team' or public.hub_sees_private()))$f$, t);
    execute format($f$create policy "members edit" on public.%I for update to authenticated
      using (public.hub_can_write() and (visibility = 'team' or public.hub_sees_private()))
      with check (public.hub_can_write() and (visibility = 'team' or public.hub_sees_private()))$f$, t);
  end loop;
end $$;

-- 6. Deletes: only low-value records, only admins. Business records are
--    archived (and 0002 blocks their deletion at trigger level anyway).
do $$ declare t text; begin
  foreach t in array array['notes','flags','sean_week','inbox_triage','interactions','company_contacts'] loop
    execute format('create policy "admin remove" on public.%I for delete to authenticated using (public.hub_role() = ''admin'')', t);
  end loop;
end $$;

-- 7. Audit trail: read by members; clients may only add notes.
create policy "members read" on public.activity_log for select to authenticated using (public.hub_is_member());
create policy "members add notes" on public.activity_log for insert to authenticated
  with check (public.hub_can_write() and action = 'note');

-- 8. Profiles: everyone sees their own; admins see and manage all.
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.hub_role() = 'admin');
create policy "admin manages profiles" on public.profiles for update to authenticated
  using (public.hub_role() = 'admin') with check (public.hub_role() = 'admin');
create policy "admin adds profiles" on public.profiles for insert to authenticated with check (public.hub_role() = 'admin');
