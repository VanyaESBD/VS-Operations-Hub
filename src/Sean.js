import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { CATEGORIES, normaliseCategory, rag, RAG, questionType } from "./lib/categories";
import { CategoryTag } from "./hub/tags";
import { HubLogo } from "./hub/ui";
import { todayISO, addDays, stageOf, isActiveLead, leadFollowUp, dueBucket, formatMoney, PIPELINE_STAGES, STAGE_COLOR, stateOf, isOpenTask, actionDate } from "./lib/hub";
import { saveOpportunity, addActivityNote } from "./lib/data";

const TODAY = () => todayISO(); // local date (was UTC)
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";
const isOverdue = (t) => isOpenTask(t) && stateOf(t) === "Our action" && t.expected_date && t.expected_date < TODAY();

const STATUS_COLOR = { "To Do": "#c57f58", "FYA": "#c57f58", "Follow Up": "#a8a8a8", "FYI": "#b39ecc", "Done": "#5ccee8" }; // Outlook FYA / FlwUP / FYI
const STATUS_EMOJI = { "To Do": "🔴", "FYA": "🟠", "Follow Up": "🏌️", "FYI": "🟣", "Done": "✅" };
const STATUSES = ["To Do", "FYA", "Follow Up", "FYI", "Done"];
const PRIORITY_ORDER = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

const inp = { background:"#10364a", border:"1px solid #1b4a60", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };

// Earliest date that needs attention first (most overdue at the top); urgency breaks ties.
function sortByUrgency(arr) {
  return [...arr].sort((a, b) => {
    const da = actionDate(a) || "9999-12-31", db = actionDate(b) || "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    const ap = PRIORITY_ORDER[a.priority] !== undefined ? PRIORITY_ORDER[a.priority] : 2;
    const bp = PRIORITY_ORDER[b.priority] !== undefined ? PRIORITY_ORDER[b.priority] : 2;
    return ap - bp;
  });
}

