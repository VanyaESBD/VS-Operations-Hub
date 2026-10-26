// Data access for the CRM features. Every write returns { data, error } with a
// friendly error message; nothing is silently swallowed.
import { supabase } from "../supabase";
import { friendlyError, pipelineToLegacy, stateToStatus } from "./hub";

const res = ({ data, error }) => ({ data, error: error ? friendlyError(error) : null });
const clean = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === "" ? null : v;
  return out;
};

// ---------- reads (scoped, never "everything forever") ----------
export const loadCompanies = (includeArchived = false) => {
  let q = supabase.from("companies").select("*").order("name");
  if (!includeArchived) q = q.is("archived_at", null);
  return q.then(res);
};
export const loadContacts = () =>
  supabase.from("contacts").select("*, company_contacts(company_id, role, is_primary)").is("archived_at", null).order("full_name").then(res);
export const loadOpportunities = (includeArchived = false) => {
  let q = supabase.from("leads").select("*").order("updated_at", { ascending: false });
  if (!includeArchived) q = q.is("archived_at", null);
  return q.then(res);
};
export const loadOrders = () =>
  supabase.from("orders").select("*, order_milestones(*)").is("archived_at", null).order("created_at", { ascending: false }).then(res);
export const loadRecentActivity = (limit = 40) =>
  supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(limit).then(res);
export const loadActivityFor = (entityType, id) =>
  supabase.from("activity_log").select("*").eq("entity_type", entityType).eq("entity_id", id).order("created_at", { ascending: false }).limit(100).then(res);
export const loadCommunications = ({ companyId, opportunityId, taskId, limit = 50 } = {}) => {
  let q = supabase.from("interactions").select("*").is("archived_at", null).order("occurred_at", { ascending: false, nullsFirst: false }).limit(limit);
  if (companyId) q = q.eq("company_id", companyId);
  if (opportunityId) q = q.eq("opportunity_id", opportunityId);
  if (taskId) q = q.eq("task_id", taskId);
  return q.then(res);
};
export const loadDataQuality = () => supabase.from("hub_data_quality").select("*").then(res);
export const searchHub = (q) => supabase.rpc("search_hub", { q, max_results: 40 }).then(res);

// ---------- writes ----------
const OPP_FIELDS = ["name", "company", "company_id", "contact_id", "contact", "email", "phone", "description", "product_interest", "lead_source",
  "pipeline_stage", "priority", "value_amount", "currency", "value_basis", "probability", "expected_close_date", "expected_decision_date",
  "owner", "next_action", "next_action_owner", "action_state", "follow_up_date", "review_date", "hold_reason", "lost_reason", "outcome",
  "closed_at", "notes", "needs_review"];

export function saveOpportunity(form, actor) {
  const payload = {};
  for (const f of OPP_FIELDS) if (f in form) payload[f] = form[f];
  if (payload.value_amount !== undefined && payload.value_amount !== null && payload.value_amount !== "")
    payload.value_amount = Number(String(payload.value_amount).replace(/[\s,]/g, ""));
  if (payload.pipeline_stage) payload.stage = pipelineToLegacy(payload.pipeline_stage); // keep old screens consistent
  payload.updated_by = actor;
  const body = clean(payload);
  return (form.id
    ? supabase.from("leads").update(body).eq("id", form.id).select().single()
    : supabase.from("leads").insert([body]).select().single()).then(res);
}
export const moveOpportunity = (id, stage, actor) =>
  supabase.from("leads").update({ pipeline_stage: stage, stage: pipelineToLegacy(stage), updated_by: actor }).eq("id", id).select().single().then(res);

const COMPANY_FIELDS = ["name", "legal_name", "relationship_types", "industry", "status", "email", "phone", "website", "physical_address",
  "postal_address", "account_owner", "next_action", "next_follow_up_date", "notes", "aliases", "needs_review"];
export function saveCompany(form, actor) {
  const payload = {};
  for (const f of COMPANY_FIELDS) if (f in form) payload[f] = form[f];
  payload.updated_by = actor;
  const body = clean(payload);
  if (!body.relationship_types) body.relationship_types = [];
  if (!body.aliases) body.aliases = [];
  return (form.id
    ? supabase.from("companies").update(body).eq("id", form.id).select().single()
    : supabase.from("companies").insert([body]).select().single()).then(res);
}

export async function saveContact(form, companyId, actor) {
  const body = clean({ full_name: form.full_name, email: form.email, phone: form.phone, mobile: form.mobile, title: form.title,
    notes: form.notes, needs_verification: form.needs_verification, updated_by: actor });
  const out = await (form.id
    ? supabase.from("contacts").update(body).eq("id", form.id).select().single()
    : supabase.from("contacts").insert([body]).select().single()).then(res);
  if (out.error || !companyId) return out;
  const link = await supabase.from("company_contacts").upsert([{ company_id: companyId, contact_id: out.data.id, role: form.role || null, is_primary: !!form.is_primary }]).then(res);
  return link.error ? link : out;
}
export const linkContact = (companyId, contactId, role) =>
  supabase.from("company_contacts").upsert([{ company_id: companyId, contact_id: contactId, role: role || null }]).then(res);

