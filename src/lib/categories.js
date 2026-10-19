// Colour system — matched to ESBD's brand and to Vanya's Outlook categories,
// so a task looks the same colour in the hub as the email it came from.
// Colours were sampled from Outlook's own tag icons: `fill` is the tag's body,
// `ink` its outline (the readable colour on the dark background).

// ---- ESBD brand (from the ESBD site) ----
export const BRAND = {
  bg: "#0a2432",      // deep teal-navy page background
  panel: "#0b2735",   // sidebar / panels
  card: "#0e2d3e",    // cards
  input: "#10364a",   // inputs
  line: "#1b4a60",    // borders
  lineSoft: "#143a4d",
  cyan: "#18b9dc",    // ESBD accent (headings, links, active)
  cyanSoft: "#5ccee8",// highlight / glow
  button: "#118fb5",  // solid buttons + accent text (readable both ways)
};

// ---- Area categories (one per task — "what is it about") ----
export const CATEGORIES = {
  "Client relations": { fill: "#00373a", ink: "#58ccd3" },
  "Finance":          { fill: "#063004", ink: "#5fc15a" },
  "HR":               { fill: "#002039", ink: "#8fb1cc" },
  "IT":               { fill: "#444241", ink: "#aca8a7" },
  "Marketing":        { fill: "#3a2f00", ink: "#ba990a" },
  "Operations":       { fill: "#43002b", ink: "#d091ba" },
  "Sales":            { fill: "#22330b", ink: "#a4cc6c" },
  "Sales & Marketing":{ fill: "#463100", ink: "#eaa300" },
  "Medical":          { fill: "#80215d", ink: "#f08ccb", private: true },
  "Family Time":      { fill: "#420610", ink: "#d098a0", private: true },
  "Personal $":       { fill: "#22330b", ink: "#a1c76c", private: true },
  "Personal Time":    { fill: "#7a2101", ink: "#f08a62", private: true },
  "OoO":              { fill: "#3f3682", ink: "#a59aeb", private: true },
};
export const CATEGORY_NAMES = Object.keys(CATEGORIES);
export const isPrivateCategory = (c) => !!CATEGORIES[c]?.private;
const ALIASES = { sales: "Sales", "Sales&Marketing": "Sales & Marketing", Personal: "Personal $" };
export const normaliseCategory = (c) => (c ? ALIASES[c] || (CATEGORIES[c] ? c : null) : null);

// ---- Action tags → what kind of item it is (drives where it shows) ----
// Outlook FYA / FlwUP / FYI / ! map onto the hub's action states and priority.
export const STATE_STYLE = {
  "Our action":        { tag: "FYA",   fill: "#5e2405", ink: "#c57f58", label: "Our action (FYA)" },
  "Awaiting response": { tag: "FlwUP", fill: "#3a3a3a", ink: "#a8a8a8", label: "Waiting (FlwUP)" },
  "Monitoring":        { tag: "FYI",   fill: "#240f3c", ink: "#b39ecc", label: "FYI" },
  "On hold":           { tag: "Hold",  fill: "#3f3682", ink: "#a59aeb", label: "On hold" },
  "Completed":         { tag: "Done",  fill: "#0b3d4f", ink: "#5ccee8", label: "Completed" },
  "Cancelled":         { tag: "—",     fill: "#2e2e2e", ink: "#8a8a8a", label: "Cancelled" },
};
export const URGENT = { tag: "!", fill: "#420610", ink: "#d098a0" };

// ---- People tags ----
// Andrea (Dre) and Jason (J) no longer use the hub: their items show as Delegated.
export const ACTIVE_USERS = ["Vanya", "Sean"];
// They don't log in, but work is still assigned to and tracked for them.
export const DELEGATES = ["Siya", "Jason", "Andrea"];
export const PEOPLE = ["Vanya", "Sean", ...DELEGATES];
export const ASSIGNABLE = [...ACTIVE_USERS, ...DELEGATES, "Unassigned"];
export const isDelegated = (owner) => !!owner && !["Vanya", "Sean", "Unassigned", "You"].includes(owner);
export const ownerLabel = (owner) => (isDelegated(owner) ? `${owner} · delegated` : owner || "Unassigned");

