// Core business rules for the Operations Hub — pure functions, unit-tested in hub.test.js.
// The database enforces the same mappings (see supabase/migrations/…_operations_hub_crm.sql).

export const PIPELINE_STAGES = [
  "New Lead", "Qualified", "Contacted", "Discussion / Discovery",
  "Proposal / Quotation", "Negotiation", "Won", "Lost", "On Hold / Nurture",
];
export const ACTIVE_STAGES = PIPELINE_STAGES.filter(s => !["Won", "Lost"].includes(s));
export const STAGE_COLOR = {
  "New Lead": "#3b82f6", "Qualified": "#06b6d4", "Contacted": "#0ea5e9",
  "Discussion / Discovery": "#8b5cf6", "Proposal / Quotation": "#f59e0b",
  "Negotiation": "#f97316", "Won": "#10b981", "Lost": "#6b7280", "On Hold / Nurture": "#a78bfa",
};

export const ACTION_STATES = ["Our action", "Awaiting response", "Monitoring", "On hold", "Completed", "Cancelled"];
export const OPEN_STATES = ["Our action", "Awaiting response", "Monitoring", "On hold"];
// Colours follow Vanya's Outlook tags: FYA (brown), FlwUP (grey), FYI (purple).
export const STATE_COLOR = {
  "Our action": "#c57f58", "Awaiting response": "#a8a8a8", "Monitoring": "#b39ecc",
  "On hold": "#a59aeb", "Completed": "#5ccee8", "Cancelled": "#8a8a8a",
};

export const OWNERS = ["Vanya", "Sean", "Andrea", "Jason", "Unassigned"];
export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const CURRENCIES = ["ZAR", "USD", "EUR", "GBP", "MUR", "INR", "CNY"];
export const VALUE_BASES = ["once-off", "per month", "per year", "other"];
export const RELATIONSHIPS = ["client", "prospect", "supplier", "partner", "bank_finance", "intermediary", "property", "other", "needs_review"];
export const COMM_TYPES = ["Email", "Follow-up", "Call", "Meeting", "WhatsApp", "Site visit", "Quotation sent", "Document received", "Decision", "Commitment", "Customer feedback", "Other"];
export const MILESTONE_STATUSES = ["Not started", "Not confirmed", "Awaiting", "In progress", "Target only", "Done", "Blocked", "Unclear"];

// ---- legacy ↔ new mappings (mirror the DB triggers) ----
const LEGACY_TO_PIPELINE = { Cold: "New Lead", Warm: "Qualified", Hot: "Proposal / Quotation", Negotiating: "Negotiation", Won: "Won", Lost: "Lost" };
const PIPELINE_TO_LEGACY = {
  "New Lead": "Cold", "Qualified": "Warm", "Contacted": "Warm", "Discussion / Discovery": "Warm",
  "Proposal / Quotation": "Hot", "Negotiation": "Negotiating", "Won": "Won", "Lost": "Lost", "On Hold / Nurture": "Cold",
};
export const legacyToPipeline = (s) => LEGACY_TO_PIPELINE[s] || null;
export const pipelineToLegacy = (s) => PIPELINE_TO_LEGACY[s] || null;
export const stageOf = (lead) => lead.pipeline_stage || legacyToPipeline(lead.stage) || "New Lead";

const STATUS_TO_STATE = { "To Do": "Our action", FYA: "Our action", New: "Our action", "Follow Up": "Awaiting response", FYI: "Monitoring", Done: "Completed" };
export const statusToState = (s) => STATUS_TO_STATE[s] || null;
export function stateToStatus(state, currentStatus) {
  switch (state) {
    case "Our action": return ["To Do", "FYA"].includes(currentStatus) ? currentStatus : "To Do";
    case "Awaiting response": return "Follow Up";
    case "Monitoring": return "FYI";
    case "Completed": return "Done";
    default: return currentStatus; // On hold / Cancelled have no legacy label
  }
}
export const stateOf = (task) => task.action_state || statusToState(task.status) || "Our action";
export const isOpenTask = (t) => !t.archived_at && OPEN_STATES.includes(stateOf(t));

