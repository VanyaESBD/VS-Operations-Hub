import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import QuickList from "./hub/QuickList";
import DailyActions from "./hub/DailyActions";
import { ACTION_STATES, STATE_COLOR, stateOf, isOpenTask, validateTask, stateToStatus, friendlyError, todayISO, isDueNowTask, isDueNowLead } from "./lib/hub";
import { loadCompanies, loadContacts, loadOrders, saveTask as saveTaskRecord, archive as archiveRecord, deleteTaskForever } from "./lib/data";
import { useHubUser, Banner as HubBanner, Picker, Field as HubField, HubLogo, useDismiss } from "./hub/ui";
import { CATEGORIES, CATEGORY_NAMES, STATE_STYLE, isPrivateCategory, normaliseCategory, ownerLabel, ASSIGNABLE } from "./lib/categories";
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

// Normalise company/client: trim + title case to prevent duplicates
const normaliseName = (s) => {
  if (!s || !s.trim()) return "";
  return s.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
};


const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const TASK_TYPES = ["Quick task", "Quote", "Order Request", "Information Request", "Complaint", "Follow-up", "Internal Admin", "FYI"];
const OWNERS = ["Vanya", "Sean", "Jason", "Andrea", "Unassigned"];
const STATUS_COLOR = { "To Do": "#c57f58", "FYA": "#c57f58", "Follow Up": "#a8a8a8", "FYI": "#b39ecc", "Done": "#5ccee8" }; // Outlook FYA / FlwUP / FYI
const STATUS_EMOJI = { "To Do": "🔴", "FYA": "🟠", "Follow Up": "🏌️", "FYI": "🟣", "Done": "✅" };
const WEEK_CATEGORIES = ["✈️ Flight", "🚗 Car Booking", "📄 Document to Sign", "📊 Slides", "🎫 Ticket", "🔗 Link", "📅 Meeting Prep", "📦 Other"];
const WEEK_CAT_COLOR = { "✈️ Flight":"#3b82f6","🚗 Car Booking":"#f59e0b","📄 Document to Sign":"#8b5cf6","📊 Slides":"#118fb5","🎫 Ticket":"#10b981","🔗 Link":"#7f93a1","📅 Meeting Prep":"#f97316","📦 Other":"#6a8090" };

// Special pinned accounts — keys are lowercase for normalised matching


const newTask = (overrides = {}) => ({
  subject: "", client: "", company: "", email: "",
  date_received: TODAY(), owner: "Vanya", status: "To Do", priority: "Medium",
  expected_date: "", actual_date: "", next_action: "", notes: "", outcome: "", task_type: "Information Request",
  project: "", follow_up_date: "", follow_up_note: "", action_state: "Our action", visibility: "team",
  company_id: null, opportunity_id: null, waiting_on: "", expected_response_date: "",
  ...overrides,
});