function TaskCard({ task, onEdit, onDone, showOwner }) {
  var over = isOverdue(task);
  var light = rag(actionDate(task), TODAY(), { done: !isOpenTask(task), updatedAt: task.updated_at, updatedBy: task.updated_by });
  var q = task.needs_review ? questionType(task.needs_review) : null;
  var cat = normaliseCategory(task.category);
  var borderColor = cat ? CATEGORIES[cat].ink : (STATUS_COLOR[task.status] || "#1b4a60");
  var when = actionDate(task);
  var waiting = stateOf(task) === "Awaiting response";
  return (
    <div className={light.glow ? "hub-glow" : undefined} style={{ background:"#0e2d3e", border:"1px solid " + (over ? "#7f1d1d" : "#1b4a60"), borderLeft:"3px solid " + borderColor, borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:4 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#e2e8f0", lineHeight:1.3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{task.subject}</div>
          <div style={{ fontSize:11, color: over ? "#fca5a5" : "#7f93a1", marginTop:2 }}>
            {when && <span aria-hidden style={{ display:"inline-block", width:7, height:7, borderRadius:99, background:RAG[light.level].ink, marginRight:5, verticalAlign:"middle" }} />}
            {showOwner && task.owner !== "Sean" ? task.owner + " · " : ""}{task.company ? task.company + " · " : ""}{over ? "⚠ " : ""}{when ? (waiting ? "Follow up " : "Due ") + fmtDate(when) : "no date"}
            {cat && <span style={{ marginLeft:6 }}><CategoryTag category={cat} small /></span>}
            {task.priority === "Urgent" && <span style={{ marginLeft:6, background:"#ef444422", color:"#ef4444", borderRadius:99, padding:"1px 6px", fontSize:10, fontWeight:700 }}>URGENT</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0, alignItems:"center" }}>
          <button aria-label="Edit" onClick={function() { onEdit(task); }} style={{ minWidth:42, minHeight:42, background:"#118fb522", border:"1px solid #118fb5", borderRadius:8, color:"#118fb5", fontSize:16, fontWeight:600, cursor:"pointer" }}>✎</button>
          <button aria-label="Mark done" onClick={function() { onDone(task.id); }} style={{ minWidth:42, minHeight:42, background:"#10b98122", border:"1px solid #10b981", borderRadius:8, color:"#10b981", fontSize:16, fontWeight:600, cursor:"pointer" }}>✓</button>
        </div>
      </div>
      {task.next_action && <div style={{ fontSize:12, color:"#118fb5", marginTop:2 }}>→ {task.next_action}</div>}
      {q && <div style={{ fontSize:12, color:q.ink, marginTop:3 }}>❓ {task.needs_review.slice(q.prefix.length).trim() || task.needs_review}</div>}
    </div>
  );
}

function EditSheet({ task, onSave, onClose }) {
  var [form, setForm] = useState({
    status: task.status,
    expected_date: task.expected_date || "",
    next_action: task.next_action || "",
    notes: task.notes || "",
  });
  function set(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:1000, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div style={{ background:"#0b2735", borderRadius:"16px 16px 0 0", padding:"20px 16px 32px", width:"100%", maxHeight:"80vh", overflowY:"auto" }} onClick={function(e) { e.stopPropagation(); }}>
        <div style={{ width:36, height:4, background:"#1b4a60", borderRadius:99, margin:"0 auto 16px" }} />
        <div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0", marginBottom:4, lineHeight:1.3 }}>{task.subject}</div>
        <div style={{ fontSize:11, color:"#6a8090", marginBottom:16 }}>{task.company || ""}{task.client ? " · " + task.client : ""}</div>
        <div style={{ fontSize:10, fontWeight:700, color:"#7f93a1", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>Status</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
          {STATUSES.map(function(st) {
            return (
              <button key={st} onClick={function() { set("status", st); }}
                style={{ padding:"6px 12px", borderRadius:99, border:"1px solid " + (form.status===st ? STATUS_COLOR[st] : "#1b4a60"), background:form.status===st ? STATUS_COLOR[st]+"33" : "none", color:form.status===st ? STATUS_COLOR[st] : "#7f93a1", cursor:"pointer", fontSize:12, fontWeight:form.status===st ? 700 : 400 }}>
                {STATUS_EMOJI[st]} {st}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize:10, fontWeight:700, color:"#7f93a1", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Follow Up Date</div>
        <input type="date" value={form.expected_date} onChange={function(e) { set("expected_date", e.target.value); }} style={Object.assign({}, inp, { marginBottom:12, fontSize:13 })} />
        <div style={{ fontSize:10, fontWeight:700, color:"#7f93a1", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Next Action</div>
        <input value={form.next_action} onChange={function(e) { set("next_action", e.target.value); }} placeholder="What needs to happen next?" style={Object.assign({}, inp, { marginBottom:12, fontSize:13 })} />
        <div style={{ fontSize:10, fontWeight:700, color:"#7f93a1", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Notes</div>
        <textarea value={form.notes} onChange={function(e) { set("notes", e.target.value); }} placeholder="Add a note..." style={Object.assign({}, inp, { minHeight:80, resize:"vertical", marginBottom:16, fontSize:13 })} />
        <button onClick={function() { onSave(form); }} style={{ width:"100%", padding:"13px", background:"#118fb5", border:"none", borderRadius:10, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>
          Save
        </button>
      </div>
    </div>
  );
}

function OppRow({ o, onOpen }) {
  var fu = leadFollowUp(o);
  var b = dueBucket(fu, TODAY());
  var money = formatMoney(o.value_amount, o.currency, o.value_basis);
  return (
    <div onClick={function() { onOpen(o); }} style={{ background:"#0e2d3e", border:"1px solid #1b4a60", borderLeft:"3px solid " + STAGE_COLOR[stageOf(o)], borderRadius:10, padding:"12px 14px", marginBottom:8, cursor:"pointer", minHeight:44 }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#e2e8f0", flex:1, minWidth:0 }}>{o.name || o.company}</div>
        {fu && <span style={{ fontSize:12, color: b === "overdue" ? "#fca5a5" : b === "today" ? "#fde68a" : "#7f93a1", flexShrink:0 }}>{fmtDate(fu)}</span>}
      </div>
      <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{stageOf(o)}{money ? " · " + money : ""}</div>
      {o.next_action && <div style={{ fontSize:12, color:"#118fb5", marginTop:4 }}>→ {o.next_action}</div>}
    </div>
  );
}

// ── Opportunity sheet: quick status update for Sean ─────────
function OppSheet({ opp, onClose, onSaved }) {
  var [stage, setStage] = useState(stageOf(opp));
  var [nextAction, setNextAction] = useState(opp.next_action || "");
  var [followUp, setFollowUp] = useState(opp.follow_up_date || "");
  var [note, setNote] = useState("");
  var [lostReason, setLostReason] = useState(opp.lost_reason || "");
  var [error, setError] = useState(null);
  var [saving, setSaving] = useState(false);
  var money = formatMoney(opp.value_amount, opp.currency, opp.value_basis);
  async function save() {
    if (stage === "Lost" && !lostReason.trim()) { setError("Add a short reason it was lost."); return; }
    setSaving(true); setError(null);
    var res = await saveOpportunity({ id: opp.id, pipeline_stage: stage, next_action: nextAction, follow_up_date: followUp || null, lost_reason: stage === "Lost" ? lostReason : opp.lost_reason }, "Sean");
    if (!res.error && note.trim()) res = await addActivityNote("opportunity", opp.id, note.trim(), "Sean");
    setSaving(false);
    if (res.error) setError(res.error); else onSaved();
  }
  var lbl = { fontSize:10, fontWeight:700, color:"#7f93a1", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:1000, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div style={{ background:"#0b2735", borderRadius:"16px 16px 0 0", padding:"20px 16px 32px", width:"100%", maxHeight:"88vh", overflowY:"auto" }} onClick={function(e) { e.stopPropagation(); }}>
        <div style={{ width:36, height:4, background:"#1b4a60", borderRadius:99, margin:"0 auto 16px" }} />
        <div style={{ fontSize:16, fontWeight:800, color:"#e2e8f0" }}>{opp.name || opp.company}</div>
        <div style={{ fontSize:12, color:"#9ca3af", margin:"4px 0 14px" }}>{[opp.company, money, opp.owner && "Owner: " + opp.owner].filter(Boolean).join(" · ")}</div>
        {opp.notes && <div style={{ fontSize:12, color:"#9ca3af", background:"#0e2d3e", borderRadius:8, padding:10, marginBottom:14, whiteSpace:"pre-wrap" }}>{opp.notes}</div>}
        {error && <div style={{ background:"#7f1d1d55", color:"#fca5a5", borderRadius:8, padding:10, fontSize:13, marginBottom:12 }}>{error}</div>}
        <div style={lbl}>Stage</div>
        <select value={stage} onChange={function(e) { setStage(e.target.value); }} style={Object.assign({}, inp, { fontSize:15, padding:"12px", marginBottom:12, borderColor: STAGE_COLOR[stage] })}>
          {PIPELINE_STAGES.map(function(st) { return <option key={st}>{st}</option>; })}
        </select>
        {stage === "Lost" && <><div style={lbl}>Why lost?</div><input value={lostReason} onChange={function(e) { setLostReason(e.target.value); }} style={Object.assign({}, inp, { fontSize:15, padding:"12px", marginBottom:12 })} /></>}
        <div style={lbl}>Next step</div>
        <input value={nextAction} onChange={function(e) { setNextAction(e.target.value); }} placeholder="What happens next?" style={Object.assign({}, inp, { fontSize:15, padding:"12px", marginBottom:12 })} />
        <div style={lbl}>Follow up on</div>
        <div style={{ display:"flex", gap:6, marginBottom:8 }}>
          {[["Tomorrow",1],["+3 days",3],["Next week",7]].map(function(x) { return <button key={x[0]} onClick={function() { setFollowUp(addDays(TODAY(), x[1])); }} style={{ flex:1, minHeight:42, background:"#10364a", border:"1px solid #1b4a60", borderRadius:8, color:"#9ca3af", fontSize:13 }}>{x[0]}</button>; })}
        </div>
        <input type="date" value={followUp} onChange={function(e) { setFollowUp(e.target.value); }} style={Object.assign({}, inp, { fontSize:15, padding:"12px", marginBottom:12 })} />
        <div style={lbl}>Quick note (kept in history)</div>
        <textarea value={note} onChange={function(e) { setNote(e.target.value); }} placeholder="e.g. Spoke to Kerr — wants revised costing" style={Object.assign({}, inp, { minHeight:70, fontSize:15, marginBottom:16 })} />
        <button disabled={saving} onClick={save} style={{ width:"100%", padding:"14px", background:"#118fb5", border:"none", borderRadius:10, color:"#fff", fontSize:16, fontWeight:700, cursor:"pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

function NoteSheet({ onClose }) {
  var [text, setText] = useState("");
  var [error, setError] = useState(null);
  async function send() {
    if (!text.trim()) return;
    var res = await supabase.from("notes").insert([{ content: text.trim(), author: "Sean" }]);
    if (res.error) setError(res.error.message); else onClose();
  }
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:1000, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div style={{ background:"#0b2735", borderRadius:"16px 16px 0 0", padding:"20px 16px 32px", width:"100%" }} onClick={function(e) { e.stopPropagation(); }}>
        <div style={{ fontSize:15, fontWeight:700, color:"#e2e8f0", marginBottom:10 }}>📝 Quick note for Vanya</div>
        {error && <div style={{ color:"#fca5a5", fontSize:13, marginBottom:8 }}>{error}</div>}
        <textarea autoFocus value={text} onChange={function(e) { setText(e.target.value); }} placeholder="Anything to action or remember…" style={Object.assign({}, inp, { minHeight:110, fontSize:15, marginBottom:14 })} />
        <button onClick={send} style={{ width:"100%", padding:"14px", background:"#118fb5", border:"none", borderRadius:10, color:"#fff", fontSize:16, fontWeight:700 }}>Send</button>
      </div>
    </div>
  );
}

export default function Sean() {
  var [tasks, setTasks] = useState([]);
  var [loading, setLoading] = useState(true);
  var [activeTab, setActiveTab] = useState("today");
  var [leads, setLeads] = useState([]);
  var [openOpp, setOpenOpp] = useState(null);
  var [showNote, setShowNote] = useState(false);
  var [editingTask, setEditingTask] = useState(null);

  function load() {
    supabase.from("tasks").select("*").is("archived_at", null).order("created_at", { ascending: false }).then(function(res) {
      if (res.data) setTasks(res.data);
    });
    supabase.from("leads").select("*").is("archived_at", null).then(function(res) {
      if (res.data) setLeads(res.data);
      setLoading(false);
    });
  }

  useEffect(function() {
    load();
    var interval = setInterval(load, 30000);
    var ch = supabase.channel("sean-rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"tasks" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"leads" }, load)
      .subscribe();
    return function() { clearInterval(interval); supabase.removeChannel(ch); };
  }, []);

  function markDone(id) {
    var original = tasks.find(function(t) { return t.id === id; });
    supabase.from("tasks").update({ status:"Done", actual_date:TODAY() }).eq("id", id).then(function() {
      if (original) {
        supabase.from("task_history").insert([{ task_id:id, changed_by:"Sean", entry_type:"status_change", old_status:original.status, new_status:"Done", note:null }]);
      }
      load();
    });
  }

  function saveEdit(form) {
    var original = editingTask;
    supabase.from("tasks").update({
      status: form.status,
      expected_date: form.expected_date,
      next_action: form.next_action,
      notes: form.notes,
      actual_date: form.status === "Done" ? TODAY() : null,
    }).eq("id", original.id).then(function() {
      if (original.status !== form.status) {
        supabase.from("task_history").insert([{ task_id:original.id, changed_by:"Sean", entry_type:"status_change", old_status:original.status, new_status:form.status, note:null }]);
      }
      if (original.notes !== form.notes) {
        if (original.notes && original.notes.trim()) {
          supabase.from("task_history").insert([{ task_id:original.id, changed_by:"Sean", entry_type:"note", old_status:null, new_status:null, note:"[Previous note] " + original.notes.trim() }]);
        }
        if (form.notes && form.notes.trim()) {
          supabase.from("task_history").insert([{ task_id:original.id, changed_by:"Sean", entry_type:"note", old_status:null, new_status:null, note:form.notes.trim() }]);
        }
      }
      setEditingTask(null);
      load();
    });
  }

  var seanActive = tasks.filter(function(t) { return t.owner === "Sean" && isOpenTask(t); });
  // "Today": only what needs Sean personally — delegated and monitored work stays off this list.
  var today = TODAY();
  var seanAction = seanActive.filter(function(t) { return stateOf(t) === "Our action"; });
  var tOverdue = sortByUrgency(seanAction.filter(isOverdue));
  var tToday = sortByUrgency(seanAction.filter(function(t) { return t.expected_date === today; }));
  var tFollow = sortByUrgency(seanActive.filter(function(t) { return stateOf(t) === "Awaiting response" && ["overdue","today"].includes(dueBucket(actionDate(t), today)); }));
  var oppsForSean = leads.filter(function(o) { return isActiveLead(o) && (o.next_action_owner === "Sean" || (!o.next_action_owner && o.owner === "Sean")) && stageOf(o) !== "On Hold / Nurture"; })
    .sort(function(a, b) { return (leadFollowUp(a) || "9999") > (leadFollowUp(b) || "9999") ? 1 : -1; });
  var oppsDue = oppsForSean.filter(function(o) { return ["overdue","today","week"].includes(dueBucket(leadFollowUp(o), today)); });
  var followTab = sortByUrgency(seanActive.filter(function(t) { return stateOf(t) === "Awaiting response"; }));
  var decide = sortByUrgency(tasks.filter(function(t) { return isOpenTask(t) && (t.needs_review || "").indexOf("Sean to decide:") === 0; }));
  var mine = sortByUrgency(seanAction.filter(function(t) { return !isOverdue(t) && t.expected_date !== today; }));
  var doneRecent = tasks.filter(function(t) { return t.owner === "Sean" && stateOf(t) === "Completed"; })
    .sort(function(a, b) { return String(b.completed_at || b.actual_date || "").localeCompare(String(a.completed_at || a.actual_date || "")); }).slice(0, 40);

  // Same idea as the main hub: Today · Decide · Mine · Waiting · Deals · Done
  var TABS = [
    { id:"today", emoji:"☀️", label:"Today", count: tOverdue.length + tToday.length + tFollow.length },
    { id:"decide", emoji:"❓", label:"Decide", count: decide.length },
    { id:"mine", emoji:"🟠", label:"Mine", count: mine.length },
    { id:"follow", emoji:"⏳", label:"Waiting", count: followTab.length },
    { id:"deals", emoji:"🎯", label:"Deals", count: oppsDue.length },
    { id:"done", emoji:"✅", label:"Done", count: 0 },
  ];

  var s = {
    page: { minHeight:"100vh", background:"#0a2432", color:"#e2e8f0", fontFamily:"system-ui,sans-serif", paddingBottom:40 },
    header: { background:"#08202c", padding:"12px 16px", borderBottom:"1px solid #10364a", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 },
    tabs: { display:"flex", borderBottom:"1px solid #10364a", background:"#08202c", position:"sticky", top:49, zIndex:99 },
    content: { padding:"12px" },
    sectionLabel: { fontSize:10, fontWeight:700, color:"#7f93a1", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8, marginTop:4 },
    empty: { textAlign:"center", padding:"48px 0", color:"#557080" },
  };

  function tabStyle(active) {
    return { flex:1, padding:"10px 4px", border:"none", borderBottom:"2px solid " + (active ? "#118fb5" : "transparent"), background:"none", color: active ? "#118fb5" : "#7f93a1", fontSize:11, fontWeight: active ? 700 : 400, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2 };
  }

  function badgeColor(id) {
    if (id === "decide") return "#f97316";
    if (id === "mine" || id === "follow") return "#1b4a60";
    return "#ef4444";
  }

  if (loading) return <div style={Object.assign({}, s.page, { display:"flex", alignItems:"center", justifyContent:"center" })}><div style={{ color:"#118fb5" }}>Loading...</div></div>;

  return (
    <div style={s.page}>
      <style>{"@keyframes hubGlow{0%,100%{box-shadow:0 0 6px 1px rgba(239,68,68,.35)}50%{box-shadow:0 0 16px 4px rgba(239,68,68,.45)}}.hub-glow{animation:hubGlow 2.2s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.hub-glow{animation:none;box-shadow:0 0 0 2px rgba(239,68,68,.6)}}"}</style>
      <div style={s.header}>
        <HubLogo size={0.7} sub={null} />
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#e2e8f0" }}>
            {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 17 ? "Afternoon" : "Evening"}, Sean
          </div>
          <div style={{ fontSize:10, color:"#6a8090" }}>{new Date().toLocaleDateString("en-GB", { weekday:"short", day:"2-digit", month:"short" })}</div>
        </div>
      </div>

      <div style={s.tabs}>
        {TABS.map(function(tab) {
          return (
            <button key={tab.id} onClick={function() { setActiveTab(tab.id); }} style={tabStyle(activeTab === tab.id)}>
              <span style={{ fontSize:16 }}>{tab.emoji}</span>
              <span style={{ fontSize:10 }}>{tab.label}</span>
              {tab.count > 0 && <span style={{ background: badgeColor(tab.id), color:"#fff", borderRadius:99, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{tab.count}</span>}
            </button>
          );
        })}
      </div>

      <div style={s.content}>

        {activeTab === "today" && (
          <div>
            <div style={{ background:"#0e2d3e", border:"1px solid #1b4a60", borderRadius:12, padding:"12px 14px", marginBottom:14, fontSize:14, color:"#e2e8f0", lineHeight:1.5 }}>
              {tOverdue.length + tToday.length + decide.length + tFollow.length + oppsDue.length === 0
                ? "Nothing needs you right now. 🎉"
                : <span><b style={{ color: tOverdue.length ? "#fca5a5" : "#e2e8f0" }}>{tOverdue.length} overdue</b> · {tToday.length} due today · {decide.length} for your decision · {tFollow.length} follow-ups due · {oppsDue.length} deals to move</span>}
            </div>
            <button onClick={function() { setShowNote(true); }} style={{ width:"100%", minHeight:46, background:"#1e3a8a33", border:"1px solid #1e3a8a", borderRadius:10, color:"#93c5fd", fontSize:14, fontWeight:600, marginBottom:16 }}>📝 Quick note to Vanya</button>
            {tOverdue.length > 0 && <div><div style={Object.assign({}, s.sectionLabel, { color:"#fca5a5" })}>⚠ Overdue</div>{tOverdue.map(function(t) { return <TaskCard key={t.id} task={t} onEdit={setEditingTask} onDone={markDone} />; })}</div>}
            {tToday.length > 0 && <div><div style={s.sectionLabel}>📅 Due today</div>{tToday.map(function(t) { return <TaskCard key={t.id} task={t} onEdit={setEditingTask} onDone={markDone} />; })}</div>}
            {decide.length > 0 && <button onClick={function() { setActiveTab("decide"); }} style={{ width:"100%", minHeight:46, background:"#f9731622", border:"1px solid #f97316", borderRadius:10, color:"#fdba74", fontSize:14, fontWeight:700, marginBottom:14 }}>❓ {decide.length} question{decide.length === 1 ? "" : "s"} waiting for your decision →</button>}
            {tFollow.length > 0 && <div><div style={s.sectionLabel}>🏌️ Follow-ups due — no reply yet</div>{tFollow.map(function(t) { return <TaskCard key={t.id} task={t} onEdit={setEditingTask} onDone={markDone} />; })}</div>}
            {oppsDue.length > 0 && <div><div style={s.sectionLabel}>🎯 Deals needing you this week</div>{oppsDue.map(function(o) { return <OppRow key={o.id} o={o} onOpen={setOpenOpp} />; })}</div>}
          </div>
        )}

        {activeTab === "deals" && (
          <div>
            <div style={s.sectionLabel}>🎯 Your opportunities ({oppsForSean.length})</div>
            {oppsForSean.length === 0 ? <div style={s.empty}><div style={{ fontSize:13 }}>No open deals assigned to you</div></div> : oppsForSean.map(function(o) { return <OppRow key={o.id} o={o} onOpen={setOpenOpp} />; })}
          </div>
        )}

        {activeTab === "decide" && (
          <div>
            <div style={s.sectionLabel}>❓ Questions only you can answer ({decide.length})</div>
            {decide.length === 0
              ? <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>🎉</div><div style={{ fontSize:13 }}>Nothing waiting on your decision</div></div>
              : decide.map(function(t) { return <TaskCard key={t.id} task={t} onEdit={setEditingTask} onDone={markDone} showOwner />; })}
          </div>
        )}

        {activeTab === "mine" && (
          <div>
            <div style={s.sectionLabel}>🟠 Your other open actions ({mine.length})</div>
            {mine.length === 0
              ? <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>🎉</div><div style={{ fontSize:13 }}>All clear!</div></div>
              : mine.map(function(t) { return <TaskCard key={t.id} task={t} onEdit={setEditingTask} onDone={markDone} />; })}
          </div>
        )}

        {activeTab === "follow" && (
          <div>
            <div style={s.sectionLabel}>🏌️ Following Up</div>
            {followTab.length === 0
              ? <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>🏌️</div><div style={{ fontSize:13 }}>No follow ups</div></div>
              : followTab.map(function(t) { return <TaskCard key={t.id} task={t} onEdit={setEditingTask} onDone={markDone} />; })
            }
          </div>
        )}

        {activeTab === "done" && (
          <div>
            <div style={s.sectionLabel}>✅ Recently completed</div>
            {doneRecent.length === 0 && <div style={s.empty}><div style={{ fontSize:13 }}>Nothing completed yet</div></div>}
            <div style={{ border:"1px solid #10364a", borderRadius:10, overflow:"hidden" }}>
              {doneRecent.map(function(t) {
                return (
                  <div key={t.id} style={{ display:"flex", gap:8, alignItems:"center", padding:"8px 12px", borderBottom:"1px solid #10364a", fontSize:12, color:"#6a8090" }}>
                    <span style={{ color:"#10b981" }}>✓</span>
                    <span style={{ flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#9ca3af" }}>{t.subject}</span>
                    <span style={{ flexShrink:0 }}>{fmtDate(String(t.completed_at || t.actual_date || "").slice(0, 10))}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {editingTask && <EditSheet task={editingTask} onSave={saveEdit} onClose={function() { setEditingTask(null); }} />}
      {openOpp && <OppSheet opp={openOpp} onClose={function() { setOpenOpp(null); }} onSaved={function() { setOpenOpp(null); load(); }} />}
      {showNote && <NoteSheet onClose={function() { setShowNote(false); }} />}
    </div>
  );
}
