import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const TODAY = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";
const fmtDateTime = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
const isOverdue = (t) => t.status !== "Done" && t.expected_date && t.expected_date < TODAY();

const STATUS_COLOR = { "To Do": "#ef4444", "FYA": "#f97316", "Follow Up": "#10b981", "FYI": "#8b5cf6", "Done": "#0891b2" };
const STATUS_EMOJI = { "To Do": "🔴", "FYA": "🟠", "Follow Up": "🏌️", "FYI": "🟣", "Done": "✅" };
const STATUSES = ["To Do", "FYA", "Follow Up", "FYI", "Done"];
const URGENCY_COLOR = { Low: "#6b7280", Medium: "#0891b2", High: "#f59e0b", Urgent: "#ef4444" };
const PRIORITY_ORDER = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

const STRATEGIC_PROJECTS = [
  { name: "UPD", color: "#0891b2" },
  { name: "CJ Distribution", color: "#f97316" },
  { name: "Adcock Ingram", color: "#8b5cf6" },
  { name: "Strategnos", color: "#10b981" },
  { name: "Financial & Management Structure", color: "#f59e0b" },
  { name: "EuroPOS", color: "#3b82f6" },
  { name: "James / Systems Development", color: "#ec4899" },
  { name: "Tower Cold Chain / TBB", color: "#14b8a6" },
  { name: "Andrea & Jason – Operational Leadership Transition", color: "#a78bfa" },
  { name: "Opportunity Mapping / Sales Pipeline", color: "#ef4444" },
  { name: "Second Level Solutions", color: "#6366f1" },
  { name: "Leadership Transition", color: "#d97706" },
];

const SPECIAL_ACCOUNTS = [
  { key: "finance", label: "💰 Finance", color: "#10b981" },
  { key: "personal", label: "👤 Personal", color: "#8b5cf6" },
];
const specialKeys = ["finance", "personal"];
const normKey = (s) => (s || "").trim().toLowerCase();

const inp = { background:"#1e1e30", border:"1px solid #2a2a45", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };

function sortByUrgency(arr) {
  return [...arr].sort((a, b) => {
    const aOver = isOverdue(a) ? 0 : 1;
    const bOver = isOverdue(b) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    const ap = PRIORITY_ORDER[a.priority] !== undefined ? PRIORITY_ORDER[a.priority] : 2;
    const bp = PRIORITY_ORDER[b.priority] !== undefined ? PRIORITY_ORDER[b.priority] : 2;
    if (ap !== bp) return ap - bp;
    return (a.expected_date || "9999") > (b.expected_date || "9999") ? 1 : -1;
  });
}

