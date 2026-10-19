-- 0004 — Projects live inside companies; Outlook-ready email fields. Approved by Vanya 19 Oct 2026.
-- Additive: new columns + two new companies + a few new projects; existing rows are only linked, never deleted.

-- 1. Structure
alter table public.projects
  add column if not exists company_id bigint references public.companies(id) on delete restrict,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists needs_review text;
create index if not exists projects_company_idx on public.projects (company_id);

alter table public.tasks
  add column if not exists project_id bigint references public.projects(id) on delete restrict,
  add column if not exists email_thread_id text,      -- Outlook conversationId: one thread = one task
  add column if not exists email_message_id text;     -- latest message seen on that thread
create index if not exists tasks_project_idx on public.tasks (project_id);
create unique index if not exists tasks_email_thread_uq on public.tasks (email_thread_id)
  where email_thread_id is not null and archived_at is null;

-- 2. Homes for non-client work
insert into public.companies (name, relationship_types, status, notes, source, updated_by)
select v.name, v.rel, 'Active', v.notes, 'Hub structure 19 Oct 2026', 'Import (Vanya-approved)'
from (values
  ('ESBD (internal)', array['other']::text[], 'ESBD''s own internal work: finance & admin, ESBD Africa, international sales, systems, leadership.'),
  ('Sean — personal', array['other']::text[], 'Sean''s personal matters (property, personal admin). Tasks here should be marked private.')
) v(name, rel, notes)
where not exists (select 1 from public.companies c where c.name = v.name and c.archived_at is null);

-- 3. Projects that tasks refer to but that had no project record yet
insert into public.projects (name, status, owner, description)
select v.name, 'Active', 'Sean', v.descr
from (values
  ('Opportunity Mapping / Sales Pipeline', 'Strategnos opportunity map and sales pipeline work (from task records).'),
  ('Financial & Management Structure', 'Company structure, loans, budgets (from task records).'),
  ('Tower Cold Chain / TBB', 'Tower Cold Chain asset payment plan / TBB (from task records).'),
  ('EuroPOS', 'EuroPOS support structure and payment milestones (from task records).'),
  ('Leadership Transition', 'Operational leadership transition (from task records).')
) v(name, descr)
where not exists (select 1 from public.projects p where p.name = v.name);

-- 4. Put each project under its company
update public.projects p set company_id = c.id, updated_at = now()
from (values
  ('Discovery Medical', 'Discovery Medical Suppliers'),
  ('Adcock Ingram', 'Adcock Ingram'),
  ('Aspen PLZ / Solaris Cargo', 'Aspen Pharmacare (PLZ)'),
  ('CJ Distribution', 'CJ Distribution'),
  ('UPD', 'UPD (Clicks Group)'),
  ('Strategnos', 'Strategnos'),
  ('Medipost', 'Medipost'),
  ('Lumière Global', 'Lumière Global Limited'),
  ('CIMC', 'Beijing CIMC Cold Chain Technology Co., Ltd.'),
  ('2nd Level Solutions / Solaris', '2nd Level Solutions'),
  ('Bayworld PE', 'Bayworld PE'),
  ('Pfizer / Adriaan Fourie', 'Pfizer SA'),
  ('Value Logistics', 'Value Logistics'),
  ('Acino / DSV', 'Acino'),
  ('Paris / International Sales', 'ESBD (internal)'),
  ('ESBD Africa', 'ESBD (internal)'),
  ('Financial & Admin', 'ESBD (internal)'),
  ('James / Systems Development', 'ESBD (internal)'),
  ('Opportunity Mapping / Sales Pipeline', 'ESBD (internal)'),
  ('Financial & Management Structure', 'ESBD (internal)'),
  ('Tower Cold Chain / TBB', 'ESBD (internal)'),
  ('EuroPOS', 'ESBD (internal)'),
  ('Leadership Transition', 'ESBD (internal)'),
  ('Canterbury Square', 'Sean — personal')
) m(project, company)
join public.companies c on c.name = m.company and c.archived_at is null
where p.name = m.project and p.company_id is null;

update public.projects set needs_review = 'Source name "Acino / DSV" — confirm Acino is the right company'
  where name = 'Acino / DSV';
update public.projects set needs_review = 'Customer not confirmed — Vac Bureau, Biovac or TVB? Assign a company.'
  where name = 'Biovac / Vac Bureau' and company_id is null;

-- 5. Turn typed project names on tasks into links (text kept as-is for history)
update public.tasks t set project_id = p.id
from (values
  ('Adcock Ingram', 'Adcock Ingram'),
  ('UPD', 'UPD'),
  ('Strategnos', 'Strategnos'),
  ('CJ Distribution', 'CJ Distribution'),
  ('Second Level Solutions', '2nd Level Solutions / Solaris'),
  ('James / Systems Development', 'James / Systems Development'),
  ('Opportunity Mapping / Sales Pipeline', 'Opportunity Mapping / Sales Pipeline'),
  ('Financial & Management Structure', 'Financial & Management Structure'),
  ('Tower Cold Chain / TBB', 'Tower Cold Chain / TBB'),
  ('EuroPOS', 'EuroPOS'),
  ('Leadership Transition', 'Leadership Transition'),
  ('Andrea & Jason – Operational Leadership Transition', 'Leadership Transition')
) m(task_text, project)
join public.projects p on p.name = m.project
where t.project = m.task_text and t.project_id is null;
