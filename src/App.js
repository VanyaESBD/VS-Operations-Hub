import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { ACTION_STATES, STATE_COLOR, stateOf, isOpenTask, validateTask, stateToStatus, friendlyError, todayISO, actionDate, dueBucket, isActiveLead, leadFollowUp, isDueNowTask, isDueNowLead } from "./lib/hub";
import { loadCompanies, loadContacts, loadOrders, saveTask as saveTaskRecord, archive as archiveRecord } from "./lib/data";
import { useHubUser, Banner as HubBanner, Picker, Field as HubField } from "./hub/ui";
import { CATEGORIES, CATEGORY_NAMES, STATE_STYLE, isPrivateCategory, normaliseCategory, ownerLabel, ACTIVE_USERS } from "./lib/categories";
import { CategoryTag, DelegatedTag } from "./hub/tags";
import HubDashboard from "./hub/HubDashboard";
import Pipeline, { OpportunityModal } from "./hub/Pipeline";
import Companies from "./hub/Companies";
import FollowUps from "./hub/FollowUps";
import Orders from "./hub/Orders";
import CommLog from "./hub/CommLog";
import Search from "./hub/Search";
import DataQuality from "./hub/DataQuality";

const TODAY = () => todayISO(); // local date (was UTC — wrong between 00:00 and 02:00 SAST)
const fmtDate = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
const isOverdue = (t) => isOpenTask(t) && stateOf(t) === "Our action" && t.expected_date && t.expected_date < TODAY();

// Normalise company/client: trim + title case to prevent duplicates
const normaliseName = (s) => {
  if (!s || !s.trim()) return "";
  return s.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
};

const PRIORITY_ORDER = { "Urgent": 0, "High": 1, "Medium": 2, "Low": 3 };
const sortTasks = (tasks, sortBy) => {
  const arr = [...tasks];
  if (sortBy === "urgency") {
    return arr.sort((a, b) => {
      const aOver = isOverdue(a) ? 0 : 1;
      const bOver = isOverdue(b) ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const aPri = PRIORITY_ORDER[a.priority] ?? 2;
      const bPri = PRIORITY_ORDER[b.priority] ?? 2;
      if (aPri !== bPri) return aPri - bPri;
      return (a.expected_date || "9999") > (b.expected_date || "9999") ? 1 : -1;
    });
  }
  if (sortBy === "duedate") {
    // The date that needs attention: the follow-up date when waiting on a reply, otherwise the due date.
    // Earliest first (overdue at the top); undated last; urgency breaks ties.
    return arr.sort((a, b) => {
      const da = actionDate(a) || "9999-12-31", db = actionDate(b) || "9999-12-31";
      if (da !== db) return da < db ? -1 : 1;
      return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
    });
  }
  return arr.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
};

const STATUSES = ["To Do", "FYA", "Follow Up", "FYI", "Done"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const TASK_TYPES = ["Quote", "Order Request", "Information Request", "Complaint", "Follow-up", "Internal Admin", "FYI"];
const OWNERS = ["Vanya", "Sean", "Jason", "Andrea", "Unassigned"];
const PRIORITY_COLOR = { Low: "#7f93a1", Medium: "#118fb5", High: "#f59e0b", Urgent: "#ef4444" };
const STATUS_COLOR = { "To Do": "#c57f58", "FYA": "#c57f58", "Follow Up": "#a8a8a8", "FYI": "#b39ecc", "Done": "#5ccee8" }; // Outlook FYA / FlwUP / FYI
const STATUS_EMOJI = { "To Do": "🔴", "FYA": "🟠", "Follow Up": "🏌️", "FYI": "🟣", "Done": "✅" };
const URGENCY_COLOR = { Low: "#7f93a1", Medium: "#118fb5", High: "#f59e0b", Urgent: "#ef4444" };
const WEEK_CATEGORIES = ["✈️ Flight", "🚗 Car Booking", "📄 Document to Sign", "📊 Slides", "🎫 Ticket", "🔗 Link", "📅 Meeting Prep", "📦 Other"];
const WEEK_CAT_COLOR = { "✈️ Flight":"#3b82f6","🚗 Car Booking":"#f59e0b","📄 Document to Sign":"#8b5cf6","📊 Slides":"#118fb5","🎫 Ticket":"#10b981","🔗 Link":"#7f93a1","📅 Meeting Prep":"#f97316","📦 Other":"#6a8090" };

// Special pinned accounts — keys are lowercase for normalised matching
// ── Strategic Project Workstreams ──────────────────────────
// STRATEGIC_PROJECTS now loaded dynamically from Supabase projects table
// Fallback used until data loads
const STRATEGIC_PROJECTS_FALLBACK = [
  { name: "Discovery Medical", color: "#10b981" },
  { name: "Adcock Ingram", color: "#8b5cf6" },
  { name: "Aspen PLZ / Solaris Cargo", color: "#118fb5" },
  { name: "CJ Distribution", color: "#f97316" },
  { name: "UPD", color: "#14b8a6" },
  { name: "Strategnos", color: "#ef4444" },
  { name: "Medipost", color: "#f59e0b" },
  { name: "Lumière Global", color: "#ec4899" },
  { name: "CIMC", color: "#3b82f6" },
  { name: "2nd Level Solutions / Solaris", color: "#6366f1" },
  { name: "Bayworld PE", color: "#10b981" },
  { name: "Paris / International Sales", color: "#d97706" },
  { name: "Acino / DSV", color: "#0ea5e9" },
  { name: "Pfizer / Adriaan Fourie", color: "#a78bfa" },
  { name: "ESBD Africa", color: "#f97316" },
  { name: "Canterbury Square", color: "#6366f1" },
  { name: "Financial & Admin", color: "#10b981" },
  { name: "James / Systems Development", color: "#ec4899" },
];

const SPECIAL_ACCOUNTS = [
  { key: "finance", label: "💰 Finance", color: "#10b981" },
  { key: "personal", label: "👤 Personal", color: "#8b5cf6" },
  { key: "esbd_africa", label: "🏢 ESBD Africa", color: "#f97316" },
  { key: "property", label: "🏠 Property", color: "#6366f1" },
];

const newTask = (overrides = {}) => ({
  subject: "", client: "", company: "", email: "",
  date_received: TODAY(), owner: "Vanya", status: "To Do", priority: "Medium",
  expected_date: "", actual_date: "", next_action: "", notes: "", outcome: "", task_type: "Information Request",
  project: "", follow_up_date: "", follow_up_note: "", action_state: "Our action", visibility: "team",
  company_id: null, opportunity_id: null, waiting_on: "", expected_response_date: "",
  ...overrides,
});

function generateSummary(tasks) {
  const today = TODAY();
  const seanFYA = tasks.filter(t => t.owner === "Sean" && t.status === "FYA");
  const fyi = tasks.filter(t => t.status === "FYI" || t.task_type === "FYI").filter(t => t.status !== "Done");
  const urgent = tasks.filter(t => t.priority === "Urgent" && t.status !== "Done");
  const followUp = tasks.filter(t => t.status === "Follow Up");
  const jasonTasks = tasks.filter(t => t.owner === "Jason" && t.status !== "Done");
  const andreaTasks = tasks.filter(t => t.owner === "Andrea" && t.status !== "Done");
  const jasonDone = tasks.filter(t => t.owner === "Jason" && t.actual_date === today);
  const andreaDone = tasks.filter(t => t.owner === "Andrea" && t.actual_date === today);
  const jasonOverdue = tasks.filter(t => t.owner === "Jason" && isOverdue(t));
  const andreaOverdue = tasks.filter(t => t.owner === "Andrea" && isOverdue(t));
  let summary = `📋 *ESBD Daily Summary — ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}*\n\n`;
  if (seanFYA.length > 0) { summary += `🟠 *FYA — Sean*\n`; seanFYA.forEach(t => summary += `• ${t.subject}${t.client ? ` | ${t.client}` : ""}\n`); summary += "\n"; }
  if (fyi.length > 0) { summary += `🟣 *FYI*\n`; fyi.forEach(t => summary += `• ${t.subject}${t.client ? ` | ${t.client}` : ""}\n`); summary += "\n"; }
  if (urgent.length > 0) { summary += `🔴 *TO DO (Urgent)*\n`; urgent.forEach(t => summary += `• ${t.subject}${t.next_action ? ` — ${t.next_action}` : ""}\n`); summary += "\n"; }
  if (followUp.length > 0) { summary += `🏌️ *Follow Up*\n`; followUp.forEach(t => summary += `• ${t.client || t.subject}${t.next_action ? ` | ${t.next_action}` : ""}\n`); summary += "\n"; }
  if (jasonTasks.length > 0 || andreaTasks.length > 0) {
    summary += `👥 *Team Update*\n`;
    if (jasonTasks.length > 0) summary += `• Jason: ${jasonTasks.length} active${jasonDone.length > 0 ? `, ${jasonDone.length} completed today` : ""}${jasonOverdue.length > 0 ? `, ⚠️ ${jasonOverdue.length} overdue` : ""}\n`;
    if (andreaTasks.length > 0) summary += `• Andrea: ${andreaTasks.length} active${andreaDone.length > 0 ? `, ${andreaDone.length} completed today` : ""}${andreaOverdue.length > 0 ? `, ⚠️ ${andreaOverdue.length} overdue` : ""}\n`;
  }
  return summary;
}

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(10,10,20,0.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)" }}>
      <div onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true" style={{ background:"#0b2735",border:"1px solid #1b4a60",borderRadius:16,padding:"28px",maxWidth:740,width:"95vw",maxHeight:"92vh",overflowY:"auto" }}>
        {children}
      </div>
    </div>
  );
}

// Same look as before; the label is now linked to its input (shared implementation in hub/ui.js).
function Field({ label, required, children }) {
  return <HubField label={label} required={required}>{children}</HubField>;
}