function TaskCard({ task, onEdit, onDone }) {
  var over = isOverdue(task);
  var borderColor = STATUS_COLOR[task.status] || "#2a2a45";
  return (
    <div style={{ background:"#1a1a2e", border:"1px solid " + (over ? "#7f1d1d" : "#2a2a45"), borderLeft:"3px solid " + borderColor, borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:4 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#e2e8f0", lineHeight:1.3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{task.subject}</div>
          <div style={{ fontSize:11, color: over ? "#fca5a5" : "#6b7280", marginTop:2 }}>
            {task.company ? task.company + " · " : ""}{over ? "⚠ " : ""}Due {fmtDate(task.expected_date)}
            {task.priority === "Urgent" && <span style={{ marginLeft:6, background:"#ef444422", color:"#ef4444", borderRadius:99, padding:"1px 6px", fontSize:10, fontWeight:700 }}>URGENT</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0, alignItems:"center" }}>
          <button onClick={function() { onEdit(task); }} style={{ padding:"5px 10px", background:"#0891b222", border:"1px solid #0891b2", borderRadius:6, color:"#0891b2", fontSize:12, fontWeight:600, cursor:"pointer" }}>✎</button>
          <button onClick={function() { onDone(task.id); }} style={{ padding:"5px 10px", background:"#10b98122", border:"1px solid #10b981", borderRadius:6, color:"#10b981", fontSize:12, fontWeight:600, cursor:"pointer" }}>✓</button>
        </div>
      </div>
      {task.next_action && <div style={{ fontSize:12, color:"#0891b2", marginTop:2 }}>→ {task.next_action}</div>}
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
      <div style={{ background:"#13131f", borderRadius:"16px 16px 0 0", padding:"20px 16px 32px", width:"100%", maxHeight:"80vh", overflowY:"auto" }} onClick={function(e) { e.stopPropagation(); }}>
        <div style={{ width:36, height:4, background:"#2a2a45", borderRadius:99, margin:"0 auto 16px" }} />
        <div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0", marginBottom:4, lineHeight:1.3 }}>{task.subject}</div>
        <div style={{ fontSize:11, color:"#4b5563", marginBottom:16 }}>{task.company || ""}{task.client ? " · " + task.client : ""}</div>
        <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>Status</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
          {STATUSES.map(function(st) {
            return (
              <button key={st} onClick={function() { set("status", st); }}
                style={{ padding:"6px 12px", borderRadius:99, border:"1px solid " + (form.status===st ? STATUS_COLOR[st] : "#2a2a45"), background:form.status===st ? STATUS_COLOR[st]+"33" : "none", color:form.status===st ? STATUS_COLOR[st] : "#6b7280", cursor:"pointer", fontSize:12, fontWeight:form.status===st ? 700 : 400 }}>
                {STATUS_EMOJI[st]} {st}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Follow Up Date</div>
        <input type="date" value={form.expected_date} onChange={function(e) { set("expected_date", e.target.value); }} style={Object.assign({}, inp, { marginBottom:12, fontSize:13 })} />
        <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Next Action</div>
        <input value={form.next_action} onChange={function(e) { set("next_action", e.target.value); }} placeholder="What needs to happen next?" style={Object.assign({}, inp, { marginBottom:12, fontSize:13 })} />
        <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Notes</div>
        <textarea value={form.notes} onChange={function(e) { set("notes", e.target.value); }} placeholder="Add a note..." style={Object.assign({}, inp, { minHeight:80, resize:"vertical", marginBottom:16, fontSize:13 })} />
        <button onClick={function() { onSave(form); }} style={{ width:"100%", padding:"13px", background:"#0891b2", border:"none", borderRadius:10, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>
          Save
        </button>
      </div>
    </div>
  );
}

function ProjectList({ tasks, onSelect }) {
  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>📋 Strategic Workstreams</div>
      {STRATEGIC_PROJECTS.map(function(proj) {
        var pt = tasks.filter(function(t) { return t.project === proj.name; });
        var ptActive = pt.filter(function(t) { return t.status !== "Done"; }).length;
        var ptDone = pt.filter(function(t) { return t.status === "Done"; }).length;
        var ptTotal = pt.length;
        var ptOverdue = pt.filter(isOverdue).length;
        var ptProgress = ptTotal > 0 ? Math.round((ptDone / ptTotal) * 100) : 0;
        return (
          <div key={proj.name} onClick={function() { onSelect(proj.name); }}
            style={{ background:"#1a1a2e", border:"1px solid #2a2a45", borderTop:"2px solid "+proj.color, borderRadius:10, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ flex:1, minWidth:0, paddingRight:8 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0", lineHeight:1.3, marginBottom:3 }}>{proj.name}</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {ptActive > 0 && <span style={{ fontSize:11, color:"#9ca3af" }}>{ptActive} active</span>}
                  {ptOverdue > 0 && <span style={{ fontSize:11, color:"#fca5a5" }}>⚠ {ptOverdue} overdue</span>}
                  {ptTotal === 0 && <span style={{ fontSize:11, color:"#374151" }}>No tasks yet</span>}
                  {ptActive === 0 && ptTotal > 0 && <span style={{ fontSize:11, color:"#10b981" }}>✅ Done</span>}
                </div>
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:proj.color, flexShrink:0 }}>{ptProgress}%</span>
            </div>
            <div style={{ height:3, background:"#2a2a45", borderRadius:99, overflow:"hidden" }}>
              <div style={{ height:"100%", width:ptProgress+"%", background:proj.color, borderRadius:99 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectDetail({ projectName, tasks, statusFilter, onFilterChange, onBack, onEdit, onDone }) {
  var proj = STRATEGIC_PROJECTS.find(function(p) { return p.name === projectName; }) || { name: projectName, color: "#0891b2" };
  var projTasks = tasks.filter(function(t) { return t.project === projectName; });
  var PROJ_FILTERS = ["All", "To Do", "FYA", "Follow Up", "FYI", "Overdue"];
  var filtered = sortByUrgency(projTasks.filter(function(t) {
    if (statusFilter === "All") return t.status !== "Done";
    if (statusFilter === "Overdue") return isOverdue(t);
    return t.status === statusFilter;
  }));
  var projDone = projTasks.filter(function(t) { return t.status === "Done"; }).length;
  var projTotal = projTasks.length;
  var projProgress = projTotal > 0 ? Math.round((projDone / projTotal) * 100) : 0;
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#9ca3af", cursor:"pointer", fontSize:20, padding:"4px 8px 4px 0" }}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:800, color:"#e2e8f0", lineHeight:1.2 }}>{proj.name}</div>
          <div style={{ fontSize:11, color:"#6b7280" }}>{projDone}/{projTotal} done · {projProgress}%</div>
        </div>
      </div>
      <div style={{ height:4, background:"#2a2a45", borderRadius:99, overflow:"hidden", marginBottom:12 }}>
        <div style={{ height:"100%", width:projProgress+"%", background:proj.color, borderRadius:99 }} />
      </div>
      <div style={{ display:"flex", gap:5, overflowX:"auto", marginBottom:12, paddingBottom:2 }}>
        {PROJ_FILTERS.map(function(f) {
          var cnt = f === "All" ? projTasks.filter(function(t) { return t.status !== "Done"; }).length
            : f === "Overdue" ? projTasks.filter(isOverdue).length
            : projTasks.filter(function(t) { return t.status === f; }).length;
          var isAct = statusFilter === f;
          var col = f === "Overdue" ? "#ef4444" : f === "All" ? proj.color : (STATUS_COLOR[f] || proj.color);
          return (
            <button key={f} onClick={function() { onFilterChange(f); }}
              style={{ flexShrink:0, padding:"5px 10px", borderRadius:99, border:"1px solid "+(isAct ? col : "#2a2a45"), background:isAct ? col+"33" : "none", color:isAct ? col : "#6b7280", cursor:"pointer", fontSize:11, fontWeight:isAct ? 700 : 400 }}>
              {f} {cnt > 0 && <span style={{ background:"rgba(255,255,255,0.15)", borderRadius:99, padding:"0 4px", fontSize:10 }}>{cnt}</span>}
            </button>
          );
        })}
      </div>
      {filtered.length === 0
        ? <div style={{ textAlign:"center", padding:"48px 0", color:"#374151" }}><div style={{ fontSize:28, marginBottom:8 }}>📋</div><div style={{ fontSize:13 }}>No tasks here</div></div>
        : filtered.map(function(t) { return <TaskCard key={t.id} task={t} onEdit={onEdit} onDone={onDone} />; })
      }
    </div>
  );
}

export default function Sean() {
  var [tasks, setTasks] = useState([]);
  var [flags, setFlags] = useState([]);
  var [loading, setLoading] = useState(true);
  var [activeTab, setActiveTab] = useState("todo");
  var [editingTask, setEditingTask] = useState(null);
  var [selectedAccount, setSelectedAccount] = useState(null);
  var [accountFilter, setAccountFilter] = useState("All");
  var [accountSearch, setAccountSearch] = useState("");
  var [selectedProject, setSelectedProject] = useState(null);
  var [projectStatusFilter, setProjectStatusFilter] = useState("All");

  function load() {
    supabase.from("tasks").select("*").order("created_at", { ascending: false }).then(function(res) {
      if (res.data) setTasks(res.data);
    });
    supabase.from("flags").select("*").order("created_at", { ascending: false }).then(function(res) {
      if (res.data) setFlags(res.data);
      setLoading(false);
    });
  }

  useEffect(function() {
    load();
    var interval = setInterval(load, 30000);
    var ch = supabase.channel("sean-rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"tasks" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"flags" }, load)
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

  function markFlagSeen(id) {
    supabase.from("flags").update({ seen:true }).eq("id", id).then(load);
  }

  function markAllFlagsSeen() {
    var unseen = regularFlags.filter(function(f) { return !f.seen; });
    Promise.all(unseen.map(function(f) { return supabase.from("flags").update({ seen:true }).eq("id", f.id); })).then(load);
  }

  function deleteReport(id) {
    supabase.from("flags").delete().eq("id", id).then(load);
  }

  var seanActive = tasks.filter(function(t) { return t.owner === "Sean" && t.status !== "Done"; });
  var todoTab = sortByUrgency(seanActive.filter(function(t) { return t.status === "FYA" || t.status === "To Do"; }));
  var followTab = sortByUrgency(seanActive.filter(function(t) { return t.status === "Follow Up"; }));
  var regularFlags = flags.filter(function(f) { return f.task_subject !== "Weekly Customer Report"; });
  var weeklyReports = flags.filter(function(f) { return f.task_subject === "Weekly Customer Report"; });
  var unseenFlags = regularFlags.filter(function(f) { return !f.seen; });
  var unreadReports = weeklyReports.filter(function(f) { return !f.seen; });
  var activeProjectTasks = tasks.filter(function(t) { return t.project && t.status !== "Done"; }).length;

  var getDisplayName = function(key) {
    var found = tasks.find(function(t) { return normKey(t.company) === key && t.company && t.company.trim(); });
    return found ? found.company.trim() : key;
  };
  var companyKeys = Array.from(new Set(tasks.map(function(t) { return normKey(t.company); }).filter(function(k) { return k && !specialKeys.includes(k); }))).sort();
  var allAccounts = SPECIAL_ACCOUNTS.concat(companyKeys.map(function(k) { return { key: k, label: getDisplayName(k), color: "#0891b2" }; }));

  function getAccountTasks(key) {
    return tasks.filter(function(t) { return normKey(t.company) === key; });
  }

  var TABS = [
    { id:"todo", emoji:"🔴", label:"To Do", count: todoTab.length },
    { id:"follow", emoji:"🏌️", label:"Follow", count: followTab.length },
    { id:"accounts", emoji:"🏢", label:"Accounts", count: 0 },
    { id:"projects", emoji:"📋", label:"Projects", count: activeProjectTasks },
    { id:"flags", emoji:"🚨", label:"Flags", count: unseenFlags.length },
    { id:"reports", emoji:"📊", label:"Reports", count: unreadReports.length },
  ];

  var s = {
    page: { minHeight:"100vh", background:"#0d0d1a", color:"#e2e8f0", fontFamily:"system-ui,sans-serif", paddingBottom:40 },
    header: { background:"#0a0a16", padding:"12px 16px", borderBottom:"1px solid #1e1e30", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 },
    tabs: { display:"flex", borderBottom:"1px solid #1e1e30", background:"#0a0a16", position:"sticky", top:49, zIndex:99 },
    content: { padding:"12px" },
    sectionLabel: { fontSize:10, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8, marginTop:4 },
    empty: { textAlign:"center", padding:"48px 0", color:"#374151" },
  };

  function tabStyle(active) {
    return { flex:1, padding:"10px 4px", border:"none", borderBottom:"2px solid " + (active ? "#0891b2" : "transparent"), background:"none", color: active ? "#0891b2" : "#6b7280", fontSize:11, fontWeight: active ? 700 : 400, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2 };
  }

  function badgeColor(id) {
    if (id === "reports") return "#3b82f6";
    if (id === "accounts") return "#0891b2";
    if (id === "projects") return "#d97806";
    return "#ef4444";
  }

  if (loading) return <div style={Object.assign({}, s.page, { display:"flex", alignItems:"center", justifyContent:"center" })}><div style={{ color:"#0891b2" }}>Loading...</div></div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <img src="https://esbd.co.za/wp-content/uploads/2024/07/4.png" alt="ESBD" style={{ width:70 }} />
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#e2e8f0" }}>
            {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 17 ? "Afternoon" : "Evening"}, Sean
          </div>
          <div style={{ fontSize:10, color:"#4b5563" }}>{new Date().toLocaleDateString("en-GB", { weekday:"short", day:"2-digit", month:"short" })}</div>
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

        {activeTab === "todo" && (
          <div>
            {todoTab.length === 0
              ? <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>🎉</div><div style={{ fontSize:13 }}>All clear!</div></div>
              : <div>
                  {todoTab.filter(function(t) { return t.status === "FYA"; }).length > 0 && (
                    <div>
                      <div style={s.sectionLabel}>🟠 For Your Attention</div>
                      {todoTab.filter(function(t) { return t.status === "FYA"; }).map(function(t) { return <TaskCard key={t.id} task={t} onEdit={setEditingTask} onDone={markDone} />; })}
                    </div>
                  )}
                  {todoTab.filter(function(t) { return t.status === "To Do"; }).length > 0 && (
                    <div>
                      <div style={Object.assign({}, s.sectionLabel, { marginTop: todoTab.filter(function(t) { return t.status === "FYA"; }).length > 0 ? 12 : 4 })}>🔴 To Do</div>
                      {todoTab.filter(function(t) { return t.status === "To Do"; }).map(function(t) { return <TaskCard key={t.id} task={t} onEdit={setEditingTask} onDone={markDone} />; })}
                    </div>
                  )}
                </div>
            }
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

        {activeTab === "accounts" && !selectedAccount && (
          <div>
            <div style={{ position:"relative", marginBottom:10 }}>
              <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#4b5563", fontSize:13 }}>🔍</span>
              <input value={accountSearch} onChange={function(e) { setAccountSearch(e.target.value); }} placeholder="Search accounts..."
                style={Object.assign({}, inp, { paddingLeft:32, fontSize:13, padding:"7px 10px 7px 32px" })} />
            </div>
            {allAccounts.filter(function(a) { return !accountSearch.trim() || a.label.toLowerCase().includes(accountSearch.toLowerCase()); }).map(function(account) {
              var total = getAccountTasks(account.key).length;
              var active = getAccountTasks(account.key).filter(function(t) { return t.status !== "Done"; }).length;
              var overdue = getAccountTasks(account.key).filter(isOverdue).length;
              var urgent = getAccountTasks(account.key).filter(function(t) { return t.priority === "Urgent" && t.status !== "Done"; }).length;
              if (total === 0 && !specialKeys.includes(account.key)) return null;
              return (
                <div key={account.key} onClick={function() { setSelectedAccount(account); setAccountFilter("All"); }}
                  style={{ background:"#1a1a2e", border:"1px solid #2a2a45", borderLeft:"3px solid " + account.color, borderRadius:10, padding:"12px 14px", marginBottom:8, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#e2e8f0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginBottom:3 }}>{account.label}</div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {active > 0 && <span style={{ fontSize:11, color:"#9ca3af" }}>{active} active</span>}
                      {overdue > 0 && <span style={{ fontSize:11, color:"#fca5a5" }}>⚠ {overdue} overdue</span>}
                      {urgent > 0 && <span style={{ fontSize:11, color:"#f59e0b" }}>🔴 {urgent} urgent</span>}
                      {active === 0 && total > 0 && <span style={{ fontSize:11, color:"#10b981" }}>✅ All done</span>}
                      {total === 0 && <span style={{ fontSize:11, color:"#374151" }}>No tasks yet</span>}
                    </div>
                  </div>
                  <span style={{ color:"#4b5563", fontSize:16, marginLeft:8 }}>›</span>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "accounts" && selectedAccount && (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <button onClick={function() { setSelectedAccount(null); setAccountFilter("All"); }}
                style={{ background:"none", border:"none", color:"#9ca3af", cursor:"pointer", fontSize:20, padding:"4px 8px 4px 0" }}>←</button>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:800, color:"#e2e8f0" }}>{selectedAccount.label}</div>
                <div style={{ fontSize:11, color:"#6b7280" }}>
                  {getAccountTasks(selectedAccount.key).filter(function(t) { return t.status !== "Done"; }).length} active · {getAccountTasks(selectedAccount.key).filter(isOverdue).length} overdue
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:5, overflowX:"auto", marginBottom:12, paddingBottom:4 }}>
              {["All", "To Do", "FYA", "Follow Up", "FYI", "Overdue", "Urgent"].map(function(f) {
                var acctTasks = getAccountTasks(selectedAccount.key);
                var count = f === "All" ? acctTasks.filter(function(t) { return t.status !== "Done"; }).length
                  : f === "Overdue" ? acctTasks.filter(isOverdue).length
                  : f === "Urgent" ? acctTasks.filter(function(t) { return t.priority === "Urgent" && t.status !== "Done"; }).length
                  : acctTasks.filter(function(t) { return t.status === f; }).length;
                var active = accountFilter === f;
                var color = f === "Overdue" ? "#ef4444" : f === "Urgent" ? "#f59e0b" : f === "All" ? "#0891b2" : (STATUS_COLOR[f] || "#0891b2");
                return (
                  <button key={f} onClick={function() { setAccountFilter(f); }}
                    style={{ flexShrink:0, padding:"5px 10px", borderRadius:99, border:"1px solid " + (active ? color : "#2a2a45"), background:active ? color+"33" : "none", color:active ? color : "#6b7280", cursor:"pointer", fontSize:11, fontWeight:active ? 700 : 400, display:"flex", alignItems:"center", gap:4 }}>
                    {f}
                    {count > 0 && <span style={{ background:"rgba(255,255,255,0.15)", borderRadius:99, padding:"0 5px", fontSize:10 }}>{count}</span>}
                  </button>
                );
              })}
            </div>
            {sortByUrgency(getAccountTasks(selectedAccount.key).filter(function(t) {
              if (accountFilter === "All") return t.status !== "Done";
              if (accountFilter === "Overdue") return isOverdue(t);
              if (accountFilter === "Urgent") return t.priority === "Urgent" && t.status !== "Done";
              return t.status === accountFilter;
            })).map(function(t) { return <TaskCard key={t.id} task={t} onEdit={setEditingTask} onDone={markDone} />; })}
          </div>
        )}

        {activeTab === "projects" && !selectedProject && (
          <ProjectList tasks={tasks} onSelect={function(name) { setSelectedProject(name); setProjectStatusFilter("All"); }} />
        )}

        {activeTab === "projects" && selectedProject && (
          <ProjectDetail
            projectName={selectedProject}
            tasks={tasks}
            statusFilter={projectStatusFilter}
            onFilterChange={setProjectStatusFilter}
            onBack={function() { setSelectedProject(null); }}
            onEdit={setEditingTask}
            onDone={markDone}
          />
        )}

        {activeTab === "flags" && (
          <div>
            {unseenFlags.length > 0 && (
              <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10 }}>
                <button onClick={markAllFlagsSeen} style={{ padding:"5px 12px", background:"#10b98122", border:"1px solid #10b981", borderRadius:6, color:"#10b981", cursor:"pointer", fontSize:12, fontWeight:600 }}>✓ All seen</button>
              </div>
            )}
            {unseenFlags.length === 0 && flags.filter(function(f) { return f.seen && f.task_subject !== "Weekly Customer Report"; }).length === 0 && (
              <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>✅</div><div style={{ fontSize:13 }}>No flags</div></div>
            )}
            {unseenFlags.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={s.sectionLabel}>⚠️ Needs Attention</div>
                {unseenFlags.map(function(f) {
                  return (
                    <div key={f.id} style={{ background:"#1a1a2e", border:"1px solid " + URGENCY_COLOR[f.urgency]+"44", borderLeft:"3px solid " + URGENCY_COLOR[f.urgency], borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99, background:URGENCY_COLOR[f.urgency]+"33", color:URGENCY_COLOR[f.urgency], fontWeight:700 }}>{f.urgency}</span>
                          <span style={{ fontSize:11, color:"#9ca3af" }}>{f.from_name}</span>
                        </div>
                        <span style={{ fontSize:10, color:"#4b5563" }}>{fmtDateTime(f.created_at)}</span>
                      </div>
                      {f.task_subject && f.task_subject !== "General flag" && <div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>Re: {f.task_subject}</div>}
                      <div style={{ fontSize:13, color:"#e2e8f0", lineHeight:1.5, marginBottom:10 }}>{f.note}</div>
                      <button onClick={function() { markFlagSeen(f.id); }} style={{ width:"100%", padding:"9px", background:"#10b98122", border:"1px solid #10b981", borderRadius:8, color:"#10b981", fontSize:12, fontWeight:700, cursor:"pointer" }}>Got it</button>
                    </div>
                  );
                })}
              </div>
            )}
            {flags.filter(function(f) { return f.seen && f.task_subject !== "Weekly Customer Report"; }).slice(0,5).map(function(f) {
              return (
                <div key={f.id} style={{ background:"#13131f", border:"1px solid #1e1e30", borderLeft:"3px solid #374151", borderRadius:10, padding:"10px 12px", marginBottom:6, opacity:0.6 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                    <span style={{ fontSize:11, color:"#4b5563" }}>{f.from_name} · {f.urgency}</span>
                    <span style={{ fontSize:10, color:"#374151" }}>{fmtDateTime(f.created_at)}</span>
                  </div>
                  <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.4 }}>{f.note}</div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "reports" && (
          <div>
            {weeklyReports.length === 0 && (
              <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>📊</div><div style={{ fontSize:13 }}>No reports yet</div></div>
            )}
            {unreadReports.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={s.sectionLabel}>New</div>
                {unreadReports.map(function(r) {
                  return (
                    <div key={r.id} style={{ background:"#1a1a2e", border:"1px solid #3b82f644", borderLeft:"3px solid #3b82f6", borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0" }}>from {r.from_name}</div>
                          <div style={{ fontSize:10, color:"#6b7280" }}>{fmtDateTime(r.created_at)}</div>
                        </div>
                        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                          <span style={{ fontSize:10, background:"#f97316", color:"#fff", borderRadius:99, padding:"2px 7px", fontWeight:700 }}>New</span>
                          <button onClick={function() { if(window.confirm("Delete?")) deleteReport(r.id); }}
                            style={{ background:"none", border:"1px solid #7f1d1d", borderRadius:6, color:"#ef4444", cursor:"pointer", padding:"3px 7px", fontSize:11 }}>🗑️</button>
                        </div>
                      </div>
                      <pre style={{ background:"#0a0a16", border:"1px solid #2a2a45", borderRadius:8, padding:10, color:"#e2e8f0", fontSize:11, whiteSpace:"pre-wrap", fontFamily:"system-ui", lineHeight:1.5, margin:"0 0 10px", overflowX:"auto" }}>{r.note}</pre>
                      <button onClick={function() { markFlagSeen(r.id); }} style={{ width:"100%", padding:"9px", background:"#10b98122", border:"1px solid #10b981", borderRadius:8, color:"#10b981", fontSize:12, fontWeight:700, cursor:"pointer" }}>Mark Read</button>
                    </div>
                  );
                })}
              </div>
            )}
            {weeklyReports.filter(function(r) { return r.seen; }).slice(0, 5).map(function(r) {
              return (
                <div key={r.id} style={{ background:"#13131f", border:"1px solid #1e1e30", borderLeft:"3px solid #374151", borderRadius:10, padding:"10px 12px", marginBottom:6, opacity:0.6 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontSize:12, color:"#6b7280", fontWeight:600 }}>from {r.from_name}</span>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <span style={{ fontSize:10, color:"#374151" }}>{fmtDateTime(r.created_at)}</span>
                      <button onClick={function() { if(window.confirm("Delete?")) deleteReport(r.id); }}
                        style={{ background:"none", border:"1px solid #7f1d1d", borderRadius:6, color:"#ef4444", cursor:"pointer", padding:"2px 6px", fontSize:10 }}>🗑️</button>
                    </div>
                  </div>
                  <pre style={{ background:"#0a0a16", border:"1px solid #1e1e30", borderRadius:8, padding:8, color:"#6b7280", fontSize:10, whiteSpace:"pre-wrap", fontFamily:"system-ui", lineHeight:1.5, margin:0, overflowX:"auto" }}>{r.note}</pre>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {editingTask && <EditSheet task={editingTask} onSave={saveEdit} onClose={function() { setEditingTask(null); }} />}
    </div>
  );
}