const TASK_FIELDS = ["subject", "client", "company", "email", "date_received", "owner", "priority", "expected_date", "next_action", "notes",
  "outcome", "task_type", "project", "follow_up_date", "follow_up_note", "company_id", "contact_id", "opportunity_id", "order_id",
  "action_state", "waiting_on", "expected_response_date", "category", "visibility", "needs_review", "project_id"];
export function saveTask(form, actor) {
  const payload = {};
  for (const f of TASK_FIELDS) if (f in form) payload[f] = form[f];
  if (payload.action_state) payload.status = stateToStatus(payload.action_state, form.status);
  payload.updated_by = actor;
  const body = clean(payload);
  return (form.id
    ? supabase.from("tasks").update(body).eq("id", form.id).select().single()
    : supabase.from("tasks").insert([body]).select().single()).then(res);
}
export const setTaskState = (task, state, actor) =>
  supabase.from("tasks").update({ action_state: state, status: stateToStatus(state, task.status), updated_by: actor }).eq("id", task.id).select().single().then(res);

// Archive instead of delete. `link` = { taskId | opportunityId | orderId } when superseded.
export function archive(table, id, actor, reason, link) {
  const body = { archived_at: new Date().toISOString(), updated_by: actor };
  if (table === "tasks") {
    body.archive_reason = reason || "Archived";
    if (link?.taskId) body.superseded_by_task_id = link.taskId;
    if (link?.opportunityId) body.superseded_by_opportunity_id = link.opportunityId;
    if (link?.orderId) body.superseded_by_order_id = link.orderId;
  }
  return supabase.from(table).update(body).eq("id", id).then(res);
}
export const restore = (table, id, actor) =>
  supabase.from(table).update({ archived_at: null, updated_by: actor, ...(table === "tasks" ? { archive_reason: null } : {}) }).eq("id", id).then(res);

export function logCommunication(form, actor) {
  const body = clean({
    occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : new Date().toISOString(),
    interaction_date: (form.occurred_at || new Date().toISOString()).slice(0, 10),
    type: form.type, direction: form.direction, subject: form.subject, notes: form.notes, outcome: form.outcome,
    company_id: form.company_id, contact_id: form.contact_id, opportunity_id: form.opportunity_id, task_id: form.task_id, order_id: form.order_id,
    company: form.company_name, client: form.contact_name, owner: form.owner || actor, logged_by: actor,
    next_action: form.next_action, follow_up_date: form.follow_up_date, external_link: form.external_link,
    email_message_id: form.email_message_id, email_thread_id: form.email_thread_id, updated_by: actor,
  });
  return supabase.from("interactions").insert([body]).select().single().then(res);
}

// Correct which records a communication belongs to (section 7: users can fix a wrong association).
// Only the links change; the communication itself and every linked record are untouched.
export function relinkCommunication(id, { company_id, company_name, opportunity_id, task_id }, actor) {
  return supabase.from("interactions")
    .update({ company_id: company_id || null, company: company_name ?? null, opportunity_id: opportunity_id || null, task_id: task_id || null, updated_by: actor })
    .eq("id", id).select().single().then(res);
}
export const loadLinkOptions = async (companyId) => {
  const [c, o, t] = await Promise.all([
    supabase.from("companies").select("id,name").is("archived_at", null).order("name"),
    supabase.from("leads").select("id,name,company,company_id").is("archived_at", null).order("name"),
    companyId ? supabase.from("tasks").select("id,subject").is("archived_at", null).eq("company_id", companyId).order("created_at", { ascending: false }).limit(200)
              : Promise.resolve({ data: [], error: null }),
  ]);
  const error = c.error || o.error || t.error;
  return { data: { companies: c.data || [], opportunities: o.data || [], tasks: t.data || [] }, error: error ? friendlyError(error) : null };
};

export const addActivityNote = (entityType, entityId, note, actor) =>
  supabase.from("activity_log").insert([{ entity_type: entityType, entity_id: entityId, action: "note", note, actor }]).then(res);

const MS_FIELDS = ["name", "status", "target_date", "actual_date", "owner_label", "evidence", "sort"];
export function saveMilestone(orderId, m, actor) {
  const body = { order_id: orderId, updated_by: actor };
  for (const f of MS_FIELDS) if (f in m) body[f] = m[f] === "" ? null : m[f];
  return (m.id
    ? supabase.from("order_milestones").update(body).eq("id", m.id).select().single()
    : supabase.from("order_milestones").insert([body]).select().single()).then(res);
}
const ORDER_FIELDS = ["ref", "name", "kind", "customer_company_id", "supplier_company_id", "customer_confirmed", "opportunity_id", "status",
  "quantity_note", "amount", "currency", "amount_note", "target_date", "actual_date", "owner", "next_action", "notes", "needs_review"];
