-- 0005 — Permanent delete for tasks (requested by Vanya, 20 Oct 2026).
-- Archive stays the default. This adds a deliberate "Delete permanently" for admin/manager only.
-- What it does, in one transaction:
--   * leaves one line in activity_log (who deleted what, when) so there is a trace;
--   * keeps any communications that pointed at the task (they just lose the task link);
--   * clears "superseded by" links from other tasks;
--   * removes the task's own history notes and the task itself.
-- Companies, contacts, opportunities, orders and projects remain archive-only.

create or replace function public.hub_delete_task(p_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  who text;
begin
  if coalesce(public.hub_role(), '') not in ('admin', 'manager') then
    raise exception 'Only Vanya or Sean can delete permanently. Archive it instead.' using errcode = '42501';
  end if;
  select * into t from public.tasks where id = p_id;
  if not found then
    raise exception 'That task no longer exists.' using errcode = 'P0002';
  end if;
  select display_name into who from public.profiles where id = auth.uid();

  perform set_config('hub.allow_delete', 'on', true);   -- this transaction only
  insert into public.activity_log (entity_type, entity_id, action, field, old_value, note, actor, actor_id)
  values ('task', p_id, 'deleted', 'subject', t.subject,
          'Permanently deleted. Owner: ' || coalesce(t.owner, '—') || '; state: ' || coalesce(t.action_state, t.status, '—'),
          coalesce(who, 'unknown'), auth.uid());
  update public.interactions set task_id = null where task_id = p_id;
  update public.tasks set superseded_by_task_id = null where superseded_by_task_id = p_id;
  delete from public.task_history where task_id = p_id;
  delete from public.tasks where id = p_id;
  perform set_config('hub.allow_delete', '', true);
end $$;

revoke all on function public.hub_delete_task(bigint) from public, anon;
grant execute on function public.hub_delete_task(bigint) to authenticated;