function Modal({ children, onClose }) {
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
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

function TaskForm({ initial, onSave, onClose, companies = [], opportunities = [], projects = [] }) {
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
        <Field label="Responsible" required><select style={inp} value={form.owner} onChange={(e)=>set("owner",e.target.value)}>{[...ASSIGNABLE, ...(form.owner && !ASSIGNABLE.includes(form.owner) ? [form.owner] : [])].map(o=><option key={o} value={o}>{ownerLabel(o)}</option>)}</select></Field>
        <Field label="State" required>
          <select style={{ ...inp, borderColor: STATE_COLOR[st] }} value={st} onChange={(e)=>set("action_state",e.target.value)}>{ACTION_STATES.map(s=><option key={s} value={s}>{STATE_STYLE[s]?.label || s}</option>)}</select>
        </Field>
        <Field label="Due Date"><input type="date" style={inp} value={form.expected_date||""} onChange={(e)=>set("expected_date",e.target.value)} />{err("expected_date") && <div style={{ fontSize:11,color:"#fca5a5" }}>{err("expected_date")}</div>}</Field>
        {st==="Awaiting response" && <>
          <Field label="🔔 Follow-up Date" required={st==="Awaiting response"}><input type="date" style={inp} value={form.follow_up_date||""} onChange={(e)=>set("follow_up_date",e.target.value)} title="Comes back into Today on this date" />{err("follow_up_date") && <div style={{ fontSize:11,color:"#fca5a5" }}>{err("follow_up_date")}</div>}</Field>
        </>}
        {(st==="Awaiting response"||st==="Monitoring") && <>
          <Field label="Waiting on"><input style={inp} value={form.waiting_on||""} onChange={(e)=>set("waiting_on",e.target.value)} placeholder="Who must respond? e.g. Emily (CIMC)" /></Field>
          <Field label="Expected response by"><input type="date" style={inp} value={form.expected_response_date||""} onChange={(e)=>set("expected_response_date",e.target.value)} /></Field>
        </>}
        <Field label="Company"><Picker value={form.company_id} onChange={(id)=>{ set("company_id",id); const c=companies.find(x=>x.id===id); if(c) set("company",c.name); const pr=projects.find(x=>x.id===form.project_id); if (pr && id && pr.company_id && pr.company_id!==id) { set("project_id",null); set("project",""); } }} noneLabel="— Not linked" options={companies.map(c=>({ value:c.id, label:c.name }))} /></Field>
        <Field label="Project"><Picker value={form.project_id} onChange={(id)=>{ set("project_id",id); const pr=projects.find(x=>x.id===id); set("project", pr ? pr.name : ""); if (pr && pr.company_id && !form.company_id) { set("company_id",pr.company_id); const c=companies.find(x=>x.id===pr.company_id); if (c) set("company",c.name); } }} noneLabel={form.project && !form.project_id ? `— ${form.project} (not linked)` : "— None"} options={projects.filter(p=>!p.archived_at && (!form.company_id || p.company_id===form.company_id || p.id===form.project_id)).map(p=>({ value:p.id, label:p.name }))} /></Field>
        <div style={{ gridColumn:"1/-1" }}><Field label="Next Action"><input style={inp} value={form.next_action||""} onChange={(e)=>set("next_action",e.target.value)} /></Field></div>
        {form.follow_up_date && <div style={{ gridColumn:"1/-1" }}><Field label="Follow-up Note"><input style={inp} value={form.follow_up_note||""} onChange={(e)=>set("follow_up_note",e.target.value)} placeholder="What to check or ask when you follow up..." /></Field></div>}
        <div style={{ gridColumn:"1/-1" }}><Field label="Notes"><textarea style={{ ...inp,minHeight:72,resize:"vertical" }} value={form.notes||""} onChange={(e)=>set("notes",e.target.value)} placeholder="Add context, details or background..." /></Field></div>
        {(st === "Completed" || st === "Cancelled") && <div style={{ gridColumn:"1/-1" }}><Field label="Outcome"><input style={inp} value={form.outcome||""} onChange={(e)=>set("outcome",e.target.value)} placeholder={st==="Completed"?"What was actually achieved?":"Why was it cancelled?"} /></Field></div>}
      </div>
      {/* Everything else, one click away (Vanya, 26 Oct 2026: 8 fields up front) */}
      <details style={{ marginTop:14,borderTop:"1px solid #10364a",paddingTop:10 }}>
        <summary style={{ cursor:"pointer",fontSize:12,color:"#118fb5" }}>More details ▾ <span style={{ color:"#6a8090" }}>— priority, category, task type, follow-up date, opportunity, contact, email, date received, visibility</span></summary>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14,marginTop:12 }}>
          <Field label="Priority"><select style={inp} value={form.priority} onChange={(e)=>set("priority",e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></Field>
          <Field label="Category">
            <select style={{ ...inp, borderColor: normaliseCategory(form.category) ? CATEGORIES[normaliseCategory(form.category)].ink : undefined, color: normaliseCategory(form.category) ? CATEGORIES[normaliseCategory(form.category)].ink : inp.color }}
              value={normaliseCategory(form.category) || ""}
              onChange={(e)=>{ const c=e.target.value||null; set("category",c); if (isPrivateCategory(c)) set("visibility","private"); }}>
              <option value="">— None</option>{CATEGORY_NAMES.map(c=><option key={c} value={c} style={{ color: CATEGORIES[c].ink }}>{c}{CATEGORIES[c].private?" (private)":""}</option>)}
            </select>
          </Field>
          <Field label="Task Type"><select style={inp} value={form.task_type||"Information Request"} onChange={(e)=>set("task_type",e.target.value)}>{TASK_TYPES.map(t=><option key={t}>{t}</option>)}</select></Field>
          {st!=="Awaiting response" && <>
            <Field label="🔔 Follow-up Date" required={st==="Awaiting response"}><input type="date" style={inp} value={form.follow_up_date||""} onChange={(e)=>set("follow_up_date",e.target.value)} title="Comes back into Today on this date" />{err("follow_up_date") && <div style={{ fontSize:11,color:"#fca5a5" }}>{err("follow_up_date")}</div>}</Field>
          </>}
          <Field label="Opportunity"><Picker value={form.opportunity_id} onChange={(id)=>set("opportunity_id",id)} noneLabel="— None" options={opportunities.filter(o=>!form.company_id||o.company_id===form.company_id).map(o=>({ value:o.id, label:o.name||o.company }))} /></Field>
          <Field label="Client / contact"><input style={inp} value={form.client||""} onChange={(e)=>set("client",e.target.value)} /></Field>
          {!form.company_id && <Field label="Company (text, if no record)"><CompanyDropdown value={form.company} onChange={v=>set("company",v)} /></Field>}
          <Field label="Email"><input style={inp} value={form.email||""} onChange={(e)=>set("email",e.target.value)} /></Field>
          <Field label="Date Received"><input type="date" style={inp} value={form.date_received||""} onChange={(e)=>set("date_received",e.target.value)} /></Field>
          <Field label="Visibility"><select style={inp} value={form.visibility||"team"} onChange={(e)=>set("visibility",e.target.value)}><option value="team">Team</option><option value="private">Private (Sean & Vanya only, once login is on)</option></select></Field>
        </div>
      </details>
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




function TaskActivityFeed({ taskId, taskNotes, onNoteAdded }) {
  const { name: me } = useHubUser();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [author, setAuthor] = useState(me || "Vanya");   // whoever is signed in (was always "Vanya")

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




function StickyNote({ onClose }) {
  const { name: me } = useHubUser();
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [author, setAuthor] = useState(me || "Vanya");   // whoever is signed in (was always "Vanya")
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
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

// ============================================================
// ACCOUNTS VIEW — normalised to eliminate duplicates
// ============================================================

export default function App() {
  const { name: me, role, signOut } = useHubUser();
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
  const [projects, setProjects] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [view, setView] = useState("dashboard");
  const [modalTask, setModalTask] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const newMenuRef = useRef(null);
  const notifRef = useRef(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const [status, setStatus] = useState("Connecting…");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeNewMenu = useCallback(() => setNewMenu(false), []);
  const closeNotifs = useCallback(() => setShowNotifications(false), []);
  useDismiss(newMenu, closeNewMenu, newMenuRef);
  useDismiss(showNotifications, closeNotifs, notifRef);
  // Changing screens closes any open popover.
  useEffect(() => { setNewMenu(false); setShowNotifications(false); }, [view]);
  // Phone layout: below 820px the menu lives behind ☰ instead of taking a third of the screen.
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 820);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 820);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
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


  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").order("name", { ascending: true });
    if (data) setProjects(data);
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
    loadTasks(); loadLeads(); loadSeanWeek(); loadInboxTriage(); loadProjects(); loadReminders(); loadCrm();
    const taskCh = supabase.channel("tasks-ch").on("postgres_changes",{event:"*",schema:"public",table:"tasks"},loadTasks).subscribe();
    const leadCh = supabase.channel("leads-ch").on("postgres_changes",{event:"*",schema:"public",table:"leads"},loadLeads).subscribe();
    const weekCh = supabase.channel("week-ch").on("postgres_changes",{event:"*",schema:"public",table:"sean_week"},loadSeanWeek).subscribe();
    const inboxCh = supabase.channel("inbox-ch").on("postgres_changes",{event:"*",schema:"public",table:"inbox_triage"},loadInboxTriage).subscribe();
    const projCh = supabase.channel("projects-ch").on("postgres_changes",{event:"*",schema:"public",table:"projects"},loadProjects).subscribe();
    const remCh = supabase.channel("reminders-ch").on("postgres_changes",{event:"*",schema:"public",table:"reminders"},loadReminders).subscribe();
    const crmCh = supabase.channel("crm-ch")
      .on("postgres_changes",{event:"*",schema:"public",table:"companies"},loadCrm)
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},loadCrm)
      .subscribe();
    const interval = setInterval(() => { loadTasks(); loadLeads(); loadSeanWeek(); loadInboxTriage(); loadReminders(); }, 30000);
    return () => { supabase.removeChannel(taskCh); supabase.removeChannel(leadCh); supabase.removeChannel(weekCh); supabase.removeChannel(inboxCh); supabase.removeChannel(projCh); supabase.removeChannel(remCh); supabase.removeChannel(crmCh); clearInterval(interval); };
  }, [loadTasks, loadLeads, loadSeanWeek, loadInboxTriage, loadProjects, loadReminders, loadCrm]);
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



  const markAllSeen = () => {
    const allIds = [...seenTaskIds, ...newTasks.map(t=>t.id)];
    setSeenTaskIds(allIds);
    sessionStorage.setItem("seenTaskIds", JSON.stringify(allIds));
    setShowNotifications(false);
  };

  const newTasks = tasks.filter(t=>t.date_received===TODAY()&&!seenTaskIds.includes(t.id));
  const pendingInbox = inboxTriage.filter(i=>!i.cleared);
  // Permanent delete is for Vanya (admin) and Sean (manager); the database checks this again.
  const canDelete = role === "admin" || role === "manager";

  // Quick list badge = open quick tasks + diary reminders due today or overdue.
  const todayStr = TODAY();
  const quickMine = (owner) => role === "admin" || me === "Vanya" || owner === me;   // same rule as the Quick list page
  const quickCount = tasks.filter(t => t.task_type === "Quick task" && isOpenTask(t) && quickMine(t.owner)).length
    + reminders.filter(r => !r.completed && r.remind_date <= todayStr && quickMine(r.owner)).length;

  const VIEWS = [
    { id:"dashboard", label:"Dashboard", icon:"⬡" },
    // "Tasks" opens on Today = overdue + due today: tasks, scheduled follow-ups and opportunity follow-ups.
    { id:"followups", label:"Tasks", icon:"⏱", count: tasks.filter(t=>isDueNowTask(t)).length + leads.filter(l=>isDueNowLead(l)).length },
    { id:"today", label:"Quick list", icon:"⚡", count: quickCount },
    // Badges only where something needs doing (Vanya, 26 Oct 2026).
    { id:"companies", label:"Companies & projects", icon:"🏢" },
    { id:"pipeline", label:"Sales Pipeline", icon:"🎯" },
    { id:"orders", label:"Orders", icon:"📦" },
    // Under "More" — Sean's Week and Inbox Triage kept until the Outlook connection is live (Vanya, 19 Oct 2026).
    { id:"quality", label:"Data Quality", icon:"🧹", more:true },
    { id:"seanweek", label:"Sean's Week", icon:"📅", more:true },
    { id:"inbox", label:"Inbox Triage", icon:"🗑️", count:pendingInbox.length, more:true },
    { id:"search", label:"Search", icon:"🔍", hidden:true },
  ];



  const Sidebar = (
    <div style={{ width:isMobile?"100%":220,background:"#08202c",borderRight:"1px solid #10364a",padding:isMobile?"16px 10px":"24px 12px",display:"flex",flexDirection:"column",minHeight:"100%" }}>
      <div style={{ padding:"0 8px 24px",borderBottom:"1px solid #10364a" }}>
        <div style={{ marginBottom:6 }}><HubLogo /></div>
      </div>
      <div style={{ marginTop:16,flex:1,overflowY:"auto" }}>
        {VIEWS.filter(v => !v.hidden && (!v.more || moreOpen || view===v.id)).map(v=>(
          <button key={v.id} onClick={()=>{ setView(v.id); setSidebarOpen(false); }}
            style={{ width:"100%",textAlign:"left",padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",background:view===v.id?"#123a4f":"none",color:view===v.id?"#118fb5":"#7f93a1",display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:view===v.id?600:400,marginBottom:2 }}>
            <span style={{ fontSize:14,width:16,textAlign:"center" }}>{v.icon}</span>
            <span style={{ flex:1 }}>{v.label}</span>
            {v.count!==undefined&&v.count>0&&<span style={{ background:v.id==="today"?"#7f1d1d":v.id==="overdue"?"#7f1d1d":v.id==="leads"?"#1e3a8a":v.id==="inbox"?"#7f1d1d":v.id==="flags"?"#7f1d1d":v.id==="projects"?"#d97706":v.id==="accounts"?"#118fb533":"#1b4a60",color:v.id==="today"?"#fca5a5":v.id==="overdue"?"#fca5a5":v.id==="leads"?"#93c5fd":v.id==="inbox"?"#fca5a5":v.id==="flags"?"#fca5a5":v.id==="projects"?"#fff":v.id==="accounts"?"#118fb5":"#9ca3af",borderRadius:99,padding:"1px 7px",fontSize:11,fontWeight:v.id==="today"?700:400 }}>{v.count}</span>}
          </button>
        ))}
        <button onClick={()=>setMoreOpen(o=>!o)} style={{ width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:8,border:"none",borderTop:"1px solid #10364a",marginTop:6,cursor:"pointer",background:"none",color:"#6a8090",fontSize:12 }}>
          {moreOpen ? "Less ▴" : "More ▾"}{!moreOpen && pendingInbox.length>0 ? ` · ${pendingInbox.length} in inbox` : ""}
        </button>
      </div>
      <div style={{ paddingTop:16,borderTop:"1px solid #10364a" }}>
        <div style={{ fontSize:10,color:"#557080",textAlign:"center",marginBottom:8 }}>
          <span style={{ display:"inline-block",width:6,height:6,borderRadius:"50%",background:status==="Live"?"#10b981":status==="Connecting…"?"#f59e0b":"#ef4444",marginRight:6,verticalAlign:"middle" }} />{status}
        </div>
        {signOut && <div style={{ fontSize:11,color:"#7f93a1",textAlign:"center",marginBottom:8 }}>Signed in as {me} · <button onClick={signOut} style={{ background:"none",border:"none",color:"#118fb5",cursor:"pointer",fontSize:11 }}>Sign out</button></div>}
        <a href="/sean" style={{ display:"block",textAlign:"center",padding:"8px",background:"#10364a",border:"1px solid #18b9dc",borderRadius:8,color:"#5ccee8",fontSize:12,fontWeight:600,marginBottom:8,textDecoration:"none" }}>📱 Sean's phone view</a>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh",background:"#0a2432",color:"#e2e8f0",fontFamily:'Aptos,"Segoe UI Variable","Segoe UI",system-ui,-apple-system,sans-serif',display:"flex",flexDirection:"column" }}>
      <style>{`*{box-sizing:border-box;} button,input,select,textarea{font-family:inherit;} ::-webkit-scrollbar{width:5px;} ::-webkit-scrollbar-track{background:#0a2432;} ::-webkit-scrollbar-thumb{background:#1b4a60;border-radius:3px;} select option{background:#10364a;}`}</style>

      <div style={{ display:"flex",alignItems:"center",padding:isMobile?"10px 10px":"14px 16px",borderBottom:"1px solid #10364a",background:"#08202c",gap:isMobile?6:12 }}>
        <button aria-label="Menu" onClick={()=>setSidebarOpen(true)} style={{ background:"none",border:"1px solid #1b4a60",borderRadius:7,color:"#7f93a1",cursor:"pointer",padding:"6px 10px",fontSize:16,display:isMobile?"block":"none" }}>☰</button>
        <span style={{ fontSize:16,fontWeight:800,color:"#e2e8f0",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{VIEWS.find(v=>v.id===view)?.label}</span>
        <button aria-label="Search" onClick={()=>{ setView("search"); setSidebarOpen(false); }} style={{ padding:isMobile?"7px 8px":"7px 12px",background:view==="search"?"#123a4f":"none",border:"1px solid #1b4a60",borderRadius:7,color:"#7f93a1",cursor:"pointer",fontSize:12,fontWeight:600 }}>🔍{isMobile?"":" Search"}</button>
        <div ref={notifRef} style={{ position:"relative" }}>
          <button aria-label="New today" aria-expanded={showNotifications} onClick={()=>setShowNotifications(!showNotifications)} style={{ background:"none",border:"1px solid #1b4a60",borderRadius:7,color:"#7f93a1",cursor:"pointer",padding:"7px 10px",fontSize:16,position:"relative" }}>
            🔔
            {newTasks.length>0 && <span style={{ position:"absolute",top:-6,right:-6,background:"#ef4444",color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center" }}>{newTasks.length}</span>}
          </button>
          {showNotifications && (
            <div style={{ position:"absolute",top:42,right:isMobile?-60:0,width:isMobile?"min(300px, calc(100vw - 20px))":300,background:"#0b2735",border:"1px solid #1b4a60",borderRadius:12,zIndex:800,boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
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
        <div ref={newMenuRef} style={{ position:"relative" }}>
          <button aria-haspopup="menu" aria-expanded={newMenu} onClick={()=>setNewMenu(o=>!o)} style={{ padding:isMobile?"7px 10px":"7px 14px",background:"#118fb5",border:"none",borderRadius:7,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap" }}>＋ New ▾</button>
          {newMenu && (
            <div role="menu" style={{ position:"absolute",right:0,top:38,width:220,background:"#0b2735",border:"1px solid #1b4a60",borderRadius:10,boxShadow:"0 16px 40px rgba(0,0,0,0.55)",padding:6,zIndex:900 }}>
              {[["📋 Task",()=>setModalTask({})],["⚡ Quick task",()=>{ setView("today"); }],["✉️ Log email / call",()=>setCommDraft({})],["📝 Note",()=>setShowNotes(true)],["✅ Daily action list",()=>setShowSummary(true)]].map(([l,fn])=>(
                <button key={l} role="menuitem" onClick={()=>{ setNewMenu(false); fn(); }} style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 10px",background:"none",border:"none",borderRadius:6,color:"#e2e8f0",cursor:"pointer",fontSize:13 }}
                  onMouseEnter={e=>e.currentTarget.style.background="#10364a"} onMouseLeave={e=>e.currentTarget.style.background="none"}>{l}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex:1,display:"flex",overflow:"hidden" }}>
        {!isMobile && <div style={{ display:"flex",flexDirection:"column" }}>{Sidebar}</div>}
        {sidebarOpen && (
          <div style={{ position:"fixed",inset:0,zIndex:500,display:"flex" }} onClick={()=>setSidebarOpen(false)}>
            <div style={{ width:260,maxWidth:"85vw",height:"100%",background:"#08202c",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>{Sidebar}</div>
            <div style={{ flex:1,background:"rgba(0,0,0,0.5)" }} />
          </div>
        )}
        <div style={{ flex:1,minWidth:0,display:"flex",flexDirection:"column",overflow:"hidden" }}>
          <div style={{ flex:1,overflowY:"auto",overflowX:"hidden",padding:isMobile?"14px 12px":28 }}>

            {view==="today" && <QuickList tasks={tasks} reminders={reminders} onChanged={loadTasks} onReminders={loadReminders} onOpenTask={t=>setModalTask(t)} goTasks={()=>{ setFollowView("today"); setView("followups"); }} />}

            {view==="dashboard" && (
              <div>
                <HubDashboard tasks={tasks} opportunities={leads} companies={companies} orders={orders}
                  go={(v, sub)=>{ if (sub) setFollowView(sub); setView(v); }}
                  openTask={t=>setModalTask(t)} openOpp={o=>setModalOpp(o)} openOrder={()=>setView("orders")} />
              </div>
            )}

            {appError && <HubBanner onClose={()=>setAppError(null)}>{appError}</HubBanner>}
            {view==="pipeline" && <Pipeline opportunities={leads} companies={companies} contacts={contacts} tasks={tasks} onChanged={reloadAll} onOpenTask={t=>setModalTask(t)} onNewTask={(init)=>setModalTask(newTask(init))} />}
            {view==="companies" && <Companies companies={companies} contacts={contacts} opportunities={leads} tasks={tasks} orders={orders} projects={projects} onChanged={()=>{ reloadAll(); loadProjects(); }} onOpenTask={t=>setModalTask(t)} onOpenOpportunity={o=>setModalOpp(o)} onNewTask={(init)=>setModalTask(newTask(init))} onLogComm={(init)=>setCommDraft(init)} />}
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

          </div>
        </div>
      </div>

      {modalTask !== null && (
        <Modal onClose={()=>setModalTask(null)}>
          {modalTask.id
            ? <div>
                <TaskForm initial={modalTask} onSave={upsertTask} onClose={()=>setModalTask(null)} companies={companies} opportunities={leads} projects={projects} />
                <TaskActivityFeed taskId={modalTask.id} taskNotes={modalTask.notes} onNoteAdded={loadTasks} />
                <div style={{ marginTop:16,borderTop:"1px solid #1b4a60",paddingTop:16,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <div style={{ fontSize:12,color:"#6a8090" }}>Received {fmtDate(modalTask.date_received)}</div>
                  <div style={{ display:"flex",gap:8 }}>
                    <button onClick={()=>setCommDraft({ task_id: modalTask.id, company_id: modalTask.company_id, opportunity_id: modalTask.opportunity_id })} style={{ padding:"6px 14px",background:"none",border:"1px solid #10b981",borderRadius:6,color:"#10b981",cursor:"pointer",fontSize:12 }}>✉️ Log communication</button>
                    <button onClick={()=>{ if(window.confirm("Archive this task? Its history is kept and it can be restored.")){ archiveTask(modalTask.id); setModalTask(null); }}} style={{ padding:"6px 14px",background:"none",border:"1px solid #7f1d1d",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:12 }}>Archive Task</button>
                    {canDelete && <button onClick={async()=>{ if(window.confirm(`Delete "${modalTask.subject}" permanently?\n\nThis cannot be undone. Its notes and history go too (emails logged against it are kept). Use Archive if you might need it again.`)){ const { error } = await deleteTaskForever(modalTask.id); if (error) setAppError("Couldn't delete: " + error); else { setModalTask(null); loadTasks(); } }}} style={{ padding:"6px 14px",background:"#7f1d1d",border:"1px solid #ef4444",borderRadius:6,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700 }}>🗑 Delete permanently</button>}
                  </div>
                </div>
              </div>
            : <TaskForm initial={{ ...newTask(), ...modalTask }} onSave={upsertTask} onClose={()=>setModalTask(null)} companies={companies} opportunities={leads} projects={projects} />
          }
        </Modal>
      )}

      {modalOpp && (
        <OpportunityModal opp={modalOpp} companies={companies} contacts={contacts} tasks={tasks}
          onClose={()=>setModalOpp(null)} onSaved={()=>{ setModalOpp(null); reloadAll(); }}
          onOpenTask={t=>{ setModalOpp(null); setModalTask(t); }} onNewTask={(init)=>{ setModalOpp(null); setModalTask(newTask(init)); }} />
      )}
      {commDraft && <CommLog initial={commDraft} companies={companies} contacts={contacts} opportunities={leads} tasks={tasks} onClose={()=>setCommDraft(null)} onSaved={()=>{ setCommDraft(null); reloadAll(); }} />}

      {showSummary && <DailyActions tasks={tasks} opportunities={leads} reminders={reminders} onClose={()=>setShowSummary(false)} onOpenTask={t=>{ setShowSummary(false); setModalTask(t); }} />}
      {showNotes && <StickyNote onClose={()=>setShowNotes(false)} />}
    </div>
  );
}