const inp = { background:"#10364a",border:"1px solid #1b4a60",borderRadius:8,padding:"8px 12px",color:"#e2e8f0",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box" };

// ============================================================
// COMPANY DROPDOWN — pulls from Supabase, searchable, editable
// ============================================================
function CompanyDropdown({ value, onChange }) {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editList, setEditList] = useState([]);
  const [editVal, setEditVal] = useState("");
  const ref = useState(() => ({ current: null }))[0];

  useEffect(() => {
    supabase.from("tasks").select("company").then(({ data }) => {
      if (data) {
        const unique = [...new Set(
          data.map(t => t.company?.trim()).filter(Boolean)
        )].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        setCompanies(unique);
      }
    });
  }, []);

  useEffect(() => { setSearch(value || ""); }, [value]);

  const filtered = companies.filter(c =>
    !search.trim() || c.toLowerCase().includes(search.toLowerCase())
  );
  const showAddNew = search.trim() && !companies.some(c => c.toLowerCase() === search.trim().toLowerCase());

  const select = (name) => {
    onChange(name);
    setSearch(name);
    setOpen(false);
  };

  const openEdit = () => {
    setEditList([...companies]);
    setEditMode(true);
    setOpen(false);
  };

  const saveEdit = async () => {
    // For each edited name, update all tasks with the old name
    for (let i = 0; i < companies.length; i++) {
      if (companies[i] !== editList[i] && editList[i]?.trim()) {
        await supabase.from("tasks").update({ company: editList[i].trim() }).eq("company", companies[i]);
      }
    }
    setCompanies(editList.filter(Boolean));
    setEditMode(false);
  };

  if (editMode) return (
    <div style={{ background:"#0e2d3e", border:"1px solid #118fb5", borderRadius:8, padding:12 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#118fb5", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>✏️ Edit Company Names</div>
      <div style={{ maxHeight:200, overflowY:"auto", marginBottom:10 }}>
        {editList.map((c, i) => (
          <div key={i} style={{ display:"flex", gap:6, marginBottom:6, alignItems:"center" }}>
            <input value={c} onChange={e => { const l = [...editList]; l[i] = e.target.value; setEditList(l); }}
              style={{ ...inp, fontSize:13, padding:"6px 10px", flex:1 }} />
            <button onClick={() => setEditList(editList.filter((_, j) => j !== i))}
              style={{ background:"none", border:"1px solid #7f1d1d", borderRadius:6, color:"#ef4444", cursor:"pointer", padding:"4px 8px", fontSize:12 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:8 }}>
        <input value={editVal} onChange={e => setEditVal(e.target.value)} placeholder="Add new company..."
          style={{ ...inp, fontSize:13, padding:"6px 10px", flex:1 }} />
        <button onClick={() => { if (editVal.trim()) { setEditList([...editList, editVal.trim()]); setEditVal(""); }}}
          style={{ background:"#118fb5", border:"none", borderRadius:6, color:"#fff", cursor:"pointer", padding:"6px 12px", fontSize:13, fontWeight:700 }}>+</button>
      </div>
      <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
        <button onClick={() => setEditMode(false)} style={{ padding:"6px 14px", background:"none", border:"1px solid #1b4a60", borderRadius:6, color:"#7f93a1", cursor:"pointer", fontSize:12 }}>Cancel</button>
        <button onClick={saveEdit} style={{ padding:"6px 14px", background:"#118fb5", border:"none", borderRadius:6, color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700 }}>Save Changes</button>
      </div>
    </div>
  );

  return (
    <div style={{ position:"relative" }} ref={r => ref.current = r}>
      <div style={{ display:"flex", gap:6 }}>
        <div style={{ flex:1, position:"relative" }}>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); onChange(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            placeholder="Type or select company..."
            style={{ ...inp }}
          />
          {search && (
            <button onMouseDown={e => { e.preventDefault(); onChange(""); setSearch(""); }}
              style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#7f93a1", cursor:"pointer", fontSize:14 }}>✕</button>
          )}
        </div>
        <button onClick={openEdit} title="Edit company list"
          style={{ background:"#0e2d3e", border:"1px solid #1b4a60", borderRadius:8, color:"#7f93a1", cursor:"pointer", padding:"0 10px", fontSize:13, flexShrink:0 }}>✏️</button>
      </div>
      {open && (filtered.length > 0 || showAddNew) && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#0e2d3e", border:"1px solid #1b4a60", borderRadius:8, zIndex:200, maxHeight:200, overflowY:"auto", marginTop:4, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
          {filtered.map(c => (
            <div key={c} onMouseDown={() => select(c)}
              style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, color:"#e2e8f0", borderBottom:"1px solid #1b4a6022" }}
              onMouseEnter={e => e.currentTarget.style.background = "#1b4a60"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              {c}
            </div>
          ))}
          {showAddNew && (
            <div onMouseDown={() => select(search.trim())}
              style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, color:"#118fb5", fontWeight:600, borderTop:"1px solid #1b4a60" }}
              onMouseEnter={e => e.currentTarget.style.background = "#118fb522"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              + Add "{search.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Global projects ref — updated by App when Supabase data loads
let _projectsCache = STRATEGIC_PROJECTS_FALLBACK;

// ── Project Dropdown ───────────────────────────────────────
function ProjectDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = _projectsCache.find(p => p.name === value);
  return (
    <div style={{ position:"relative" }}>
      <div onClick={() => setOpen(!open)} style={{ ...inp, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ color: selected ? selected.color : "#7f93a1" }}>
          {selected ? "📋 " + selected.name : "No project"}
        </span>
        <span style={{ color:"#7f93a1", fontSize:12 }}>▾</span>
      </div>
      {open && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#0e2d3e", border:"1px solid #1b4a60", borderRadius:8, zIndex:200, maxHeight:220, overflowY:"auto", marginTop:4, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
          <div onMouseDown={() => { onChange(""); setOpen(false); }}
            style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, color:"#7f93a1", borderBottom:"1px solid #1b4a60" }}
            onMouseEnter={e => e.currentTarget.style.background="#1b4a60"}
            onMouseLeave={e => e.currentTarget.style.background="none"}>
            — No project
          </div>
          {_projectsCache.map(p => (
            <div key={p.name} onMouseDown={() => { onChange(p.name); setOpen(false); }}
              style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, color:p.color, borderBottom:"1px solid #1b4a6022", display:"flex", alignItems:"center", gap:8 }}
              onMouseEnter={e => e.currentTarget.style.background="#1b4a60"}
              onMouseLeave={e => e.currentTarget.style.background="none"}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:p.color, flexShrink:0 }} />
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskForm({ initial, onSave, onClose, companies = [], opportunities = [] }) {
  const [form, setForm] = useState({ ...newTask(), ...initial, action_state: stateOf({ ...newTask(), ...initial }) });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const v = validateTask(form);
  const st = form.action_state;
  const err = (k) => (submitted ? v.errors[k] : undefined);
  const save = async () => {
    setSubmitted(true);
    if (!v.ok) return;
    setSaving(true); setError(null);
    const e = await onSave({ ...form, status: stateToStatus(st, form.status) });
    setSaving(false);
    if (e) setError(e); else onClose();
  };
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24 }}>
        <h2 style={{ margin:0,fontSize:20,fontWeight:700,color:"#e2e8f0" }}>{initial.id ? "Edit Task" : "New Task"}</h2>
        <button onClick={onClose} style={{ background:"none",border:"none",color:"#7f93a1",cursor:"pointer",fontSize:20 }}>✕</button>
      </div>
      {error && <HubBanner onClose={()=>setError(null)}>{error}</HubBanner>}
      {form.needs_review && <HubBanner kind="warn">Open question: {form.needs_review}</HubBanner>}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14 }}>
        <div style={{ gridColumn:"1/-1" }}><Field label="Subject" required><input style={inp} value={form.subject} onChange={(e)=>set("subject",e.target.value)} placeholder="What needs to be done?" />{err("subject") && <div style={{ fontSize:11,color:"#fca5a5" }}>{err("subject")}</div>}</Field></div>
        <Field label="Responsible" required><select style={inp} value={form.owner} onChange={(e)=>set("owner",e.target.value)}>{[...ACTIVE_USERS, "Unassigned", ...(form.owner && ![...ACTIVE_USERS,"Unassigned"].includes(form.owner) ? [form.owner] : [])].map(o=><option key={o} value={o}>{ownerLabel(o)}</option>)}</select></Field>
        <Field label="State" required>
          <select style={{ ...inp, borderColor: STATE_COLOR[st] }} value={st} onChange={(e)=>set("action_state",e.target.value)}>{ACTION_STATES.map(s=><option key={s} value={s}>{STATE_STYLE[s]?.label || s}</option>)}</select>
        </Field>
        <Field label="Priority"><select style={inp} value={form.priority} onChange={(e)=>set("priority",e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></Field>
        <Field label="Category">
          <select style={{ ...inp, borderColor: normaliseCategory(form.category) ? CATEGORIES[normaliseCategory(form.category)].ink : undefined, color: normaliseCategory(form.category) ? CATEGORIES[normaliseCategory(form.category)].ink : inp.color }}
            value={normaliseCategory(form.category) || ""}
            onChange={(e)=>{ const c=e.target.value||null; set("category",c); if (isPrivateCategory(c)) set("visibility","private"); }}>
            <option value="">— None</option>{CATEGORY_NAMES.map(c=><option key={c} value={c} style={{ color: CATEGORIES[c].ink }}>{c}{CATEGORIES[c].private?" (private)":""}</option>)}
          </select>
        </Field>
        <Field label="Task Type"><select style={inp} value={form.task_type||"Information Request"} onChange={(e)=>set("task_type",e.target.value)}>{TASK_TYPES.map(t=><option key={t}>{t}</option>)}</select></Field>
        <Field label="Due Date"><input type="date" style={inp} value={form.expected_date||""} onChange={(e)=>set("expected_date",e.target.value)} />{err("expected_date") && <div style={{ fontSize:11,color:"#fca5a5" }}>{err("expected_date")}</div>}</Field>
        <Field label="🔔 Follow-up Date" required={st==="Awaiting response"}><input type="date" style={inp} value={form.follow_up_date||""} onChange={(e)=>set("follow_up_date",e.target.value)} title="Comes back into Today on this date" />{err("follow_up_date") && <div style={{ fontSize:11,color:"#fca5a5" }}>{err("follow_up_date")}</div>}</Field>
        {(st==="Awaiting response"||st==="Monitoring") && <>
          <Field label="Waiting on"><input style={inp} value={form.waiting_on||""} onChange={(e)=>set("waiting_on",e.target.value)} placeholder="Who must respond? e.g. Emily (CIMC)" /></Field>
          <Field label="Expected response by"><input type="date" style={inp} value={form.expected_response_date||""} onChange={(e)=>set("expected_response_date",e.target.value)} /></Field>
        </>}
        <Field label="Company (record)"><Picker value={form.company_id} onChange={(id)=>{ set("company_id",id); const c=companies.find(x=>x.id===id); if(c) set("company",c.name); }} noneLabel="— Not linked" options={companies.map(c=>({ value:c.id, label:c.name }))} /></Field>
        <Field label="Opportunity"><Picker value={form.opportunity_id} onChange={(id)=>set("opportunity_id",id)} noneLabel="— None" options={opportunities.filter(o=>!form.company_id||o.company_id===form.company_id).map(o=>({ value:o.id, label:o.name||o.company }))} /></Field>
        <Field label="Client / contact"><input style={inp} value={form.client||""} onChange={(e)=>set("client",e.target.value)} /></Field>
        <Field label="Company (text)"><CompanyDropdown value={form.company} onChange={v=>set("company",v)} /></Field>
        <Field label="Project"><ProjectDropdown value={form.project||""} onChange={v=>set("project",v)} /></Field>
        <Field label="Email"><input style={inp} value={form.email||""} onChange={(e)=>set("email",e.target.value)} /></Field>
        <Field label="Date Received"><input type="date" style={inp} value={form.date_received||""} onChange={(e)=>set("date_received",e.target.value)} /></Field>
        <Field label="Visibility"><select style={inp} value={form.visibility||"team"} onChange={(e)=>set("visibility",e.target.value)}><option value="team">Team</option><option value="private">Private (Sean & Vanya only, once login is on)</option></select></Field>
        <div style={{ gridColumn:"1/-1" }}><Field label="Next Action"><input style={inp} value={form.next_action||""} onChange={(e)=>set("next_action",e.target.value)} /></Field></div>
        {form.follow_up_date && <div style={{ gridColumn:"1/-1" }}><Field label="Follow-up Note"><input style={inp} value={form.follow_up_note||""} onChange={(e)=>set("follow_up_note",e.target.value)} placeholder="What to check or ask when you follow up..." /></Field></div>}
        <div style={{ gridColumn:"1/-1" }}><Field label="Notes"><textarea style={{ ...inp,minHeight:72,resize:"vertical" }} value={form.notes||""} onChange={(e)=>set("notes",e.target.value)} placeholder="Add context, details or background..." /></Field></div>
        {(st === "Completed" || st === "Cancelled") && <div style={{ gridColumn:"1/-1" }}><Field label="Outcome"><input style={inp} value={form.outcome||""} onChange={(e)=>set("outcome",e.target.value)} placeholder={st==="Completed"?"What was actually achieved?":"Why was it cancelled?"} /></Field></div>}
      </div>
      {v.warnings.length > 0 && <div style={{ marginTop:12,fontSize:12,color:"#fde68a" }}>Missing (you can still save): {v.warnings.join(" · ")}</div>}
      <div style={{ marginTop:24,display:"flex",gap:10,justifyContent:"flex-end" }}>
        <button onClick={onClose} style={{ padding:"10px 20px",background:"none",border:"1px solid #1b4a60",borderRadius:8,color:"#7f93a1",cursor:"pointer" }}>Cancel</button>
        <button disabled={saving} onClick={save} style={{ padding:"10px 24px",background:"#118fb5",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:600,opacity:saving?0.6:1 }}>
          {saving ? "Saving…" : initial.id ? "Save Changes" : "Create Task"}
        </button>
      </div>
    </div>
  );
}

function TaskCard({ task, onClick, compact, onComplete }) {
  const over = isOverdue(task);
  const [completing, setCompleting] = useState(false);
  const handleComplete = async (e) => {
    e.stopPropagation();
    setCompleting(true);
    setTimeout(() => onComplete && onComplete(task.id), 600);
  };
  if (completing) return (
    <div style={{ borderRadius:10,marginBottom:compact?6:10,overflow:"hidden",animation:"completeFlash 0.6s ease-out forwards" }}>
      <style>{`@keyframes completeFlash { 0%{background:#118fb5;transform:scale(1);opacity:1} 50%{background:#10b981;transform:scale(1.02);opacity:1} 100%{background:#10b981;transform:scale(0.95);opacity:0;height:0;padding:0;margin:0} }`}</style>
      <div style={{ padding:compact?"10px 12px":"14px 16px",display:"flex",alignItems:"center",gap:10 }}>
        <div style={{ width:22,height:22,borderRadius:"50%",background:"#10b981",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14 }}>✓</div>
        <span style={{ fontSize:14,fontWeight:600,color:"#fff",textDecoration:"line-through" }}>{task.subject}</span>
        <span style={{ marginLeft:"auto",fontSize:12,color:"#a7f3d0" }}>Done! 🎉</span>
      </div>
    </div>
  );
  return (
    <div onClick={()=>onClick(task)}
      style={{ background:"#0e2d3e",border:`1px solid ${over?"#7f1d1d":"#1b4a60"}`,borderLeft:`3px solid ${STATUS_COLOR[task.status]}`,borderRadius:10,padding:compact?"10px 12px":"14px 16px",cursor:"pointer",transition:"transform 0.15s,box-shadow 0.15s",marginBottom:compact?6:10 }}
      onMouseEnter={(e)=>{ e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.4)"; }}
      onMouseLeave={(e)=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8 }}>
        {task.status !== "Done" && (
          <div onClick={handleComplete} style={{ flexShrink:0,width:22,height:22,borderRadius:"50%",border:"2px solid #1b4a60",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",marginTop:2,transition:"all 0.2s" }}
            onMouseEnter={(e)=>{ e.stopPropagation(); e.currentTarget.style.borderColor="#10b981"; e.currentTarget.style.background="#10b98122"; }}
            onMouseLeave={(e)=>{ e.stopPropagation(); e.currentTarget.style.borderColor="#1b4a60"; e.currentTarget.style.background="none"; }} />
        )}
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap" }}>
            <span style={{ fontSize:10,color:"#7f93a1",fontFamily:"monospace" }}>#{task.id?.toString().slice(-4)}</span>
            <span style={{ fontSize:11,padding:"2px 8px",borderRadius:99,background:STATUS_COLOR[task.status]+"33",color:STATUS_COLOR[task.status],fontWeight:700 }}>{STATUS_EMOJI[task.status]} {task.status}</span>
            <span style={{ fontSize:10,padding:"2px 7px",borderRadius:99,background:PRIORITY_COLOR[task.priority]+"22",color:PRIORITY_COLOR[task.priority],fontWeight:600 }}>{task.priority}</span>
            <CategoryTag category={task.category} small /><DelegatedTag owner={task.owner} small />
            {over && <span style={{ fontSize:10,padding:"2px 7px",borderRadius:99,background:"#7f1d1d",color:"#fca5a5",fontWeight:600 }}>OVERDUE</span>}
            {task.project && !compact && _projectsCache.find(x=>x.name===task.project) && (
              <span style={{ fontSize:10,padding:"2px 7px",borderRadius:99,background:(_projectsCache.find(x=>x.name===task.project).color)+"22",color:_projectsCache.find(x=>x.name===task.project).color,fontWeight:600 }}>📋 {task.project}</span>
            )}
          </div>
          <div style={{ fontSize:14,fontWeight:600,color:"#e2e8f0",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{task.subject||"Untitled"}</div>
          {!compact && <div style={{ fontSize:12,color:"#7f93a1" }}>{[task.client,task.company].filter(Boolean).join(" · ")||"No client"}</div>}
        </div>
        <div style={{ textAlign:"right",flexShrink:0 }}>
          <div style={{ fontSize:11,color:"#7f93a1",marginBottom:3 }}>{task.owner}</div>
          <div style={{ fontSize:11,color:over?"#fca5a5":"#7f93a1" }}>{fmtDate(task.expected_date)}</div>
        </div>
      </div>
      {!compact && task.next_action && <div style={{ marginTop:8,fontSize:12,color:"#118fb5",borderTop:"1px solid #1b4a60",paddingTop:8 }}>→ {task.next_action}</div>}
      {!compact && task.notes && <div style={{ marginTop:6,fontSize:12,color:"#7f93a1",fontStyle:"italic",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>💬 {task.notes.length > 80 ? task.notes.substring(0,80)+"..." : task.notes}</div>}
    </div>
  );
}

function KanbanCol({ status, tasks, onClick, onDrop, onComplete }) {
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={(e)=>{ e.preventDefault(); setOver(true); }} onDragLeave={()=>setOver(false)}
      onDrop={(e)=>{ e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData("taskId"), status); }}
      style={{ flex:1,minWidth:220,background:over?"#123a4f":"#0b2735",border:`1px solid ${over?STATUS_COLOR[status]:"#1b4a60"}`,borderRadius:12,padding:14 }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14 }}>
        <span>{STATUS_EMOJI[status]}</span>
        <span style={{ fontWeight:700,color:"#e2e8f0",fontSize:13 }}>{status}</span>
        <span style={{ marginLeft:"auto",background:"#1b4a60",borderRadius:99,padding:"2px 8px",fontSize:11,color:"#9ca3af" }}>{tasks.length}</span>
      </div>
      {tasks.map(t=>(
        <div key={t.id} draggable onDragStart={(e)=>e.dataTransfer.setData("taskId",String(t.id))}>
          <TaskCard task={t} onClick={onClick} onComplete={onComplete} compact />
        </div>
      ))}
      {tasks.length===0 && <div style={{ textAlign:"center",padding:"24px 0",color:"#557080",fontSize:12 }}>Drop tasks here</div>}
    </div>
  );
}

function TeamCard({ name, tasks }) {
  const active = tasks.filter(t=>t.status!=="Done");
  const done = tasks.filter(t=>t.status==="Done"&&t.actual_date===TODAY());
  const overdue = tasks.filter(isOverdue);
  const fya = tasks.filter(t=>t.status==="FYA");
  const followUp = tasks.filter(t=>t.status==="Follow Up");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  return (
    <div style={{ background:"#0e2d3e",border:"1px solid #1b4a60",borderRadius:12,padding:20,marginBottom:16 }}>
      <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
        <div style={{ width:40,height:40,borderRadius:"50%",background:"#118fb5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#fff" }}>{name[0]}</div>
        <div>
          <div style={{ fontSize:16,fontWeight:700,color:"#e2e8f0" }}>{name}</div>
          <div style={{ fontSize:11,color:"#7f93a1" }}>{active.length} active tasks</div>
        </div>
        {overdue.length>0 && <span style={{ marginLeft:"auto",background:"#7f1d1d",color:"#fca5a5",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700 }}>⚠️ {overdue.length} overdue</span>}
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16 }}>
        {[{label:"Active",value:active.length,color:"#118fb5"},{label:"FYA",value:fya.length,color:"#f97316"},{label:"Follow Up",value:followUp.length,color:"#10b981"},{label:"Done Today",value:done.length,color:"#10b981"}].map(function(stat){return(
          <div key={stat.label} style={{ background:"#0b2735",borderRadius:8,padding:10,textAlign:"center",border:"1px solid #1b4a60" }}>
            <div style={{ fontSize:22,fontWeight:800,color:stat.color }}>{stat.value}</div>
            <div style={{ fontSize:10,color:"#7f93a1",marginTop:2 }}>{stat.label}</div>
          </div>
        );})}
      </div>
      {active.slice(0,3).map(t=>(
        <div key={t.id} style={{ fontSize:12,color:"#9ca3af",padding:"4px 0",borderBottom:"1px solid #10364a",display:"flex",justifyContent:"space-between" }}>
          <span>{STATUS_EMOJI[t.status]} {t.subject}</span>
          <span style={{ color:isOverdue(t)?"#fca5a5":"#6a8090" }}>{fmtDate(t.expected_date)}</span>
        </div>
      ))}
      <button onClick={()=>setShowNotes(!showNotes)} style={{ marginTop:12,background:"none",border:"1px solid #1b4a60",borderRadius:6,color:"#7f93a1",cursor:"pointer",fontSize:12,padding:"6px 12px" }}>
        {showNotes?"Hide Notes":"📝 Performance Notes"}
      </button>
      {showNotes && <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder={`Private notes about ${name}...`} style={{ ...inp,marginTop:8,minHeight:80,resize:"vertical" }} />}
    </div>
  );
}

function TaskActivityFeed({ taskId, taskNotes, onNoteAdded }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [author, setAuthor] = useState("Vanya");

  const load = async () => {
    const { data } = await supabase.from("task_history").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
    if (data) setHistory(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [taskId]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    await supabase.from("task_history").insert([{
      task_id: taskId, changed_by: author, entry_type: "note",
      note: newNote.trim(), old_status: null, new_status: null,
    }]);
    setNewNote("");
    setSaving(false);
    load();
    if (onNoteAdded) onNoteAdded();
  };

  if (loading) return null;

  return (
    <div style={{ marginTop:20,borderTop:"1px solid #1b4a60",paddingTop:20 }}>
      <div style={{ fontSize:11,fontWeight:700,color:"#7f93a1",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:14 }}>📋 Activity & Notes</div>
      <div style={{ background:"#0e2d3e",border:"1px solid #1b4a60",borderRadius:10,padding:12,marginBottom:16 }}>
        <textarea value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Add an update or note..." style={{ ...inp,minHeight:60,resize:"vertical",marginBottom:8,background:"#0b2735" }} />
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <select value={author} onChange={e=>setAuthor(e.target.value)} style={{ ...inp,width:"auto",fontSize:12,padding:"5px 10px",background:"#0b2735" }}>
            {OWNERS.map(o=><option key={o}>{o}</option>)}
          </select>
          <button onClick={addNote} disabled={!newNote.trim()||saving} style={{ padding:"7px 18px",background:newNote.trim()?"#118fb5":"#1b4a60",border:"none",borderRadius:7,color:newNote.trim()?"#fff":"#6a8090",cursor:newNote.trim()?"pointer":"not-allowed",fontSize:13,fontWeight:600 }}>
            {saving?"Saving...":"Add Note"}
          </button>
        </div>
      </div>
      {taskNotes && taskNotes.trim() && (
        <div style={{ display:"flex",gap:12,marginBottom:0 }}>
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0 }}>
            <div style={{ width:28,height:28,borderRadius:"50%",background:"#1e3a8a",border:"2px solid #3b82f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>📌</div>
            {history.length > 0 && <div style={{ width:2,flex:1,background:"#10364a",minHeight:16,margin:"2px 0" }} />}
          </div>
          <div style={{ flex:1,paddingBottom:16 }}>
            <div style={{ fontSize:12,fontWeight:600,color:"#60a5fa",marginBottom:4 }}>📌 Original Notes</div>
            <div style={{ background:"#0e2d3e",border:"1px solid #1b4a60",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#e2e8f0",lineHeight:1.5 }}>{taskNotes}</div>
          </div>
        </div>
      )}
      {history.length === 0 && (!taskNotes || !taskNotes.trim())
        ? <div style={{ fontSize:12,color:"#557080",textAlign:"center",padding:"12px 0" }}>No activity yet</div>
        : history.map((h,i) => (
          <div key={h.id} style={{ display:"flex",gap:12,marginBottom:0 }}>
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0 }}>
              <div style={{ width:28,height:28,borderRadius:"50%",background:h.entry_type==="note"?"#1e3a8a":STATUS_COLOR[h.new_status]+"33",border:`2px solid ${h.entry_type==="note"?"#3b82f6":STATUS_COLOR[h.new_status]||"#1b4a60"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>
                {h.entry_type==="note"?"💬":STATUS_EMOJI[h.new_status]||"📌"}
              </div>
              {i < history.length-1 && <div style={{ width:2,flex:1,background:"#10364a",minHeight:16,margin:"2px 0" }} />}
            </div>
            <div style={{ flex:1,paddingBottom:16 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
                <div style={{ fontSize:12,fontWeight:600,color:"#9ca3af" }}>
                  {h.entry_type==="note"
                    ? <span style={{ color:"#60a5fa" }}>{h.changed_by}</span>
                    : <span>{h.changed_by} changed: <span style={{ color:STATUS_COLOR[h.old_status]||"#7f93a1" }}>{h.old_status}</span> → <span style={{ color:STATUS_COLOR[h.new_status]||"#118fb5" }}>{h.new_status}</span></span>
                  }
                </div>
                <div style={{ fontSize:10,color:"#6a8090",flexShrink:0,marginLeft:8 }}>{fmtDateTime(h.created_at)}</div>
              </div>
              {h.note && <div style={{ background:"#0e2d3e",border:"1px solid #1b4a60",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#e2e8f0",lineHeight:1.5 }}>{h.note}</div>}
            </div>
          </div>
        ))
      }
    </div>
  );
}

function FlagsView({ flags, onMarkSeen, onMarkAllSeen, onViewReports }) {
  const unseen = flags.filter(f => !f.seen && f.task_subject !== "Weekly Customer Report");
  const seen = flags.filter(f => f.seen && f.task_subject !== "Weekly Customer Report");
  const reports = flags.filter(f => f.task_subject === "Weekly Customer Report");
  const unreadReports = reports.filter(f => !f.seen).length;
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12,fontWeight:700,color:"#7f93a1",letterSpacing:"0.06em",textTransform:"uppercase" }}>🚨 Flags from Team</div>
          <div style={{ fontSize:11,color:"#6a8090",marginTop:2 }}>Jason & Andrea flagging Sean for attention</div>
        </div>
        {unseen.length > 0 && (
          <button onClick={onMarkAllSeen} style={{ padding:"8px 16px",background:"#10b98122",border:"1px solid #10b981",borderRadius:8,color:"#10b981",cursor:"pointer",fontSize:13,fontWeight:600 }}>
            ✓ Mark all seen
          </button>
        )}
      </div>
      {unseen.length === 0 && seen.length === 0 && (
        <div style={{ textAlign:"center",padding:"60px 0",color:"#557080" }}>
          <div style={{ fontSize:40,marginBottom:12 }}>✅</div>
          <div>No flags from the team</div>
        </div>
      )}
      {unseen.length > 0 && (
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:11,color:"#ef4444",fontWeight:700,marginBottom:12,letterSpacing:"0.06em",textTransform:"uppercase" }}>⚠️ Needs Attention</div>
          {unseen.map(f => (
            <div key={f.id} style={{ background:"#0e2d3e",border:`1px solid ${URGENCY_COLOR[f.urgency]}44`,borderLeft:`3px solid ${URGENCY_COLOR[f.urgency]}`,borderRadius:12,padding:"16px 20px",marginBottom:12 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 }}>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:11,padding:"3px 10px",borderRadius:99,background:URGENCY_COLOR[f.urgency]+"33",color:URGENCY_COLOR[f.urgency],fontWeight:700 }}>{f.urgency}</span>
                  <span style={{ fontSize:13,color:"#9ca3af",fontWeight:600 }}>from {f.from_name}</span>
                </div>
                <div style={{ fontSize:11,color:"#6a8090" }}>{fmtDateTime(f.created_at)}</div>
              </div>
              {f.task_subject && f.task_subject !== "General flag" && (
                <div style={{ fontSize:12,color:"#7f93a1",marginBottom:8 }}>Re: {f.task_subject}</div>
              )}
              <div style={{ fontSize:14,color:"#e2e8f0",lineHeight:1.6,marginBottom:14 }}>{f.note}</div>
              <button onClick={()=>onMarkSeen(f.id)} style={{ padding:"8px 20px",background:"#10b98122",border:"1px solid #10b981",borderRadius:8,color:"#10b981",cursor:"pointer",fontSize:13,fontWeight:600 }}>
                ✓ Got it — Mark as Seen
              </button>
            </div>
          ))}
        </div>
      )}
      {seen.length > 0 && (
        <div>
          <div style={{ fontSize:11,color:"#557080",fontWeight:700,marginBottom:12,letterSpacing:"0.06em",textTransform:"uppercase" }}>Previously Seen</div>
          {seen.slice(0,10).map(f => (
            <div key={f.id} style={{ background:"#0b2735",border:"1px solid #10364a",borderLeft:`3px solid #557080`,borderRadius:12,padding:"12px 16px",marginBottom:8,opacity:0.6 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <span style={{ fontSize:11,color:"#6a8090",fontWeight:600 }}>{f.urgency}</span>
                  <span style={{ fontSize:11,color:"#6a8090" }}>from {f.from_name}</span>
                  <span style={{ fontSize:11,color:"#10b981" }}>✅ Seen</span>
                </div>
                <div style={{ fontSize:10,color:"#557080" }}>{fmtDateTime(f.created_at)}</div>
              </div>
              {f.task_subject && f.task_subject !== "General flag" && (
                <div style={{ fontSize:11,color:"#6a8090",marginBottom:4 }}>Re: {f.task_subject}</div>
              )}
              <div style={{ fontSize:13,color:"#7f93a1",lineHeight:1.4 }}>{f.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeeklyReportView({ flags, onMarkSeen, onDeleteReport, onBack }) {
  const reports = flags.filter(f => f.task_subject === "Weekly Customer Report");
  const unread = reports.filter(f => !f.seen);
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12,fontWeight:700,color:"#7f93a1",letterSpacing:"0.06em",textTransform:"uppercase" }}>📊 Weekly Customer Reports</div>
          <div style={{ fontSize:11,color:"#6a8090",marginTop:2 }}>Sent by Andrea & Jason from the team view</div>
        </div>
        {unread.length > 0 && <span style={{ background:"#f97316",color:"#fff",borderRadius:99,padding:"3px 10px",fontSize:12,fontWeight:700 }}>{unread.length} new</span>}
      </div>
      {reports.length === 0
        ? <div style={{ textAlign:"center",padding:"60px 0",color:"#557080" }}>
            <div style={{ fontSize:40,marginBottom:12 }}>📊</div>
            <div>No weekly reports yet</div>
          </div>
        : reports.map(r => (
          <div key={r.id} style={{ background:"#0e2d3e",border:`1px solid ${r.seen?"#1b4a60":"#3b82f6"}`,borderLeft:`3px solid ${r.seen?"#557080":"#3b82f6"}`,borderRadius:12,padding:"20px 24px",marginBottom:16 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
              <div>
                <div style={{ fontSize:14,fontWeight:700,color:"#e2e8f0" }}>📊 Weekly Report</div>
                <div style={{ fontSize:11,color:"#7f93a1",marginTop:2 }}>from {r.from_name} · {fmtDateTime(r.created_at)}</div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                {!r.seen && <span style={{ fontSize:11,background:"#f97316",color:"#fff",borderRadius:99,padding:"2px 10px",fontWeight:700 }}>New</span>}
                <button onClick={()=>{ if(window.confirm("Delete this report?")) onDeleteReport(r.id); }}
                  style={{ padding:"4px 10px",background:"none",border:"1px solid #7f1d1d",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:11 }}>
                  🗑️
                </button>
              </div>
            </div>
            <pre style={{ background:"#08202c",border:"1px solid #1b4a60",borderRadius:8,padding:16,color:"#e2e8f0",fontSize:13,whiteSpace:"pre-wrap",fontFamily:"system-ui",lineHeight:1.6,margin:0 }}>{r.note}</pre>
            {!r.seen && (
              <button onClick={()=>onMarkSeen(r.id)} style={{ marginTop:12,padding:"8px 20px",background:"#10b98122",border:"1px solid #10b981",borderRadius:8,color:"#10b981",cursor:"pointer",fontSize:13,fontWeight:600 }}>
                ✓ Mark as Read
              </button>
            )}
          </div>
        ))
      }
    </div>
  );
}

function SummaryModal({ tasks, onClose }) {
  const summary = generateSummary(tasks);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(summary); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  return (
    <Modal onClose={onClose}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <h2 style={{ margin:0,fontSize:18,fontWeight:700,color:"#e2e8f0" }}>📋 Daily WhatsApp Summary</h2>
        <button onClick={onClose} style={{ background:"none",border:"none",color:"#7f93a1",cursor:"pointer",fontSize:20 }}>✕</button>
      </div>
      <pre style={{ background:"#08202c",border:"1px solid #1b4a60",borderRadius:8,padding:16,color:"#e2e8f0",fontSize:13,whiteSpace:"pre-wrap",fontFamily:"system-ui",lineHeight:1.6,maxHeight:400,overflowY:"auto" }}>{summary}</pre>
      <div style={{ marginTop:16,display:"flex",gap:10,justifyContent:"flex-end" }}>
        <button onClick={onClose} style={{ padding:"10px 20px",background:"none",border:"1px solid #1b4a60",borderRadius:8,color:"#7f93a1",cursor:"pointer" }}>Close</button>
        <button onClick={copy} style={{ padding:"10px 24px",background:"#118fb5",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:700 }}>{copied?"✅ Copied!":"📋 Copy for WhatsApp"}</button>
      </div>
    </Modal>
  );
}

function StickyNote({ onClose }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [author, setAuthor] = useState("Vanya");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    loadNotes();
    const channel = supabase.channel("notes-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"notes" }, loadNotes)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);
  const loadNotes = async () => {
    const { data } = await supabase.from("notes").select("*").order("created_at", { ascending: false }).limit(20);
    if (data) setNotes(data);
    setLoading(false);
  };
  const addNote = async () => {
    if (!newNote.trim()) return;
    await supabase.from("notes").insert([{ content: newNote.trim(), author }]);
    setNewNote("");
  };
  const deleteNote = async (id) => { await supabase.from("notes").delete().eq("id", id); };
  return (
    <div style={{ position:"fixed",bottom:80,right:20,width:300,background:"#0b2735",border:"1px solid #1e3a8a",borderRadius:12,zIndex:900,boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
      <div style={{ background:"#1e3a8a",borderRadius:"12px 12px 0 0",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <span style={{ fontSize:14 }}>📝</span>
          <span style={{ fontSize:13,fontWeight:700,color:"#fff" }}>Quick Notes</span>
        </div>
        <button onClick={onClose} style={{ background:"none",border:"none",color:"#93c5fd",cursor:"pointer",fontSize:16 }}>✕</button>
      </div>
      <div style={{ padding:12,maxHeight:240,overflowY:"auto" }}>
        {loading ? <div style={{ color:"#7f93a1",fontSize:12,textAlign:"center",padding:16 }}>Loading...</div>
          : notes.length===0 ? <div style={{ color:"#7f93a1",fontSize:12,textAlign:"center",padding:16 }}>No notes yet</div>
          : notes.map(n=>(
            <div key={n.id} style={{ background:"#0e2d3e",borderRadius:8,padding:"8px 10px",marginBottom:8,border:"1px solid #1b4a60" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
                <span style={{ fontSize:11,fontWeight:600,color:"#60a5fa" }}>{n.author}</span>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <span style={{ fontSize:10,color:"#6a8090" }}>{fmtDate(n.created_at?.split("T")[0])}</span>
                  <button onClick={()=>deleteNote(n.id)} style={{ background:"none",border:"none",color:"#6a8090",cursor:"pointer",fontSize:12 }}>✕</button>
                </div>
              </div>
              <div style={{ fontSize:13,color:"#e2e8f0",lineHeight:1.4 }}>{n.content}</div>
            </div>
          ))
        }
      </div>
      <div style={{ padding:"10px 12px",borderTop:"1px solid #1b4a60" }}>
        <select value={author} onChange={(e)=>setAuthor(e.target.value)} style={{ ...inp,marginBottom:8,fontSize:12,padding:"6px 10px" }}>
          {OWNERS.map(o=><option key={o}>{o}</option>)}
        </select>
        <div style={{ display:"flex",gap:6 }}>
          <input value={newNote} onChange={(e)=>setNewNote(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&addNote()} placeholder="Type a note..." style={{ ...inp,fontSize:12,padding:"6px 10px",flex:1 }} />
          <button onClick={addNote} style={{ background:"#1e3a8a",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",padding:"6px 12px",fontSize:13,fontWeight:700 }}>+</button>
        </div>
      </div>
    </div>
  );
}

function SeanWeekView({ items, onAdd, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title:"", category:"📦 Other", reference:"", date_needed:"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    if (!form.title) return;
    await onAdd(form);
    setForm({ title:"", category:"📦 Other", reference:"", date_needed:"" });
    setShowForm(false);
  };
  const grouped = WEEK_CATEGORIES.reduce((acc,cat)=>{ acc[cat]=items.filter(i=>i.category===cat); return acc; },{});
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
        <div style={{ fontSize:12,fontWeight:700,color:"#7f93a1",letterSpacing:"0.06em",textTransform:"uppercase" }}>Sean's Week Ahead</div>
        <button onClick={()=>setShowForm(!showForm)} style={{ padding:"8px 16px",background:"#118fb5",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700 }}>+ Add Item</button>
      </div>
      {showForm && (
        <div style={{ background:"#0e2d3e",border:"1px solid #1b4a60",borderRadius:12,padding:20,marginBottom:20 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <div style={{ gridColumn:"1/-1" }}><Field label="Title" required><input style={inp} value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. Flight to Johannesburg" /></Field></div>
            <Field label="Category"><select style={inp} value={form.category} onChange={e=>set("category",e.target.value)}>{WEEK_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></Field>
            <Field label="Date Needed"><input type="date" style={inp} value={form.date_needed} onChange={e=>set("date_needed",e.target.value)} /></Field>
            <div style={{ gridColumn:"1/-1" }}><Field label="Reference / Link"><input style={inp} value={form.reference} onChange={e=>set("reference",e.target.value)} placeholder="Booking ref, URL, file name..." /></Field></div>
          </div>
          <div style={{ marginTop:14,display:"flex",gap:10,justifyContent:"flex-end" }}>
            <button onClick={()=>setShowForm(false)} style={{ padding:"8px 16px",background:"none",border:"1px solid #1b4a60",borderRadius:8,color:"#7f93a1",cursor:"pointer" }}>Cancel</button>
            <button onClick={save} style={{ padding:"8px 20px",background:"#118fb5",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:700 }}>Save</button>
          </div>
        </div>
      )}
      {items.length===0 && !showForm
        ? <div style={{ textAlign:"center",padding:"60px 0",color:"#557080" }}><div style={{ fontSize:40,marginBottom:12 }}>📅</div><div>Nothing added yet</div></div>
        : WEEK_CATEGORIES.filter(cat=>grouped[cat]&&grouped[cat].length>0).map(cat=>{
          return (
            <div key={cat} style={{ marginBottom:20 }}>
              <div style={{ fontSize:11,fontWeight:700,color:WEEK_CAT_COLOR[cat]||"#7f93a1",marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase" }}>{cat}</div>
              {grouped[cat].map(item=>(
                <div key={item.id} style={{ background:"#0e2d3e",border:"1px solid #1b4a60",borderLeft:`3px solid ${WEEK_CAT_COLOR[cat]||'#7f93a1'}`,borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:14,fontWeight:600,color:"#e2e8f0",marginBottom:4 }}>{item.title}</div>
                    {item.reference && (
                      item.reference.startsWith("http")
                        ? <a href={item.reference} target="_blank" rel="noreferrer" style={{ fontSize:12,color:"#118fb5",textDecoration:"none" }}>🔗 {item.reference}</a>
                        : <div style={{ fontSize:12,color:"#7f93a1" }}>📋 {item.reference}</div>
                    )}
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0,marginLeft:12 }}>
                    {item.date_needed && <div style={{ fontSize:11,color:"#7f93a1" }}>{fmtDate(item.date_needed)}</div>}
                    <button onClick={()=>onDelete(item.id)} style={{ background:"none",border:"none",color:"#6a8090",cursor:"pointer",fontSize:14 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })
      }
    </div>
  );
}

function InboxTriageView({ items, onAdd, onClear, onLog }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject:"", action:"Delete", next_action:"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    if (!form.subject) return;
    await onAdd(form);
    setForm({ subject:"", action:"Delete", next_action:"" });
    setShowForm(false);
  };
  const pending = items.filter(i=>!i.cleared);
  const cleared = items.filter(i=>i.cleared);
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12,fontWeight:700,color:"#7f93a1",letterSpacing:"0.06em",textTransform:"uppercase" }}>Inbox Triage</div>
          <div style={{ fontSize:11,color:"#6a8090",marginTop:2 }}>Sean flags → Vanya actions → Inbox stays clean</div>
        </div>
        <button onClick={()=>setShowForm(!showForm)} style={{ padding:"8px 16px",background:"#118fb5",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700 }}>+ Flag Email</button>
      </div>
      {showForm && (
        <div style={{ background:"#0e2d3e",border:"1px solid #1b4a60",borderRadius:12,padding:20,marginBottom:20 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <div style={{ gridColumn:"1/-1" }}><Field label="Email Subject + Sender" required><input style={inp} value={form.subject} onChange={e=>set("subject",e.target.value)} placeholder="e.g. Re: Invoice — from Niren Dwarika" /></Field></div>
            <Field label="Action">
              <div style={{ display:"flex",gap:8 }}>
                {["Delete","Follow Up"].map(a=>(
                  <button key={a} onClick={()=>set("action",a)} style={{ flex:1,padding:"8px",background:form.action===a?(a==="Delete"?"#7f1d1d":"#1e3a8a"):"#10364a",border:`1px solid ${form.action===a?(a==="Delete"?"#ef4444":"#3b82f6"):"#1b4a60"}`,borderRadius:8,color:form.action===a?"#fff":"#7f93a1",cursor:"pointer",fontSize:13,fontWeight:600 }}>{a==="Delete"?"🗑️ Delete":"→ Follow Up"}</button>
                ))}
              </div>
            </Field>
            {form.action==="Follow Up" && <Field label="Next Action"><input style={inp} value={form.next_action} onChange={e=>set("next_action",e.target.value)} placeholder="What needs to happen?" /></Field>}
          </div>
          <div style={{ marginTop:14,display:"flex",gap:10,justifyContent:"flex-end" }}>
            <button onClick={()=>setShowForm(false)} style={{ padding:"8px 16px",background:"none",border:"1px solid #1b4a60",borderRadius:8,color:"#7f93a1",cursor:"pointer" }}>Cancel</button>
            <button onClick={save} style={{ padding:"8px 20px",background:"#118fb5",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:700 }}>Flag It</button>
          </div>
        </div>
      )}
      {pending.length===0 && !showForm
        ? <div style={{ textAlign:"center",padding:"40px 0",color:"#557080" }}><div style={{ fontSize:40,marginBottom:12 }}>📭</div><div>Inbox is clear!</div></div>
        : pending.map(item=>(
          <div key={item.id} style={{ background:"#0e2d3e",border:`1px solid ${item.action==="Delete"?"#7f1d1d22":"#1e3a8a44"}`,borderLeft:`3px solid ${item.action==="Delete"?"#ef4444":"#3b82f6"}`,borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                <span style={{ fontSize:11,padding:"2px 8px",borderRadius:99,background:item.action==="Delete"?"#7f1d1d":"#1e3a8a",color:item.action==="Delete"?"#fca5a5":"#93c5fd",fontWeight:700 }}>{item.action==="Delete"?"🗑️ Delete":"→ Follow Up"}</span>
              </div>
              <div style={{ fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:2 }}>{item.subject}</div>
              {item.next_action && <div style={{ fontSize:12,color:"#7f93a1" }}>→ {item.next_action}</div>}
            </div>
            <div style={{ display:"flex",gap:6,flexShrink:0,marginLeft:12 }}>
              {onLog && <button onClick={()=>onLog(item)} title="Record this email against a company / opportunity / task (the record stays even after the email is deleted)" style={{ padding:"6px 12px",background:"#118fb522",border:"1px solid #118fb5",borderRadius:6,color:"#118fb5",cursor:"pointer",fontSize:11,fontWeight:700 }}>✉️ Log &amp; link</button>}
              <button onClick={()=>onClear(item.id)} style={{ padding:"6px 12px",background:"#10b98122",border:"1px solid #10b981",borderRadius:6,color:"#10b981",cursor:"pointer",fontSize:11,fontWeight:700 }}>✓ Done</button>
            </div>
          </div>
        ))
      }
      {cleared.length>0 && (
        <div style={{ marginTop:24 }}>
          <div style={{ fontSize:11,fontWeight:600,color:"#557080",marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase" }}>Recently Cleared</div>
          {cleared.slice(0,5).map(item=>(
            <div key={item.id} style={{ background:"#0b2735",border:"1px solid #10364a",borderRadius:10,padding:"10px 14px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:0.5 }}>
              <div style={{ fontSize:12,color:"#7f93a1",textDecoration:"line-through" }}>{item.subject}</div>
              <span style={{ fontSize:10,color:"#557080" }}>Cleared</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Projects View ──────────────────────────────────────────
function ProjectsView({ tasks, onTaskClick, onTaskComplete, onNewTask, sortBy }) {
  const [selectedProject, setSelectedProject] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");

  const getProjectTasks = (name) => tasks.filter(t => t.project === name);

  if (selectedProject) {
    const proj = _projectsCache.find(p => p.name === selectedProject);
    const allTasks = getProjectTasks(selectedProject);
    const filtered = statusFilter === "All" ? allTasks : allTasks.filter(t => t.status === statusFilter);
    const sorted = sortTasks(filtered, sortBy);
    const done = allTasks.filter(t => t.status === "Done").length;
    const total = allTasks.length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    const statusCounts = STATUSES.reduce((acc, s) => { acc[s] = allTasks.filter(t => t.status === s).length; return acc; }, {});

    return (
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <button onClick={()=>{ setSelectedProject(null); setStatusFilter("All"); }} style={{ padding:"8px 14px", background:"#0e2d3e", border:"1px solid #1b4a60", borderRadius:8, color:"#9ca3af", cursor:"pointer", fontSize:13 }}>← Back</button>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
              <div style={{ width:12, height:12, borderRadius:"50%", background:proj.color, flexShrink:0 }} />
              <div style={{ fontSize:20, fontWeight:800, color:"#e2e8f0" }}>{proj.name}</div>
            </div>
            <div style={{ fontSize:12, color:"#7f93a1" }}>{allTasks.filter(t=>t.status!=="Done").length} active · {done}/{total} done · {allTasks.filter(isOverdue).length} overdue</div>
          </div>
          <button onClick={()=>onNewTask(selectedProject)} style={{ padding:"8px 14px", background:proj.color, border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700 }}>+ Task</button>
        </div>
        <div style={{ background:"#0e2d3e", border:"1px solid #1b4a60", borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:12, color:"#9ca3af" }}>Progress</span>
            <span style={{ fontSize:13, fontWeight:700, color:proj.color }}>{progress}%</span>
          </div>
          <div style={{ height:8, background:"#1b4a60", borderRadius:99, overflow:"hidden" }}>
            <div style={{ height:"100%", width:progress+"%", background:proj.color, borderRadius:99, transition:"width 0.3s" }} />
          </div>
          <div style={{ display:"flex", gap:12, marginTop:12, flexWrap:"wrap" }}>
            {STATUSES.map(s => statusCounts[s] > 0 && <span key={s} style={{ fontSize:11, color:STATUS_COLOR[s] }}>{STATUS_EMOJI[s]} {statusCounts[s]} {s}</span>)}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {["All", ...STATUSES].map(s => (
            <button key={s} onClick={()=>setStatusFilter(s)} style={{ padding:"6px 12px", borderRadius:99, border:"1px solid "+(statusFilter===s?(s==="All"?"#118fb5":STATUS_COLOR[s]):"#1b4a60"), background:statusFilter===s?(s==="All"?"#118fb533":STATUS_COLOR[s]+"33"):"none", color:statusFilter===s?(s==="All"?"#118fb5":STATUS_COLOR[s]):"#7f93a1", cursor:"pointer", fontSize:12, fontWeight:statusFilter===s?700:400, display:"flex", alignItems:"center", gap:5 }}>
              {s !== "All" && STATUS_EMOJI[s]} {s}
              {(s === "All" ? allTasks.length : statusCounts[s]) > 0 && <span style={{ background:"rgba(255,255,255,0.15)", borderRadius:99, padding:"0 5px", fontSize:10 }}>{s === "All" ? allTasks.length : statusCounts[s]}</span>}
            </button>
          ))}
        </div>
        {sorted.length === 0
          ? <div style={{ textAlign:"center", padding:"40px 0", color:"#557080" }}><div style={{ fontSize:32, marginBottom:8 }}>📋</div><div>No tasks yet — add one to get started</div></div>
          : sorted.map(t => <TaskCard key={t.id} task={t} onClick={onTaskClick} onComplete={onTaskComplete} />)
        }
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:"#7f93a1", letterSpacing:"0.06em", textTransform:"uppercase" }}>📋 Strategic Projects</div>
          <div style={{ fontSize:11, color:"#6a8090", marginTop:2 }}>12 workstreams from the ESBD strategic plan</div>
        </div>
        <div style={{ fontSize:12, color:"#7f93a1" }}>{tasks.filter(t=>t.project&&t.status!=="Done").length} active project tasks</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:14 }}>
        {_projectsCache.map(proj => (
            <div key={proj.name} onClick={()=>setSelectedProject(proj.name)}
              style={{ background:"#0e2d3e", border:"1px solid #1b4a60", borderTop:"3px solid "+proj.color, borderRadius:12, padding:"16px 18px", cursor:"pointer", transition:"transform 0.15s, box-shadow 0.15s" }}
              onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.4)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div style={{ flex:1, minWidth:0, paddingRight:8 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#e2e8f0", marginBottom:4, lineHeight:1.3 }}>{proj.name}</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {getProjectTasks(proj.name).filter(t=>t.status!=="Done").length > 0 && <span style={{ fontSize:11, color:"#9ca3af" }}>{getProjectTasks(proj.name).filter(t=>t.status!=="Done").length} active</span>}
                    {getProjectTasks(proj.name).filter(isOverdue).length > 0 && <span style={{ fontSize:11, color:"#fca5a5" }}>⚠ {getProjectTasks(proj.name).filter(isOverdue).length} overdue</span>}
                    {getProjectTasks(proj.name).filter(t=>t.priority==="Urgent"&&t.status!=="Done").length > 0 && <span style={{ fontSize:11, color:"#f59e0b" }}>🔴 {getProjectTasks(proj.name).filter(t=>t.priority==="Urgent"&&t.status!=="Done").length} urgent</span>}
                    {getProjectTasks(proj.name).length === 0 && <span style={{ fontSize:11, color:"#557080" }}>No tasks yet</span>}
                    {getProjectTasks(proj.name).filter(t=>t.status!=="Done").length === 0 && getProjectTasks(proj.name).length > 0 && <span style={{ fontSize:11, color:"#10b981" }}>✅ Complete</span>}
                  </div>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:proj.color, flexShrink:0 }}>{getProjectTasks(proj.name).length > 0 ? Math.round((getProjectTasks(proj.name).filter(t=>t.status==="Done").length/getProjectTasks(proj.name).length)*100) : 0}%</span>
              </div>
              <div style={{ height:4, background:"#1b4a60", borderRadius:99, overflow:"hidden", marginBottom:8 }}>
                <div style={{ height:"100%", width:(getProjectTasks(proj.name).length > 0 ? Math.round((getProjectTasks(proj.name).filter(t=>t.status==="Done").length/getProjectTasks(proj.name).length)*100) : 0)+"%", background:proj.color, borderRadius:99 }} />
              </div>
              <div style={{ fontSize:10, color:"#6a8090" }}>{getProjectTasks(proj.name).filter(t=>t.status==="Done").length}/{getProjectTasks(proj.name).length} tasks done</div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ============================================================
// ACCOUNTS VIEW — normalised to eliminate duplicates
// ============================================================
function AccountsView({ tasks, onTaskClick, onTaskComplete, sortBy, onNewTask }) {
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [activeStatus, setActiveStatus] = useState("All");

  // Normalise key for comparison
  const normKey = (s) => (s || "").trim().toLowerCase();
  const specialKeys = ["finance", "personal"];

  // Get canonical display name from first task with this normalised key
  const getDisplayName = (key) => {
    const found = tasks.find(t => normKey(t.company) === key && t.company?.trim());
    return found?.company?.trim() || key;
  };

  // Build unique normalised company keys
  const companyKeys = [...new Set(
    tasks.map(t => normKey(t.company)).filter(k => k && !specialKeys.includes(k))
  )].sort();

  const getTasksForAccount = (normalisedKey) => {
    if (normalisedKey === "__uncategorised__") return tasks.filter(t => !t.company?.trim());
    return tasks.filter(t => normKey(t.company) === normalisedKey);
  };

  const allAccounts = [
    ...SPECIAL_ACCOUNTS,
    ...companyKeys.map(k => ({ key: k, label: getDisplayName(k), color: "#118fb5" })),
    { key: "__uncategorised__", label: "Uncategorised", color: "#6a8090" },
  ];

  const filteredAccounts = allAccounts.filter(a =>
    !search.trim() || a.label.toLowerCase().includes(search.toLowerCase())
  );

  const activeCounts = (key) => getTasksForAccount(key).filter(x => x.status !== "Done").length;
  const urgentCounts = (key) => getTasksForAccount(key).filter(x => x.priority === "Urgent" && x.status !== "Done").length;

  // Account detail view
  if (selectedAccount) {
    const accountTasks = getTasksForAccount(selectedAccount.key);
    const statusFilter = activeStatus === "All" ? accountTasks : accountTasks.filter(t => t.status === activeStatus);
    const sorted = sortTasks(statusFilter, sortBy);

    const statusCounts = STATUSES.reduce((acc, s) => {
      acc[s] = accountTasks.filter(t => t.status === s).length;
      return acc;
    }, {});

    return (
      <div>
        {/* Back button + account header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <button onClick={()=>setSelectedAccount(null)} style={{ padding:"8px 14px", background:"#0e2d3e", border:"1px solid #1b4a60", borderRadius:8, color:"#9ca3af", cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
            ← Back
          </button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:20, fontWeight:800, color:"#e2e8f0" }}>{selectedAccount.label}</div>
            <div style={{ fontSize:12, color:"#7f93a1", marginTop:2 }}>{accountTasks.filter(t=>t.status!=="Done").length} active · {accountTasks.filter(isOverdue).length} overdue · {accountTasks.filter(t=>t.status==="Done").length} done</div>
          </div>
          <button onClick={()=>onNewTask(selectedAccount.key === "__uncategorised__" ? "" : selectedAccount.label)} style={{ padding:"8px 14px", background:"#118fb5", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700 }}>
            + Task
          </button>
        </div>

        {/* Status filter pills */}
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {["All", ...STATUSES].map(s => (
            <button key={s} onClick={()=>setActiveStatus(s)} style={{ padding:"6px 12px", borderRadius:99, border:`1px solid ${activeStatus===s?(s==="All"?"#118fb5":STATUS_COLOR[s]):"#1b4a60"}`, background:activeStatus===s?(s==="All"?"#118fb533":STATUS_COLOR[s]+"33"):"none", color:activeStatus===s?(s==="All"?"#118fb5":STATUS_COLOR[s]):"#7f93a1", cursor:"pointer", fontSize:12, fontWeight:activeStatus===s?700:400, display:"flex", alignItems:"center", gap:5 }}>
              {s !== "All" && STATUS_EMOJI[s]} {s}
              {(s==="All"?accountTasks.length:statusCounts[s]) > 0 && <span style={{ background:activeStatus===s?"rgba(255,255,255,0.2)":"#1b4a60", borderRadius:99, padding:"0px 6px", fontSize:10, color:activeStatus===s?"#fff":"#9ca3af" }}>{s==="All"?accountTasks.length:statusCounts[s]}</span>}
            </button>
          ))}
        </div>

        {sorted.length === 0
          ? <div style={{ textAlign:"center", padding:"40px 0", color:"#557080" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
              <div>No tasks {activeStatus !== "All" ? `with status "${activeStatus}"` : ""} for this account</div>
            </div>
          : sorted.map(t => <TaskCard key={t.id} task={t} onClick={onTaskClick} onComplete={onTaskComplete} />)
        }
      </div>
    );
  }

  // Account list view
  return (
    <div>
      <div style={{ marginBottom:16 }}>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#6a8090", fontSize:14 }}>🔍</span>
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Search accounts..."
            style={{ ...inp, paddingLeft:36, background:"#0e2d3e" }}
          />
          {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#7f93a1", cursor:"pointer", fontSize:16 }}>✕</button>}
        </div>
      </div>

      <div style={{ fontSize:11, fontWeight:700, color:"#7f93a1", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>
        {filteredAccounts.length} Accounts
      </div>

      {filteredAccounts.filter(account => getTasksForAccount(account.key).length > 0 || specialKeys.includes(account.key)).map(account => (
          <div key={account.key} onClick={()=>setSelectedAccount(account)}
            style={{ background:"#0e2d3e", border:"1px solid #1b4a60", borderLeft:`3px solid ${account.color}`, borderRadius:12, padding:"14px 16px", marginBottom:10, cursor:"pointer", transition:"transform 0.15s, box-shadow 0.15s" }}
            onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.4)"; }}
            onMouseLeave={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:700, color:"#e2e8f0", marginBottom:4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{account.label}</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {activeCounts(account.key) > 0 && <span style={{ fontSize:11, color:"#9ca3af" }}>{activeCounts(account.key)} active</span>}
                  {urgentCounts(account.key) > 0 && <span style={{ fontSize:11, background:"#7f1d1d", color:"#fca5a5", borderRadius:99, padding:"1px 7px", fontWeight:700 }}>🔴 {urgentCounts(account.key)} urgent</span>}
                  {activeCounts(account.key) === 0 && getTasksForAccount(account.key).length > 0 && <span style={{ fontSize:11, color:"#10b981" }}>✅ All done</span>}
                  {getTasksForAccount(account.key).length === 0 && <span style={{ fontSize:11, color:"#557080" }}>No tasks yet</span>}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                {/* Mini status dots */}
                <div style={{ display:"flex", gap:4 }}>
                  {STATUSES.filter(s=>s!=="Done").filter(s=>getTasksForAccount(account.key).filter(t=>t.status===s).length>0).map(s => (
                    <div key={s} style={{ width:8, height:8, borderRadius:"50%", background:STATUS_COLOR[s] }} title={s} />
                  ))}
                </div>
                <span style={{ color:"#6a8090", fontSize:18 }}>→</span>
              </div>
            </div>
          </div>
      ))}
    </div>
  );
}

export default function App() {
  const { name: me, signOut } = useHubUser();
  const [tasks, setTasks] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [modalOpp, setModalOpp] = useState(null);
  const [commDraft, setCommDraft] = useState(null);
  const [followView, setFollowView] = useState("today");
  const [appError, setAppError] = useState(null);
  const [leads, setLeads] = useState([]);
  const [seanWeek, setSeanWeek] = useState([]);
  const [inboxTriage, setInboxTriage] = useState([]);
  const [flags, setFlags] = useState([]);
  const [projects, setProjects] = useState(STRATEGIC_PROJECTS_FALLBACK);
  const [reminders, setReminders] = useState([]);
  const [view, setView] = useState("dashboard");
  const [modalTask, setModalTask] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("duedate");
  const [status, setStatus] = useState("Connecting…");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [seenTaskIds, setSeenTaskIds] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("seenTaskIds")||"[]"); } catch { return []; }
  });

  const loadTasks = useCallback(async () => {
    // Archived tasks stay in the database (with history) but leave the working lists.
    const { data, error } = await supabase.from("tasks").select("*").is("archived_at", null).order("created_at", { ascending: false });
    if (!error) { setTasks(data||[]); setStatus("Live"); }
    else { console.error(error); setStatus("Error"); setAppError("Couldn't load tasks: " + friendlyError(error)); }
  }, []);

  const loadLeads = useCallback(async () => {
    const { data, error } = await supabase.from("leads").select("*").is("archived_at", null).order("updated_at", { ascending: false });
    if (data) setLeads(data);
    if (error) setAppError("Couldn't load opportunities: " + friendlyError(error));
  }, []);

  const loadSeanWeek = useCallback(async () => {
    const { data } = await supabase.from("sean_week").select("*").order("date_needed", { ascending: true });
    if (data) setSeanWeek(data);
  }, []);

  const loadInboxTriage = useCallback(async () => {
    const { data } = await supabase.from("inbox_triage").select("*").order("created_at", { ascending: false });
    if (data) setInboxTriage(data);
  }, []);

  const loadFlags = useCallback(async () => {
    const { data } = await supabase.from("flags").select("*").order("created_at", { ascending: false });
    if (data) setFlags(data);
  }, []);

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").order("name", { ascending: true });
    if (data && data.length > 0) { setProjects(data); _projectsCache = data; }
  }, []);

  const loadCrm = useCallback(async () => {
    const [c, p, o] = await Promise.all([loadCompanies(), loadContacts(), loadOrders()]);
    if (c.data) setCompanies(c.data);
    if (p.data) setContacts(p.data);
    if (o.data) setOrders(o.data);
    const e = c.error || p.error || o.error;
    if (e) setAppError("Couldn't load companies/orders: " + e);
  }, []);

  const loadReminders = useCallback(async () => {
    const { data } = await supabase.from("reminders").select("*").eq("completed", false).order("remind_date", { ascending: true });
    if (data) setReminders(data);
  }, []);

  useEffect(() => {
    loadTasks(); loadLeads(); loadSeanWeek(); loadInboxTriage(); loadFlags(); loadProjects(); loadReminders(); loadCrm();
    const taskCh = supabase.channel("tasks-ch").on("postgres_changes",{event:"*",schema:"public",table:"tasks"},loadTasks).subscribe();
    const leadCh = supabase.channel("leads-ch").on("postgres_changes",{event:"*",schema:"public",table:"leads"},loadLeads).subscribe();
    const weekCh = supabase.channel("week-ch").on("postgres_changes",{event:"*",schema:"public",table:"sean_week"},loadSeanWeek).subscribe();
    const inboxCh = supabase.channel("inbox-ch").on("postgres_changes",{event:"*",schema:"public",table:"inbox_triage"},loadInboxTriage).subscribe();
    const flagsCh = supabase.channel("flags-ch").on("postgres_changes",{event:"*",schema:"public",table:"flags"},loadFlags).subscribe();
    const projCh = supabase.channel("projects-ch").on("postgres_changes",{event:"*",schema:"public",table:"projects"},loadProjects).subscribe();
    const remCh = supabase.channel("reminders-ch").on("postgres_changes",{event:"*",schema:"public",table:"reminders"},loadReminders).subscribe();
    const crmCh = supabase.channel("crm-ch")
      .on("postgres_changes",{event:"*",schema:"public",table:"companies"},loadCrm)
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},loadCrm)
      .subscribe();
    const interval = setInterval(() => { loadTasks(); loadLeads(); loadSeanWeek(); loadInboxTriage(); loadFlags(); loadReminders(); }, 30000);
    return () => { supabase.removeChannel(taskCh); supabase.removeChannel(leadCh); supabase.removeChannel(weekCh); supabase.removeChannel(inboxCh); supabase.removeChannel(flagsCh); supabase.removeChannel(projCh); supabase.removeChannel(remCh); supabase.removeChannel(crmCh); clearInterval(interval); };
  }, [loadTasks, loadLeads, loadSeanWeek, loadInboxTriage, loadFlags, loadProjects, loadReminders, loadCrm]);
  const reloadAll = () => { loadTasks(); loadLeads(); loadCrm(); };

  const upsertTask = async (form) => {
    const original = form.id ? tasks.find(t => t.id === form.id) : null;
    const payload = { ...form, client: normaliseName(form.client), company: normaliseName(form.company), project: form.project || null,
      actual_date: form.action_state === "Completed" ? (form.actual_date || TODAY()) : (form.actual_date || null) };
    const { error } = await saveTaskRecord(payload, me);
    if (error) return error;
    if (original) {
      const newStatus = stateToStatus(form.action_state, form.status);
      if (original.status !== newStatus || stateOf(original) !== form.action_state) {
        await supabase.from("task_history").insert([{ task_id:form.id, changed_by:me, entry_type:"status_change", old_status:stateOf(original), new_status:form.action_state, note:null }]);
      }
      // Notes preservation — the previous note goes into the activity feed before being replaced
      if (original.notes !== form.notes) {
        if (original.notes && original.notes.trim()) {
          await supabase.from("task_history").insert([{ task_id:form.id, changed_by:me, entry_type:"note", old_status:null, new_status:null, note:"[Previous note] " + original.notes.trim() }]);
        }
        if (form.notes && form.notes.trim()) {
          await supabase.from("task_history").insert([{ task_id:form.id, changed_by:me, entry_type:"note", old_status:null, new_status:null, note:form.notes.trim() }]);
        }
      }
    }
    loadTasks();
    return null;
  };

  const addSeanWeekItem = async (form) => { await supabase.from("sean_week").insert([form]); };
  const deleteSeanWeekItem = async (id) => { await supabase.from("sean_week").delete().eq("id",id); };
  const addInboxItem = async (form) => {
    const { error } = await supabase.from("inbox_triage").insert([form]);
    if (error) setAppError("Couldn't flag the email: " + friendlyError(error)); else loadInboxTriage();
  };
  const clearInboxItem = async (id) => {
    const { error } = await supabase.from("inbox_triage").update({ cleared:true, cleared_at:new Date().toISOString() }).eq("id",id);
    if (error) setAppError("Couldn't clear the item: " + friendlyError(error)); else loadInboxTriage();
  };
  // Records are archived, never deleted: history, links and follow-ups are kept and can be restored.
  const archiveTask = async (id) => { const { error } = await archiveRecord("tasks", id, me); if (error) setAppError(error); else loadTasks(); };
  const markFlagSeen = async (id) => { await supabase.from("flags").update({seen:true}).eq("id",id); loadFlags(); };
  const markAllFlagsSeen = async () => {
    const unseen = flags.filter(f=>!f.seen && f.task_subject !== "Weekly Customer Report");
    for (const f of unseen) { await supabase.from("flags").update({seen:true}).eq("id",f.id); }
    loadFlags();
  };

  const deleteFlag = async (id) => { await supabase.from("flags").delete().eq("id",id); loadFlags(); };

  const moveTask = async (id, newStatus) => {
    const original = tasks.find(t => t.id === parseInt(id));
    const extra = newStatus==="Done"?{actual_date:TODAY()}:{};
    const { error } = await supabase.from("tasks").update({status:newStatus,...extra,updated_by:me}).eq("id",id);
    if (error) { setAppError(friendlyError(error)); return; }
    if (original && original.status !== newStatus) {
      await supabase.from("task_history").insert([{ task_id:parseInt(id), changed_by:me, entry_type:"status_change", old_status:original.status, new_status:newStatus, note:null }]);
    }
  };

  const markAllSeen = () => {
    const allIds = [...seenTaskIds, ...newTasks.map(t=>t.id)];
    setSeenTaskIds(allIds);
    sessionStorage.setItem("seenTaskIds", JSON.stringify(allIds));
    setShowNotifications(false);
  };

  const q = search.toLowerCase();
  const filtered = tasks.filter(t=>!q||[t.subject,t.client,t.company,t.owner,t.status,t.next_action].some(f=>(f||"").toLowerCase().includes(q)));
  const byStatus = (s) => sortTasks(filtered.filter(t=>t.status===s), sortBy);
  const overdue = sortTasks(filtered.filter(isOverdue), sortBy);
  const myTasks = sortTasks(filtered.filter(t=>t.owner===me), sortBy);
  const seanTasks = sortTasks(filtered.filter(t=>t.owner==="Sean"), sortBy);
  const jasonTasks = tasks.filter(t=>t.owner==="Jason");
  const andreaTasks = tasks.filter(t=>t.owner==="Andrea");
  const newTasks = tasks.filter(t=>t.date_received===TODAY()&&!seenTaskIds.includes(t.id));
  const pendingInbox = inboxTriage.filter(i=>!i.cleared);
  const fyiTasks = sortTasks(filtered.filter(t=>t.status==="FYI"), sortBy);
  const unseenFlags = flags.filter(f=>!f.seen && f.task_subject !== "Weekly Customer Report");
  const weeklyReports = flags.filter(f=>f.task_subject === "Weekly Customer Report");
  const unreadReports = weeklyReports.filter(f=>!f.seen);
  const totalAccounts = [...new Set(tasks.map(t=>t.company?.trim().toLowerCase()).filter(Boolean))].length;

  // ── Due Today & This Week ────────────────────────────────
  const todayStr = TODAY();
  const dueToday = sortTasks(tasks.filter(t => t.status !== "Done" && t.expected_date === todayStr), sortBy);
  const activeProjectTasks = tasks.filter(t=>t.project&&t.status!=="Done").length;

  // ── Follow-up & Reminder Notifications ──────────────────
  const followUpTasksToday = tasks.filter(t => t.status !== "Done" && t.follow_up_date === todayStr);
  const followUpTasksOverdue = tasks.filter(t => t.status !== "Done" && t.follow_up_date && t.follow_up_date < todayStr);
  const remindersToday = reminders.filter(r => !r.completed && r.remind_date === todayStr);
  const remindersOverdue = reminders.filter(r => !r.completed && r.remind_date < todayStr);
  const todayAlertCount = followUpTasksToday.length + followUpTasksOverdue.length + remindersToday.length + remindersOverdue.length + dueToday.length;

  const VIEWS = [
    { id:"dashboard", label:"Dashboard", icon:"⬡" },
    // "Today" = overdue + due today: tasks, scheduled follow-ups and opportunity follow-ups (same rule as the Today tab).
    { id:"followups", label:"Today", icon:"⏱", count: tasks.filter(t=>isDueNowTask(t)).length + leads.filter(l=>isDueNowLead(l)).length },
    { id:"pipeline", label:"Sales Pipeline", icon:"🎯", count: leads.length },
    { id:"companies", label:"Companies", icon:"🏢", count: companies.length },
    { id:"orders", label:"Orders", icon:"📦", count: orders.filter(o=>!o.actual_date).length },
    { id:"search", label:"Search", icon:"🔍" },
    { id:"quality", label:"Data Quality", icon:"🧹" },
    { id:"today", label:"Reminders", icon:"🔔", count: todayAlertCount },
    { id:"projects", label:"Projects", icon:"📋", count: activeProjectTasks },
    { id:"accounts", label:"Accounts (by task text)", icon:"🗂", count: totalAccounts },
    { id:"todo", label:"To Do", icon:"🔴", count:byStatus("To Do").length, group:"tasks" },
    { id:"fya", label:"FYA", icon:"🟠", count:byStatus("FYA").length, group:"tasks" },
    { id:"followup", label:"Follow Up", icon:"🏌️", count:byStatus("Follow Up").length, group:"tasks" },
    { id:"fyi", label:"FYI", icon:"🟣", count:byStatus("FYI").length, group:"tasks" },
    { id:"done", label:"Done", icon:"✅", count:byStatus("Done").length, group:"tasks" },
    { id:"overdue", label:"Overdue", icon:"⚠", count:overdue.length, group:"tasks" },
    { id:"mine", label:"My Tasks", icon:"◉", count:myTasks.length, group:"tasks" },
    { id:"sean", label:"Sean's Tasks", icon:"◈", count:seanTasks.length, group:"tasks" },
    { id:"flags", label:"Flags", icon:"🚨", count:unseenFlags.length },
    { id:"seanweek", label:"Sean's Week", icon:"📅", count:seanWeek.length },
    { id:"inbox", label:"Inbox Triage", icon:"🗑️", count:pendingInbox.length },
    { id:"team", label:"Delegated", icon:"👥" },
    { id:"all", label:"All Tasks", icon:"≡", group:"tasks" },
  ];

  const viewTasks = { todo:byStatus("To Do"), fya:byStatus("FYA"), followup:byStatus("Follow Up"), fyi:fyiTasks, done:byStatus("Done"), overdue, mine:myTasks, sean:seanTasks, all:sortTasks(filtered, sortBy) };

  const [tasksExpanded, setTasksExpanded] = useState(false);

  const Sidebar = (
    <div style={{ width:220,background:"#08202c",borderRight:"1px solid #10364a",padding:"24px 12px",display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ padding:"0 8px 24px",borderBottom:"1px solid #10364a" }}>
        <img src="https://esbd.co.za/wp-content/uploads/2024/07/4.png" alt="ESBD" style={{ width:120,marginBottom:6 }} />
        <div style={{ fontSize:11,color:"#6a8090",marginTop:2 }}>Operations Tracker</div>
      </div>
      <div style={{ marginTop:16,flex:1,overflowY:"auto" }}>
        {VIEWS.filter(v => !v.group).map(v=>(
          <button key={v.id} onClick={()=>{ setView(v.id); setSidebarOpen(false); }}
            style={{ width:"100%",textAlign:"left",padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",background:view===v.id?"#123a4f":"none",color:view===v.id?"#118fb5":"#7f93a1",display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:view===v.id?600:400,marginBottom:2 }}>
            <span style={{ fontSize:14,width:16,textAlign:"center" }}>{v.icon}</span>
            <span style={{ flex:1 }}>{v.label}</span>
            {v.count!==undefined&&v.count>0&&<span style={{ background:v.id==="today"?"#7f1d1d":v.id==="overdue"?"#7f1d1d":v.id==="leads"?"#1e3a8a":v.id==="inbox"?"#7f1d1d":v.id==="flags"?"#7f1d1d":v.id==="projects"?"#d97706":v.id==="accounts"?"#118fb533":"#1b4a60",color:v.id==="today"?"#fca5a5":v.id==="overdue"?"#fca5a5":v.id==="leads"?"#93c5fd":v.id==="inbox"?"#fca5a5":v.id==="flags"?"#fca5a5":v.id==="projects"?"#fff":v.id==="accounts"?"#118fb5":"#9ca3af",borderRadius:99,padding:"1px 7px",fontSize:11,fontWeight:v.id==="today"?700:400 }}>{v.count}</span>}
          </button>
        ))}
        {/* Tasks collapsible group */}
        <button onClick={()=>setTasksExpanded(e=>!e)}
          style={{ width:"100%",textAlign:"left",padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",background:VIEWS.filter(v=>v.group==="tasks").some(v=>v.id===view)?"#123a4f":"none",color:VIEWS.filter(v=>v.group==="tasks").some(v=>v.id===view)?"#118fb5":"#7f93a1",display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:400,marginBottom:2 }}>
          <span style={{ fontSize:14,width:16,textAlign:"center" }}>☰</span>
          <span style={{ flex:1 }}>Tasks</span>
          <span style={{ fontSize:10,color:"#6a8090" }}>{tasksExpanded ? "▲" : "▼"}</span>
        </button>
        {tasksExpanded && (
          <div style={{ marginLeft:12, borderLeft:"1px solid #1b4a60", paddingLeft:8, marginBottom:4 }}>
            {VIEWS.filter(v=>v.group==="tasks").map(v=>(
              <button key={v.id} onClick={()=>{ setView(v.id); setSidebarOpen(false); }}
                style={{ width:"100%",textAlign:"left",padding:"7px 10px",borderRadius:8,border:"none",cursor:"pointer",background:view===v.id?"#123a4f":"none",color:view===v.id?"#118fb5":"#7f93a1",display:"flex",alignItems:"center",gap:10,fontSize:12,fontWeight:view===v.id?600:400,marginBottom:1 }}>
                <span style={{ fontSize:13,width:14,textAlign:"center" }}>{v.icon}</span>
                <span style={{ flex:1 }}>{v.label}</span>
                {v.count!==undefined&&v.count>0&&<span style={{ background:v.id==="overdue"?"#7f1d1d":"#1b4a60",color:v.id==="overdue"?"#fca5a5":"#9ca3af",borderRadius:99,padding:"1px 6px",fontSize:10 }}>{v.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ paddingTop:16,borderTop:"1px solid #10364a" }}>
        <div style={{ fontSize:10,color:"#557080",textAlign:"center",marginBottom:8 }}>
          <span style={{ display:"inline-block",width:6,height:6,borderRadius:"50%",background:status==="Live"?"#10b981":status==="Connecting…"?"#f59e0b":"#ef4444",marginRight:6,verticalAlign:"middle" }} />{status}
        </div>
        {signOut && <div style={{ fontSize:11,color:"#7f93a1",textAlign:"center",marginBottom:8 }}>Signed in as {me} · <button onClick={signOut} style={{ background:"none",border:"none",color:"#118fb5",cursor:"pointer",fontSize:11 }}>Sign out</button></div>}
        <button onClick={()=>setCommDraft({})} style={{ width:"100%",padding:"8px",background:"#10364a",border:"1px solid #10b981",borderRadius:8,color:"#10b981",cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:8 }}>✉️ Log Communication</button>
        <button onClick={()=>setShowNotes(!showNotes)} style={{ width:"100%",padding:"8px",background:"#10364a",border:"1px solid #1e3a8a",borderRadius:8,color:"#60a5fa",cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:8 }}>📝 Quick Notes</button>
        <button onClick={()=>setShowSummary(true)} style={{ width:"100%",padding:"8px",background:"#10364a",border:"1px solid #1b4a60",borderRadius:8,color:"#118fb5",cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:8 }}>📋 Daily Summary</button>
        <button onClick={()=>setModalTask({})} style={{ width:"100%",padding:"10px",background:"#118fb5",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700 }}>+ New Task</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh",background:"#0a2432",color:"#e2e8f0",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column" }}>
      <style>{`*{box-sizing:border-box;} ::-webkit-scrollbar{width:5px;} ::-webkit-scrollbar-track{background:#0a2432;} ::-webkit-scrollbar-thumb{background:#1b4a60;border-radius:3px;} select option{background:#10364a;}`}</style>

      <div style={{ display:"flex",alignItems:"center",padding:"14px 16px",borderBottom:"1px solid #10364a",background:"#08202c",gap:12 }}>
        <button onClick={()=>setSidebarOpen(true)} style={{ background:"none",border:"1px solid #1b4a60",borderRadius:7,color:"#7f93a1",cursor:"pointer",padding:"6px 10px",fontSize:16 }}>☰</button>
        <span style={{ fontSize:16,fontWeight:800,color:"#e2e8f0",flex:1 }}>{VIEWS.find(v=>v.id===view)?.label}</span>
        <button onClick={()=>setShowNotes(!showNotes)} style={{ padding:"7px 12px",background:"none",border:"1px solid #1e3a8a",borderRadius:7,color:"#60a5fa",cursor:"pointer",fontSize:12,fontWeight:600 }}>📝</button>
        <button onClick={()=>setShowSummary(true)} style={{ padding:"7px 12px",background:"none",border:"1px solid #1b4a60",borderRadius:7,color:"#118fb5",cursor:"pointer",fontSize:12,fontWeight:600 }}>📋</button>
        <div style={{ position:"relative" }}>
          <button onClick={()=>setShowNotifications(!showNotifications)} style={{ background:"none",border:"1px solid #1b4a60",borderRadius:7,color:"#7f93a1",cursor:"pointer",padding:"7px 10px",fontSize:16,position:"relative" }}>
            🔔
            {newTasks.length>0 && <span style={{ position:"absolute",top:-6,right:-6,background:"#ef4444",color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center" }}>{newTasks.length}</span>}
          </button>
          {showNotifications && (
            <div style={{ position:"absolute",top:42,right:0,width:300,background:"#0b2735",border:"1px solid #1b4a60",borderRadius:12,zIndex:800,boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
              <div style={{ padding:"10px 14px",borderBottom:"1px solid #1b4a60",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span style={{ fontSize:13,fontWeight:700,color:"#e2e8f0" }}>🔔 New Today</span>
                <button onClick={markAllSeen} style={{ background:"none",border:"none",color:"#118fb5",cursor:"pointer",fontSize:11 }}>Mark all seen</button>
              </div>
              <div style={{ maxHeight:280,overflowY:"auto" }}>
                {newTasks.length===0
                  ? <div style={{ padding:16,fontSize:12,color:"#7f93a1",textAlign:"center" }}>No new tasks today</div>
                  : newTasks.map(t=>(
                    <div key={t.id} onClick={()=>{ setModalTask(t); setShowNotifications(false); }} style={{ padding:"10px 14px",borderBottom:"1px solid #10364a",cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start" }}
                      onMouseEnter={(e)=>e.currentTarget.style.background="#0e2d3e"}
                      onMouseLeave={(e)=>e.currentTarget.style.background="none"}>
                      <div style={{ width:8,height:8,borderRadius:"50%",background:STATUS_COLOR[t.status],marginTop:4,flexShrink:0 }} />
                      <div>
                        <div style={{ fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:2 }}>{t.subject}</div>
                        <div style={{ fontSize:11,color:"#7f93a1" }}>{t.owner} · {t.status}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>
        {unseenFlags.length > 0 && (
          <button onClick={()=>setView("flags")} style={{ position:"relative",padding:"7px 12px",background:"#7f1d1d33",border:"1px solid #ef4444",borderRadius:7,color:"#ef4444",cursor:"pointer",fontSize:12,fontWeight:700 }}>
            🚨 {unseenFlags.length}
          </button>
        )}
        {unreadReports.length > 0 && (
          <button onClick={()=>setView("flags")} style={{ padding:"7px 12px",background:"#1e3a8a33",border:"1px solid #3b82f6",borderRadius:7,color:"#60a5fa",cursor:"pointer",fontSize:12,fontWeight:700 }}>
            📊 {unreadReports.length}
          </button>
        )}
        <button onClick={()=>setModalTask({})} style={{ padding:"7px 14px",background:"#118fb5",border:"none",borderRadius:7,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700 }}>+ New</button>
      </div>

      <div style={{ flex:1,display:"flex",overflow:"hidden" }}>
        <div style={{ display:"flex",flexDirection:"column" }}>{Sidebar}</div>
        {sidebarOpen && (
          <div style={{ position:"fixed",inset:0,zIndex:500,display:"flex" }} onClick={()=>setSidebarOpen(false)}>
            <div style={{ width:240,height:"100%",background:"#08202c" }} onClick={e=>e.stopPropagation()}>{Sidebar}</div>
            <div style={{ flex:1,background:"rgba(0,0,0,0.5)" }} />
          </div>
        )}
        <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
          <div style={{ padding:"14px 20px",borderBottom:"1px solid #10364a",background:"#08202c",display:"flex",alignItems:"center",gap:12 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ ...inp,maxWidth:280,padding:"8px 14px" }} />
            <div style={{ display:"flex",gap:6,marginLeft:"auto" }}>
              {[{id:"urgency",label:"🔥 Urgency"},{id:"duedate",label:"📅 Due Date"},{id:"recent",label:"🕐 Recent"}].map(s=>(
                <button key={s.id} onClick={()=>setSortBy(s.id)} style={{ padding:"7px 12px",background:sortBy===s.id?"#118fb522":"none",border:`1px solid ${sortBy===s.id?"#118fb5":"#1b4a60"}`,borderRadius:7,color:sortBy===s.id?"#118fb5":"#7f93a1",cursor:"pointer",fontSize:12,fontWeight:sortBy===s.id?700:400,whiteSpace:"nowrap" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex:1,overflowY:"auto",padding:28 }}>

            {view==="today" && (
              <div>
                <div style={{ marginBottom:24 }}>
                  <h1 style={{ margin:0,fontSize:24,fontWeight:800,color:"#e2e8f0" }}>🔔 Reminders</h1>
                  <div style={{ fontSize:13,color:"#7f93a1",marginTop:4 }}>{new Date().toLocaleDateString("en-ZA",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
                </div>

                {todayAlertCount === 0 && (
                  <div style={{ textAlign:"center",padding:"60px 0",color:"#557080" }}>
                    <div style={{ fontSize:48,marginBottom:16 }}>✅</div>
                    <div style={{ fontSize:18,fontWeight:700,color:"#e2e8f0" }}>All clear!</div>
                    <div style={{ fontSize:14,color:"#7f93a1",marginTop:8 }}>Nothing due or overdue today.</div>
                  </div>
                )}

                {(remindersOverdue.length > 0 || remindersToday.length > 0) && (
                  <div style={{ marginBottom:24 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:"#ef4444",marginBottom:12,textTransform:"uppercase",letterSpacing:1 }}>
                      📅 Reminders {remindersOverdue.length > 0 ? `(${remindersOverdue.length} overdue)` : ""}
                    </div>
                    {[...remindersOverdue, ...remindersToday].map(r => (
                      <div key={r.id} style={{ background:r.remind_date < todayStr ? "#7f1d1d22" : "#0c1a0c", border:`1px solid ${r.remind_date < todayStr ? "#ef444466" : "#10b98166"}`, borderRadius:10, padding:"14px 16px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14,fontWeight:700,color:"#e2e8f0",marginBottom:4 }}>{r.title}</div>
                          {r.description && <div style={{ fontSize:12,color:"#9ca3af" }}>{r.description}</div>}
                          <div style={{ display:"flex",gap:8,marginTop:8,flexWrap:"wrap" }}>
                            <span style={{ fontSize:11,background:"#1b4a60",borderRadius:99,padding:"2px 8px",color:"#9ca3af" }}>👤 {r.owner}</span>
                            <span style={{ fontSize:11,background:"#1b4a60",borderRadius:99,padding:"2px 8px",color:"#9ca3af" }}>🏷 {r.category}</span>
                            <span style={{ fontSize:11,borderRadius:99,padding:"2px 8px",background:r.remind_date < todayStr?"#7f1d1d":"#14532d",color:r.remind_date < todayStr?"#fca5a5":"#86efac",fontWeight:700 }}>
                              {r.remind_date < todayStr ? "⚠ Overdue" : "📅 Today"}
                            </span>
                          </div>
                        </div>
                        <button onClick={async () => { await supabase.from("reminders").update({completed:true}).eq("id",r.id); loadReminders(); }}
                          style={{ background:"#10b981",border:"none",borderRadius:8,color:"#fff",padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700,flexShrink:0 }}>
                          ✓ Done
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {(followUpTasksOverdue.length > 0 || followUpTasksToday.length > 0) && (
                  <div style={{ marginBottom:24 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:"#f59e0b",marginBottom:12,textTransform:"uppercase",letterSpacing:1 }}>
                      🔔 Task Follow-ups {followUpTasksOverdue.length > 0 ? `(${followUpTasksOverdue.length} overdue)` : ""}
                    </div>
                    {[...followUpTasksOverdue,...followUpTasksToday].map(t => (
                      <div key={t.id} onClick={() => setModalTask(t)}
                        style={{ background:t.follow_up_date < todayStr?"#7f1d1d22":"#0e2d3e", border:`1px solid ${t.follow_up_date < todayStr?"#ef444466":"#f59e0b66"}`, borderRadius:10, padding:"14px 16px", marginBottom:10, cursor:"pointer" }}
                        onMouseEnter={e=>e.currentTarget.style.background=t.follow_up_date<todayStr?"#7f1d1d33":"#1b4a60"}
                        onMouseLeave={e=>e.currentTarget.style.background=t.follow_up_date<todayStr?"#7f1d1d22":"#0e2d3e"}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:14,fontWeight:700,color:"#e2e8f0",marginBottom:4 }}>{t.subject}</div>
                            {t.follow_up_note && <div style={{ fontSize:12,color:"#f59e0b",marginBottom:6,fontStyle:"italic" }}>💬 {t.follow_up_note}</div>}
                            {t.next_action && <div style={{ fontSize:12,color:"#9ca3af" }}>→ {t.next_action}</div>}
                            <div style={{ display:"flex",gap:8,marginTop:8,flexWrap:"wrap" }}>
                              <span style={{ fontSize:11,background:"#1b4a60",borderRadius:99,padding:"2px 8px",color:"#9ca3af" }}>👤 {t.owner}</span>
                              {t.client && <span style={{ fontSize:11,background:"#1b4a60",borderRadius:99,padding:"2px 8px",color:"#9ca3af" }}>{t.client}</span>}
                              {t.company && <span style={{ fontSize:11,background:"#1b4a60",borderRadius:99,padding:"2px 8px",color:"#9ca3af" }}>{t.company}</span>}
                            </div>
                          </div>
                          <span style={{ fontSize:11,borderRadius:99,padding:"2px 8px",background:t.follow_up_date<todayStr?"#7f1d1d":"#78350f",color:t.follow_up_date<todayStr?"#fca5a5":"#fde68a",fontWeight:700,flexShrink:0,marginLeft:8 }}>
                            {t.follow_up_date < todayStr ? "⚠ Overdue" : "🔔 Today"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {dueToday.length > 0 && (
                  <div style={{ marginBottom:24 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:"#118fb5",marginBottom:12,textTransform:"uppercase",letterSpacing:1 }}>
                      📋 Tasks Due Today ({dueToday.length})
                    </div>
                    {dueToday.map(t => (
                      <div key={t.id} onClick={() => setModalTask(t)}
                        style={{ background:"#0e2d3e",border:"1px solid #118fb566",borderRadius:10,padding:"14px 16px",marginBottom:10,cursor:"pointer" }}
                        onMouseEnter={e=>e.currentTarget.style.background="#1b4a60"}
                        onMouseLeave={e=>e.currentTarget.style.background="#0e2d3e"}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:14,fontWeight:700,color:"#e2e8f0",marginBottom:4 }}>{t.subject}</div>
                            {t.next_action && <div style={{ fontSize:12,color:"#9ca3af" }}>→ {t.next_action}</div>}
                            <div style={{ display:"flex",gap:8,marginTop:8,flexWrap:"wrap" }}>
                              <span style={{ fontSize:11,background:"#1b4a60",borderRadius:99,padding:"2px 8px",color:"#9ca3af" }}>👤 {t.owner}</span>
                              {t.client && <span style={{ fontSize:11,background:"#1b4a60",borderRadius:99,padding:"2px 8px",color:"#9ca3af" }}>{t.client}</span>}
                              <span style={{ fontSize:11,borderRadius:99,padding:"2px 8px",background:STATUS_COLOR[t.status]+"33",color:STATUS_COLOR[t.status],fontWeight:600 }}>{t.status}</span>
                            </div>
                          </div>
                          <span style={{ fontSize:11,background:PRIORITY_COLOR[t.priority]+"33",color:PRIORITY_COLOR[t.priority],borderRadius:99,padding:"2px 8px",fontWeight:700,flexShrink:0,marginLeft:8 }}>{t.priority}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view==="dashboard" && (
              <div>
                {unseenFlags.length > 0 && (
                  <div onClick={()=>setView("flags")} style={{ marginBottom:16,background:"#7f1d1d22",border:"1px solid #ef444466",borderRadius:12,padding:"14px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:12 }}>
                    <span style={{ fontSize:24 }}>🚨</span>
                    <div>
                      <div style={{ fontSize:14,fontWeight:700,color:"#ef4444" }}>{unseenFlags.length} new flag{unseenFlags.length>1?"s":""} from your team</div>
                      <div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>{unseenFlags.map(f=>f.from_name).filter((v,i,a)=>a.indexOf(v)===i).join(" & ")} flagged Sean — click to view</div>
                    </div>
                    <span style={{ marginLeft:"auto",color:"#ef4444",fontSize:18 }}>→</span>
                  </div>
                )}
                {unreadReports.length > 0 && (
                  <div onClick={()=>setView("flags")} style={{ marginBottom:20,background:"#1e3a8a22",border:"1px solid #3b82f666",borderRadius:12,padding:"14px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:12 }}>
                    <span style={{ fontSize:24 }}>📊</span>
                    <div>
                      <div style={{ fontSize:14,fontWeight:700,color:"#60a5fa" }}>{unreadReports.length} new weekly report{unreadReports.length>1?"s":""}</div>
                      <div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>from {unreadReports.map(f=>f.from_name).filter((v,i,a)=>a.indexOf(v)===i).join(" & ")} — click to view</div>
                    </div>
                    <span style={{ marginLeft:"auto",color:"#60a5fa",fontSize:18 }}>→</span>
                  </div>
                )}
                {activeProjectTasks > 0 && (
                  <div onClick={()=>setView("projects")} style={{ marginBottom:20,background:"#d9780622",border:"1px solid #d9780666",borderRadius:12,padding:"14px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:12 }}>
                    <span style={{ fontSize:24 }}>📋</span>
                    <div>
                      <div style={{ fontSize:14,fontWeight:700,color:"#d97806" }}>{activeProjectTasks} active strategic project tasks</div>
                      <div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>{projects.filter(p=>tasks.some(t=>t.project===p.name&&t.status!=="Done")).length} of {projects.length} workstreams in progress — click to view</div>
                    </div>
                    <span style={{ marginLeft:"auto",color:"#d97806",fontSize:18 }}>→</span>
                  </div>
                )}

                <HubDashboard tasks={tasks} opportunities={leads} companies={companies} orders={orders}
                  go={(v, sub)=>{ if (sub) setFollowView(sub); setView(v); }}
                  openTask={t=>setModalTask(t)} openOpp={o=>setModalOpp(o)} openOrder={()=>setView("orders")} />
              </div>
            )}

            {view==="projects" && (
              <ProjectsView
                tasks={tasks}
                onTaskClick={t=>setModalTask(t)}
                onTaskComplete={(id)=>moveTask(id,"Done")}
                onNewTask={(project)=>setModalTask(newTask({ project }))}
                sortBy={sortBy}
              />
            )}

            {view==="accounts" && (
              <AccountsView
                tasks={tasks}
                onTaskClick={t=>setModalTask(t)}
                onTaskComplete={(id)=>moveTask(id,"Done")}
                sortBy={sortBy}
                onNewTask={(company)=>setModalTask(newTask({ company }))}
              />
            )}

            {view==="flags" && <FlagsView flags={flags} onMarkSeen={markFlagSeen} onMarkAllSeen={markAllFlagsSeen} onViewReports={()=>setView("weeklyreport_inline")} />}
            {view==="weeklyreport_inline" && <WeeklyReportView flags={flags} onMarkSeen={markFlagSeen} onDeleteReport={deleteFlag} onBack={()=>setView("flags")} />}

            {appError && <HubBanner onClose={()=>setAppError(null)}>{appError}</HubBanner>}
            {view==="pipeline" && <Pipeline opportunities={leads} companies={companies} contacts={contacts} tasks={tasks} onChanged={reloadAll} onOpenTask={t=>setModalTask(t)} onNewTask={(init)=>setModalTask(newTask(init))} />}
            {view==="companies" && <Companies companies={companies} contacts={contacts} opportunities={leads} tasks={tasks} orders={orders} onChanged={reloadAll} onOpenTask={t=>setModalTask(t)} onOpenOpportunity={o=>setModalOpp(o)} onNewTask={(init)=>setModalTask(newTask(init))} onLogComm={(init)=>setCommDraft(init)} />}
            {view==="followups" && <FollowUps key={followView} initialView={followView} tasks={tasks} opportunities={leads} companies={companies} onOpenTask={t=>setModalTask(t)} onOpenOpportunity={o=>setModalOpp(o)} onChanged={reloadAll} />}
            {view==="orders" && <Orders orders={orders} companies={companies} opportunities={leads} onChanged={loadCrm} />}
            {view==="search" && <Search autoFocus onPick={(kind,id)=>{
              if (kind==="task") { const t=tasks.find(x=>x.id===id); if (t) setModalTask(t); else supabase.from("tasks").select("*").eq("id",id).single().then(({data})=>data&&setModalTask(data)); }
              else if (kind==="opportunity") { const o=leads.find(x=>x.id===id); if (o) setModalOpp(o); else supabase.from("leads").select("*").eq("id",id).single().then(({data})=>data&&setModalOpp(data)); }
              else if (kind==="company"||kind==="contact") setView("companies");
              else if (kind==="order") setView("orders");
              else setView("companies");
            }} />}
            {view==="quality" && <DataQuality onOpen={(type,id)=>{
              if (type==="task") { const t=tasks.find(x=>x.id===id); if (t) setModalTask(t); }
              else if (type==="opportunity") { const o=leads.find(x=>x.id===id); if (o) setModalOpp(o); }
              else if (type==="order") setView("orders"); else setView("companies");
            }} />}

            {view==="seanweek" && <SeanWeekView items={seanWeek} onAdd={addSeanWeekItem} onDelete={deleteSeanWeekItem} />}
            {view==="inbox" && <InboxTriageView items={inboxTriage} onAdd={addInboxItem} onClear={clearInboxItem} onLog={(item)=>setCommDraft({ type:"Email", direction:"Inbound", subject:item.subject, notes:item.next_action||"" })} />}

            {view==="team" && (
              <div>
                <div style={{ fontSize:12,fontWeight:700,color:"#7f93a1",marginBottom:4,letterSpacing:"0.06em",textTransform:"uppercase" }}>Delegated work</div>
                <div style={{ fontSize:12,color:"#7f93a1",marginBottom:16 }}>Andrea and Jason don't use the hub — Vanya tracks these on their behalf. Their history is kept.</div>
                <TeamCard name="Jason" tasks={jasonTasks} />
                <TeamCard name="Andrea" tasks={andreaTasks} />
              </div>
            )}

            {!["dashboard","projects","accounts","pipeline","companies","followups","orders","search","quality","seanweek","inbox","team","flags","weeklyreport_inline"].includes(view) && (
              <div>
                {(viewTasks[view]||[]).length===0
                  ? <div style={{ textAlign:"center",padding:"60px 0",color:"#557080" }}><div style={{ fontSize:40,marginBottom:12 }}>◌</div><div style={{ fontSize:15 }}>No tasks here</div></div>
                  : (viewTasks[view]||[]).map(t=><TaskCard key={t.id} task={t} onClick={t=>setModalTask(t)} onComplete={(id)=>moveTask(id,"Done")} />)
                }
              </div>
            )}
          </div>
        </div>
      </div>

      {modalTask !== null && (
        <Modal onClose={()=>setModalTask(null)}>
          {modalTask.id
            ? <div>
                <TaskForm initial={modalTask} onSave={upsertTask} onClose={()=>setModalTask(null)} companies={companies} opportunities={leads} />
                <TaskActivityFeed taskId={modalTask.id} taskNotes={modalTask.notes} onNoteAdded={loadTasks} />
                <div style={{ marginTop:16,borderTop:"1px solid #1b4a60",paddingTop:16,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <div style={{ fontSize:12,color:"#6a8090" }}>Received {fmtDate(modalTask.date_received)}</div>
                  <div style={{ display:"flex",gap:8 }}>
                    <button onClick={()=>setCommDraft({ task_id: modalTask.id, company_id: modalTask.company_id, opportunity_id: modalTask.opportunity_id })} style={{ padding:"6px 14px",background:"none",border:"1px solid #10b981",borderRadius:6,color:"#10b981",cursor:"pointer",fontSize:12 }}>✉️ Log communication</button>
                    <button onClick={()=>{ if(window.confirm("Archive this task? Its history is kept and it can be restored.")){ archiveTask(modalTask.id); setModalTask(null); }}} style={{ padding:"6px 14px",background:"none",border:"1px solid #7f1d1d",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:12 }}>Archive Task</button>
                  </div>
                </div>
              </div>
            : <TaskForm initial={{ ...newTask(), ...modalTask }} onSave={upsertTask} onClose={()=>setModalTask(null)} companies={companies} opportunities={leads} />
          }
        </Modal>
      )}

      {modalOpp && (
        <OpportunityModal opp={modalOpp} companies={companies} contacts={contacts} tasks={tasks}
          onClose={()=>setModalOpp(null)} onSaved={()=>{ setModalOpp(null); reloadAll(); }}
          onOpenTask={t=>{ setModalOpp(null); setModalTask(t); }} onNewTask={(init)=>{ setModalOpp(null); setModalTask(newTask(init)); }} />
      )}
      {commDraft && <CommLog initial={commDraft} companies={companies} contacts={contacts} opportunities={leads} tasks={tasks} onClose={()=>setCommDraft(null)} onSaved={()=>{ setCommDraft(null); reloadAll(); }} />}

      {showSummary && <SummaryModal tasks={tasks} onClose={()=>setShowSummary(false)} />}
      {showNotes && <StickyNote onClose={()=>setShowNotes(false)} />}
    </div>
  );
}