export function saveOrder(form, actor) {
  const payload = {};
  for (const f of ORDER_FIELDS) if (f in form) payload[f] = form[f];
  payload.updated_by = actor;
  const body = clean(payload);
  if (body.customer_confirmed === null || body.customer_confirmed === undefined) body.customer_confirmed = !!body.customer_company_id;
  return (form.id
    ? supabase.from("orders").update(body).eq("id", form.id).select().single()
    : supabase.from("orders").insert([body]).select().single()).then(res);
}

// ---------- follow-ups: "emailed them — chase on <date> if no reply" ----------
// Every step is recorded as a communication on the task (and its company/opportunity),
// so the hub knows when we last contacted them and how many times we've chased.
const commFor = (task, type, direction, subject, actor) => logCommunication({
  occurred_at: new Date().toISOString(), type, direction, subject,
  company_id: task.company_id || null, opportunity_id: task.opportunity_id || null, task_id: task.id,
  company_name: task.company || null, contact_name: task.client || null, owner: actor,
}, actor);

// Sent something (or chased again) → waiting for a reply until `followUpDate`.
export async function scheduleFollowUp(task, followUpDate, actor, { chase = false, waitingOn } = {}) {
  const c = await commFor(task, chase ? "Follow-up" : "Email", "Outbound",
    `${chase ? "Chased" : "Sent"}: ${task.subject}`, actor);
  if (c.error) return c;
  return supabase.from("tasks").update({
    action_state: "Awaiting response", status: "Follow Up", follow_up_date: followUpDate,
    waiting_on: waitingOn || task.waiting_on || task.client || task.company || null, updated_by: actor,
  }).eq("id", task.id).select().single().then(res);
}

// They replied → it's our move again (not "done": the reply still needs acting on).
export async function replyReceived(task, actor) {
  const c = await commFor(task, "Email", "Inbound", `Reply received: ${task.subject}`, actor);
  if (c.error) return c;
  return supabase.from("tasks").update({
    action_state: "Our action", status: "To Do", follow_up_date: null,
    next_action: `Act on reply${task.waiting_on ? ` from ${task.waiting_on}` : ""}`, expected_date: todayLocal(), updated_by: actor,
  }).eq("id", task.id).select().single().then(res);
}
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// Last contact + number of chases per task (one light query, not the whole log).
export const loadTaskContacts = () =>
  supabase.from("interactions").select("task_id, occurred_at, type, direction").not("task_id", "is", null)
    .is("archived_at", null).order("occurred_at", { ascending: false }).limit(2000).then(res);
export function summariseContacts(rows = []) {
  const m = {};
  for (const r of rows) {
    const s = (m[r.task_id] ||= { last: null, lastDir: null, chases: 0 });
    if (!s.last) { s.last = r.occurred_at; s.lastDir = r.direction; }
    if (r.type === "Follow-up") s.chases++;
  }
  return m;
}

// ---------- projects (live inside a company) ----------
// The projects table has no updated_by column; archive instead of delete.
const PROJECT_FIELDS = ["name", "description", "owner", "status", "company_id", "color", "needs_review"];
export function saveProject(form) {
  const body = { updated_at: new Date().toISOString() };
  for (const f of PROJECT_FIELDS) if (f in form) body[f] = typeof form[f] === "string" ? form[f].trim() || null : form[f];
  return (form.id
    ? supabase.from("projects").update(body).eq("id", form.id).select().single()
    : supabase.from("projects").insert([body]).select().single()).then(res);
}
export const archiveProject = (id, archived = true) =>
  supabase.from("projects").update({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id).then(res);

// Permanent delete (admin/manager only, enforced in the database by hub_delete_task).
// Leaves a one-line trace in activity_log; communications are kept, just unlinked.
export const deleteTaskForever = (id) => supabase.rpc("hub_delete_task", { p_id: id }).then(res);

// Today's Five: tasks this person moved to tomorrow today (read from the change log, no new table).
export const loadMovedToday = (actor, sinceISO, tomorrow) =>
  supabase.from("activity_log").select("entity_id")
    .eq("entity_type", "task").eq("actor", actor).in("field", ["expected_date", "follow_up_date"])
    .eq("new_value", tomorrow).gte("created_at", sinceISO).then(res);
export const moveTaskTo = (task, date, actor) =>
  supabase.from("tasks").update(task.action_state === "Awaiting response" ? { follow_up_date: date, updated_by: actor } : { expected_date: date, updated_by: actor })
    .eq("id", task.id).select().single().then(res);
