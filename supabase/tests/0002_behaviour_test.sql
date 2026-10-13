-- Behaviour tests for migration 0002. Run against a staging copy:
--   psql -v ON_ERROR_STOP=1 -d <staging_db> -f supabase/tests/0002_behaviour_test.sql
-- Everything runs inside one transaction that is rolled back at the end.
-- Each test raises an exception (and stops the run) if a rule is broken.
begin;
set local role postgres;

create temp table t_results (n int, name text, ok boolean);

-- helper: expect a statement to fail
create or replace function pg_temp.expect_error(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  c_id bigint; c2 bigint; ct_id bigint; o_id bigint; t_id bigint; i_id bigint; ord_id bigint; n int; h_before int; r record;
begin
  -- 1. Company + contact + opportunity + task + communication, all linked
  insert into companies(name, relationship_types, updated_by) values ('Test Pharma Distributors', '{prospect}', 'Vanya') returning id into c_id;
  insert into contacts(full_name, email) values ('Test Person', 'test.person@example.com') returning id into ct_id;
  insert into company_contacts(company_id, contact_id, is_primary) values (c_id, ct_id, true);
  insert into leads(company, company_id, contact_id, name, pipeline_stage, owner, next_action, value_amount, currency, updated_by)
    values ('Test Pharma Distributors', c_id, ct_id, 'Test deal', 'New Lead', 'Vanya', 'Call them', 1000, 'USD', 'Vanya') returning id into o_id;
  insert into tasks(subject, owner, company_id, opportunity_id, action_state, next_action, expected_date, updated_by)
    values ('Send quote', 'Sean', c_id, o_id, 'Our action', 'Approve quote', current_date, 'Vanya') returning id into t_id;
  insert into task_history(task_id, changed_by, entry_type, note) values (t_id, 'Vanya', 'note', 'history line');
  insert into interactions(occurred_at, type, direction, subject, company_id, contact_id, opportunity_id, task_id, email_thread_id, updated_by)
    values (now(), 'Email', 'Outbound', 'Quotation sent', c_id, ct_id, o_id, t_id, 'thread-1', 'Vanya') returning id into i_id;

  -- 2. Scenario D / section 8: removing the email record removes NOTHING else
  update leads set pipeline_stage = 'On Hold / Nurture', hold_reason = 'Customer not buying yet', review_date = current_date + 60, updated_by='Vanya' where id = o_id;
  delete from interactions where id = i_id;
  select count(*) into n from companies where id = c_id;      assert n = 1, 'company deleted with email';
  select count(*) into n from contacts where id = ct_id;      assert n = 1, 'contact deleted with email';
  select count(*) into n from leads where id = o_id and pipeline_stage = 'On Hold / Nurture' and review_date is not null and hold_reason is not null;
  assert n = 1, 'opportunity / stage / review date lost with email';
  select count(*) into n from tasks where id = t_id;          assert n = 1, 'task deleted with email';
  select count(*) into n from task_history where task_id = t_id; assert n = 1, 'task history lost with email';
  insert into t_results values (1, 'Deleting a communication keeps company, contact, opportunity (stage + review date), task and history', true);

  -- 3. Business records cannot be hard-deleted
  assert pg_temp.expect_error(format('delete from tasks where id = %s', t_id)), 'task delete not blocked';
  assert pg_temp.expect_error(format('delete from leads where id = %s', o_id)), 'opportunity delete not blocked';
  assert pg_temp.expect_error(format('delete from companies where id = %s', c_id)), 'company delete not blocked';
  assert pg_temp.expect_error(format('delete from contacts where id = %s', ct_id)), 'contact delete not blocked';
  assert pg_temp.expect_error('delete from task_history where id = (select min(id) from task_history)'), 'history delete not blocked';
  insert into t_results values (2, 'Tasks, opportunities, companies, contacts, task history cannot be hard-deleted', true);

  -- 4. Won / Lost keep their record; Won stamps closed_at; Lost needs nothing at DB level but is retained
  update leads set pipeline_stage = 'Won', outcome = 'PO received', updated_by = 'Sean' where id = o_id;
  select count(*) into n from leads where id = o_id and pipeline_stage = 'Won' and closed_at = current_date and stage = 'Won' and value_amount = 1000;
  assert n = 1, 'won record not retained correctly';
  insert into t_results values (3, 'Won opportunity retained with value, outcome, close date; legacy stage kept in sync', true);

  -- 5. Stage history recorded with the user
  select count(*) into n from activity_log where entity_type = 'opportunity' and entity_id = o_id and field = 'pipeline_stage';
  assert n >= 2, 'stage changes not logged';
  select count(*) into n from activity_log where entity_type = 'opportunity' and entity_id = o_id and field = 'pipeline_stage' and new_value = 'Won' and actor = 'Sean';
  assert n = 1, 'stage change actor not recorded';
  insert into t_results values (4, 'Stage changes logged with who changed it', true);

  -- 6. Old screens keep working: legacy status <-> action state stay in sync both ways
  update tasks set status = 'Done' where id = t_id;
  select count(*) into n from tasks where id = t_id and action_state = 'Completed' and completed_at is not null and actual_date is not null;
  assert n = 1, 'legacy Done not mapped to Completed';
  update tasks set action_state = 'Awaiting response', waiting_on = 'Supplier', follow_up_date = current_date + 3 where id = t_id;
  select count(*) into n from tasks where id = t_id and status = 'Follow Up' and completed_at is null;
  assert n = 1, 'reopen / Awaiting not mapped to Follow Up';
  select count(*) into n from activity_log where entity_type = 'task' and entity_id = t_id and field = 'action_state';
  assert n >= 2, 'task state changes not logged';
  insert into t_results values (5, 'Old status (Done/Follow Up) and new action state stay in sync; reopen logged', true);

  -- 7. Old-app insert path (no new fields) still works
  insert into tasks(subject, owner, status, priority, expected_date, next_action) values ('Legacy insert', 'Vanya', 'FYA', 'High', current_date, 'x') returning id into n;
  select count(*) into n from tasks where id = n and action_state = 'Our action' and status = 'FYA';
  assert n = 1, 'legacy insert broken';
  insert into leads(company, stage, owner) values ('Legacy Lead Co', 'Hot', 'Sean') returning id into n;
  select count(*) into n from leads where id = n and pipeline_stage = 'Proposal / Quotation' and name = 'Legacy Lead Co';
  assert n = 1, 'legacy lead insert not mapped';
  insert into t_results values (6, 'Old app inserts (tasks with old statuses, leads with Cold/Warm/Hot) still work and map across', true);

  -- 8. Superseded archive must link to what superseded it (Q1)
  assert pg_temp.expect_error(format($q$update tasks set archived_at = now(), archive_reason = 'Superseded' where id = %s$q$, t_id)), 'superseded without link allowed';
  update tasks set archived_at = now(), archive_reason = 'Superseded', superseded_by_opportunity_id = o_id, updated_by = 'Vanya' where id = t_id;
  select count(*) into n from activity_log where entity_type='task' and entity_id=t_id and action='archived';
  assert n = 1, 'archive not logged';
  select count(*) into n from task_history where task_id = t_id; assert n = 1, 'history lost on archive';
  insert into t_results values (7, 'Archiving as superseded requires a link; archive is logged; history kept', true);

  -- 9. Validation at DB level
  assert pg_temp.expect_error(format($q$update leads set value_amount = -5 where id = %s$q$, o_id)), 'negative value allowed';
  assert pg_temp.expect_error(format($q$update leads set currency = 'rand' where id = %s$q$, o_id)), 'bad currency allowed';
  assert pg_temp.expect_error(format($q$update leads set pipeline_stage = 'Hot lead' where id = %s$q$, o_id)), 'unknown stage allowed';
  assert pg_temp.expect_error($q$insert into companies(name) values ('  test   pharma DISTRIBUTORS ')$q$), 'duplicate company (case/space) allowed';
  assert pg_temp.expect_error($q$insert into contacts(full_name, email) values ('Dup', 'TEST.PERSON@example.com')$q$), 'duplicate contact email allowed';
  insert into t_results values (8, 'Negative values, bad currency, unknown stage, duplicate company and contact email are rejected', true);

  -- 10. Duplicate active opportunity for same company blocked; Won one doesn't count
  insert into leads(company_id, name, pipeline_stage) values (c_id, 'Second deal', 'Qualified');
  assert pg_temp.expect_error(format($q$insert into leads(company_id, name, pipeline_stage) values (%s, 'second DEAL', 'New Lead')$q$, c_id)), 'duplicate active opp allowed';
  insert into leads(company_id, name, pipeline_stage) values (c_id, 'Test deal', 'New Lead'); -- original is Won -> allowed
  insert into t_results values (9, 'Duplicate active opportunity blocked; a new one alongside a Won one is allowed', true);

  -- 11. Orders: target stays a target; Done milestone needs evidence (rule 7)
  insert into orders(name, kind, customer_company_id, opportunity_id, target_date) values ('Test order', 'Customer order', c_id, o_id, current_date - 5) returning id into ord_id;
  select count(*) into n from orders where id = ord_id and actual_date is null; assert n = 1, 'target date turned into actual';
  assert pg_temp.expect_error(format($q$insert into order_milestones(order_id, name, status) values (%s, 'Delivered', 'Done')$q$, ord_id)), 'Done without evidence allowed';
  insert into order_milestones(order_id, name, status, evidence) values (ord_id, 'Advance paid', 'Done', 'Bank statement 14 Oct');
  insert into t_results values (10, 'Past target date never becomes delivered; Done milestone needs a date or evidence', true);

  -- 12. Data-quality view and search run
  select count(*) into n from hub_data_quality; assert n >= 0;
  select count(*) into n from search_hub('test pharma'); assert n >= 1, 'search found nothing';
  select count(*) into n from search_hub('t'); assert n = 0, 'one-letter search should return nothing';
  insert into t_results values (11, 'Data-quality view and search work (min 2 characters)', true);
end $$;

-- 13. Flags survive when a task would be removed (FK now SET NULL, not CASCADE)
do $$ declare n text; begin
  select confdeltype into n from pg_constraint where conname = 'flags_task_id_fkey'; assert n = 'n', 'flags FK not SET NULL';
  select confdeltype into n from pg_constraint where conname = 'task_history_task_id_fkey'; assert n = 'r', 'task_history FK not RESTRICT';
  insert into t_results values (12, 'Flags and task history no longer cascade-delete with a task', true);
end $$;

-- 14. Anonymous (pre-login) access unchanged for the old tables and works for new ones
do $$ declare n int; begin
  set local role anon;
  select count(*) into n from tasks; assert n >= 235, 'anon cannot read tasks pre-login';
  select count(*) into n from companies; assert n >= 1, 'anon cannot read companies pre-login';
  reset role;
  insert into t_results values (13, 'Before login is switched on, access works exactly as today (old and new tables)', true);
end $$;

select n as "#", name as "test", case when ok then 'PASS' else 'FAIL' end as result from t_results order by n;
rollback;