// ---- Outlook ↔ hub mapping (exact Outlook category names → hub values) ----
// Used by the Outlook connection: a tagged email becomes a task with these values.
export const OUTLOOK_AREA = {
  "Client relations": "Client relations", "Finance": "Finance", "HR": "HR", "IT": "IT", "Marketing": "Marketing",
  "Operations": "Operations", "Sales": "Sales", "Sales&Marketing": "Sales & Marketing", "Sales & Marketing": "Sales & Marketing",
  "Medical": "Medical", "Family Time": "Family Time", "Personal $": "Personal $", "Personal Time": "Personal Time", "OoO": "OoO",
};
export const OUTLOOK_ACTION = { "FYA": "Our action", "FlwUP": "Awaiting response", "FYI": "Monitoring" };
export const OUTLOOK_URGENT = "!";
// People tags → owner. "A" is not yet identified, so it maps to nobody until confirmed.
export const OUTLOOK_PEOPLE = { "Dre": ["Andrea"], "J": ["Jason"], "J+Dre": ["Jason", "Andrea"], "Siya": ["Siya"] };
export function fromOutlookCategories(cats = []) {
  const out = { category: null, action_state: null, priority: null, owners: [], unknown: [] };
  for (const raw of cats) {
    const c = String(raw).trim();
    if (OUTLOOK_AREA[c]) { if (!out.category) out.category = OUTLOOK_AREA[c]; }
    else if (OUTLOOK_ACTION[c]) out.action_state = OUTLOOK_ACTION[c];
    else if (c === OUTLOOK_URGENT) out.priority = "Urgent";
    else if (OUTLOOK_PEOPLE[c]) out.owners.push(...OUTLOOK_PEOPLE[c]);
    else out.unknown.push(c);
  }
  if (out.category && isPrivateCategory(out.category)) out.visibility = "private";
  return out;
}
export function toOutlookCategories(task) {
  const cats = [];
  const st = STATE_STYLE[task.action_state];
  if (st && ["FYA", "FlwUP", "FYI"].includes(st.tag)) cats.push(st.tag);
  const area = Object.keys(OUTLOOK_AREA).find((k) => OUTLOOK_AREA[k] === task.category && k !== "Sales&Marketing");
  if (area) cats.push(area);
  if (task.priority === "Urgent") cats.push(OUTLOOK_URGENT);
  return cats;
}

// ---- Traffic light: red (overdue) / amber (today) / yellow (≤2 days) / green (later) ----
// Overdue items "glow" until someone (not the import) edits or completes them after they went overdue.
export const RAG = {
  red:    { ink: "#ef4444", fill: "#ef444422", label: "Overdue" },
  amber:  { ink: "#f59e0b", fill: "#f59e0b22", label: "Due today" },
  yellow: { ink: "#facc15", fill: "#facc1522", label: "Due soon" },
  green:  { ink: "#22c55e", fill: "#22c55e22", label: "On track" },
  none:   { ink: "#557080", fill: "transparent", label: "No date" },
};
// Pure calendar maths in UTC — local midnight + toISOString() shifted a day in South Africa (UTC+2).
const addDaysISO = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Glow = 3+ days overdue and nobody has edited it since it fell due (Vanya, 20 Oct 2026).
export const GLOW_AFTER_DAYS = 3;
export function rag(date, today, { done = false, updatedAt = null, updatedBy = null } = {}) {
  if (done) return { level: "none", glow: false };
  if (!date) return { level: "none", glow: false };
  if (date < today) {
    const touchedBy = updatedBy && !/^Import/i.test(updatedBy);
    const touchedAfter = updatedAt && String(updatedAt).slice(0, 10) > date;
    const longOverdue = date <= addDaysISO(today, -GLOW_AFTER_DAYS);
    return { level: "red", glow: longOverdue && !(touchedBy && touchedAfter) };
  }
  if (date === today) return { level: "amber", glow: false };
  if (date <= addDaysISO(today, 2)) return { level: "yellow", glow: false };
  return { level: "green", glow: false };
}