// ---- dates ----
export const todayISO = (d = new Date()) => {
  // Local date (Africa/Johannesburg for the team), not UTC.
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
export const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return todayISO(d);
};
// The date that matters for a task right now: the follow-up date when we're
// waiting on someone, otherwise the due date.
export function actionDate(task) {
  const st = stateOf(task);
  if (st === "Awaiting response" || st === "Monitoring") return task.follow_up_date || task.expected_response_date || task.expected_date || null;
  return task.expected_date || task.follow_up_date || null;
}
// Bucket: overdue | today | week | later | none
export function dueBucket(dateISO, today = todayISO()) {
  if (!dateISO) return "none";
  if (dateISO < today) return "overdue";
  if (dateISO === today) return "today";
  if (dateISO <= addDays(today, 7)) return "week";
  return "later";
}
export const taskBucket = (t, today) => (isOpenTask(t) ? dueBucket(actionDate(t), today) : "closed");

// An awaiting item whose follow-up date has arrived becomes due for action (Scenario F).
export const needsChasing = (t, today = todayISO()) =>
  isOpenTask(t) && stateOf(t) === "Awaiting response" && ["overdue", "today"].includes(dueBucket(actionDate(t), today));

export const leadFollowUp = (l) => (stageOf(l) === "On Hold / Nurture" ? (l.review_date || l.follow_up_date) : (l.follow_up_date || l.review_date)) || null;
export const isActiveLead = (l) => !l.archived_at && !["Won", "Lost"].includes(stageOf(l));
// "Gone quiet": active, not on hold, no interaction or update for `days`.
export function isQuiet(lead, days = 21, today = todayISO()) {
  if (!isActiveLead(lead) || stageOf(lead) === "On Hold / Nurture") return false;
  const last = (lead.last_interaction_at || lead.updated_at || lead.created_at || "").slice(0, 10);
  return !!last && last < addDays(today, -days);
}

// ---- money ----
export function formatMoney(amount, currency, basis) {
  if (amount === null || amount === undefined || amount === "") return null;
  const n = Number(amount);
  if (!isFinite(n)) return null;
  const s = n.toLocaleString("en-ZA", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const sym = { ZAR: "R", USD: "USD", EUR: "EUR", GBP: "GBP" }[currency] || currency || "";
  return `${sym ? sym + " " : ""}${s}${basis && basis !== "once-off" ? " " + basis : ""}`;
}
// Sum estimated pipeline value per currency — never converted, never mixed.
export function pipelineTotals(leads) {
  const out = {};
  for (const l of leads) {
    if (!isActiveLead(l) || l.value_amount == null || !l.currency) continue;
    const k = l.currency + (l.value_basis && l.value_basis !== "once-off" ? ` (${l.value_basis})` : "");
    out[k] = (out[k] || 0) + Number(l.value_amount);
  }
  return out;
}

// ---- names / duplicates ----
export const nameKey = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
function bigrams(s) { const k = nameKey(s).replace(/[^a-z0-9 ]/g, ""); const out = new Set(); for (let i = 0; i < k.length - 1; i++) out.add(k.slice(i, i + 2)); return out; }
export function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
  return (2 * inter) / (A.size + B.size);
}
// Companies that might be the same business (flag, don't block).
export function possibleDuplicates(name, companies, threshold = 0.6) {
  const key = nameKey(name);
  if (!key) return [];
  return companies.filter(c => !c.archived_at && (
    nameKey(c.name) === key || (c.aliases || []).some(a => nameKey(a) === key) || similarity(c.name, name) >= threshold));
}

// ---- validation: blocks only what is genuinely invalid; returns warnings for gaps ----
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v) => !v || (ISO.test(v) && !isNaN(new Date(v + "T00:00:00")));

export function validateOpportunity(o) {
  const errors = {}, warnings = [];
  if (!(o.name || "").trim() && !(o.company || "").trim()) errors.name = "Give the opportunity a name.";
  const stage = o.pipeline_stage || "New Lead";
  if (!PIPELINE_STAGES.includes(stage)) errors.pipeline_stage = "Unknown stage.";
  if (o.value_amount !== "" && o.value_amount != null) {
    const n = Number(String(o.value_amount).replace(/[\s,]/g, ""));
    if (!isFinite(n) || n < 0) errors.value_amount = "Value must be a positive number (no currency symbols).";
    else if (!o.currency) errors.currency = "Choose a currency for this value.";
  }
  if (o.currency && !/^[A-Z]{3}$/.test(o.currency)) errors.currency = "Use a 3-letter currency code.";
  if (o.probability !== "" && o.probability != null && !(Number(o.probability) >= 0 && Number(o.probability) <= 100)) errors.probability = "0–100.";
  for (const f of ["expected_close_date", "expected_decision_date", "follow_up_date", "review_date", "closed_at"]) if (!validDate(o[f])) errors[f] = "Invalid date.";
  if (stage === "Lost" && !(o.lost_reason || "").trim()) errors.lost_reason = "Record why it was lost.";
  if (stage === "On Hold / Nurture" && !o.review_date) warnings.push("No review date — it won't come back up for review.");
  if (!["Won", "Lost"].includes(stage) && !(o.next_action || "").trim()) warnings.push("No next action.");
  if (!o.company_id) warnings.push("Not linked to a company record.");
  if (!o.owner || o.owner === "Unassigned") warnings.push("No owner.");
  return { errors, warnings, ok: Object.keys(errors).length === 0 };
}

export function validateTask(t) {
  const errors = {}, warnings = [];
  if (!(t.subject || "").trim()) errors.subject = "What needs to be done?";
  const st = t.action_state || "Our action";
  if (!ACTION_STATES.includes(st)) errors.action_state = "Unknown state.";
  for (const f of ["expected_date", "follow_up_date", "expected_response_date", "date_received"]) if (!validDate(t[f])) errors[f] = "Invalid date.";
  if (st === "Awaiting response" && !(t.waiting_on || "").trim()) warnings.push("Who are we waiting on?");
  if (st === "Awaiting response" && !t.follow_up_date && !t.expected_response_date) errors.follow_up_date = "Set a follow-up date so it comes back if nobody replies.";
  if (st === "Our action" && !(t.next_action || "").trim()) warnings.push("No next action.");
  if (st === "Our action" && !t.expected_date) warnings.push("No due date.");
  if (!t.owner || t.owner === "Unassigned") warnings.push("No owner.");
  return { errors, warnings, ok: Object.keys(errors).length === 0 };
}

export function validateCompany(c, existing = []) {
  const errors = {}, warnings = [];
  if (!(c.name || "").trim()) errors.name = "Company name is required.";
  if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) errors.email = "Doesn't look like an email address.";
  const dupes = possibleDuplicates(c.name, existing.filter(x => x.id !== c.id));
  if (dupes.some(d => nameKey(d.name) === nameKey(c.name))) errors.name = `"${c.name}" already exists.`;
  else if (dupes.length) warnings.push("Similar to: " + dupes.map(d => d.name).join(", "));
  return { errors, warnings, ok: Object.keys(errors).length === 0 };
}

export function validateMilestone(m) {
  const errors = {};
  if (!(m.name || "").trim()) errors.name = "Name the milestone.";
  if (m.status === "Done" && !m.actual_date && !(m.evidence || "").trim()) errors.evidence = "Add the date it happened or where it's confirmed.";
  if (!validDate(m.target_date)) errors.target_date = "Invalid date.";
  if (!validDate(m.actual_date)) errors.actual_date = "Invalid date.";
  return { errors, ok: Object.keys(errors).length === 0 };
}

// Friendly message for a Supabase/Postgres error.
export function friendlyError(error) {
  if (!error) return null;
  const msg = error.message || String(error);
  if (/archived, not deleted/i.test(msg)) return "Records are archived rather than deleted — use Archive.";
  if (/duplicate key|unique/i.test(msg)) {
    if (/companies/i.test(msg)) return "A company with that name already exists.";
    if (/contacts/i.test(msg)) return "A contact with that email already exists.";
    if (/leads_active_dupe/i.test(msg)) return "There's already an active opportunity with this name for this company.";
    return "That would create a duplicate record.";
  }
  if (/violates check constraint "?order_milestones_done_needs_evidence/i.test(msg)) return "A milestone can only be Done with a date or evidence.";
  if (/violates check constraint/i.test(msg)) return "One of the values isn't allowed: " + msg.replace(/^.*constraint "?([a-z_]+)"?.*$/i, "$1");
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to do that.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Couldn't reach the server — check your connection and try again. Nothing was lost on screen.";
  return msg;
}

// "Today": everything that needs attention today or is overdue — tasks, scheduled
// follow-ups and opportunity follow-ups together, in date order.
export const isDueNowTask = (t, today = todayISO()) => isOpenTask(t) && ["overdue", "today"].includes(dueBucket(actionDate(t), today));
export const isDueNowLead = (l, today = todayISO()) => isActiveLead(l) && ["overdue", "today"].includes(dueBucket(leadFollowUp(l), today));
// "3 days ago", "today", "yesterday"
export function ago(ts, now = new Date()) {
  if (!ts) return null;
  const d = Math.round((new Date(todayISO(now) + "T00:00:00") - new Date(String(ts).slice(0, 10) + "T00:00:00")) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? `${d} days ago` : `${Math.round(d / 7)} weeks ago`;
}
