import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const TODAY = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";
const fmtDateTime = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
const isOverdue = (t) => t.status !== "Done" && t.expected_date && t.expected_date < TODAY();

// Normalise company/client: trim + title case to prevent duplicates
const normaliseName = (s) => {
  if (!s || !s.trim()) return "";
  return s.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
};

const STATUS_COLOR = { "To Do": "#ef4444", "FYA": "#f97316", "Follow Up": "#10b981", "FYI": "#8b5cf6", "Done": "#0891b2" };
const STATUS_EMOJI = { "To Do": "🔴", "FYA": "🟠", "Follow Up": "🏌️", "FYI": "🟣", "Done": "✅" };
const STATUSES = ["To Do", "FYA", "Follow Up", "FYI", "Done"];
const URGENCY_COLOR = { Low: "#6b7280", Medium: "#0891b2", High: "#f59e0b", Urgent: "#ef4444" };
const PRIORITY_COLOR = { Low: "#6b7280", Medium: "#0891b2", High: "#f59e0b", Urgent: "#ef4444" };
const OWNERS = ["Vanya", "Sean", "Jason", "Andrea"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const TASK_TYPES = ["Quote", "Order Request", "Information Request", "Complaint", "Follow-up", "Internal Admin", "FYI"];

// Special pinned accounts
const SPECIAL_ACCOUNTS = [
  { key: "finance", label: "💰 Finance", color: "#10b981" },
  { key: "personal", label: "👤 Personal", color: "#8b5cf6" },
];

const inp = { background:"#1e1e30", border:"1px solid #2a2a45", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };

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

  const select = (name) => { onChange(name); setSearch(name); setOpen(false); };

  const openEdit = () => { setEditList([...companies]); setEditMode(true); setOpen(false); };

  const saveEdit = async () => {
    for (let i = 0; i < companies.length; i++) {
      if (companies[i] !== editList[i] && editList[i]?.trim()) {
        await supabase.from("tasks").update({ company: editList[i].trim() }).eq("company", companies[i]);
      }
    }
    setCompanies(editList.filter(Boolean));
    setEditMode(false);
  };

  if (editMode) return (
    <div style={{ background:"#1a1a2e", border:"1px solid #0891b2", borderRadius:8, padding:12 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#0891b2", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>✏️ Edit Company Names</div>
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
          style={{ background:"#0891b2", border:"none", borderRadius:6, color:"#fff", cursor:"pointer", padding:"6px 12px", fontSize:13, fontWeight:700 }}>+</button>
      </div>
      <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
        <button onClick={() => setEditMode(false)} style={{ padding:"6px 14px", background:"none", border:"1px solid #2a2a45", borderRadius:6, color:"#6b7280", cursor:"pointer", fontSize:12 }}>Cancel</button>
        <button onClick={saveEdit} style={{ padding:"6px 14px", background:"#0891b2", border:"none", borderRadius:6, color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700 }}>Save Changes</button>
      </div>
    </div>
  );

  return (
    <div style={{ position:"relative" }}>
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
              style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:14 }}>✕</button>
          )}
        </div>
        <button onClick={openEdit} title="Edit company list"
          style={{ background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:8, color:"#6b7280", cursor:"pointer", padding:"0 10px", fontSize:13, flexShrink:0 }}>✏️</button>
      </div>
      {open && (filtered.length > 0 || showAddNew) && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:8, zIndex:200, maxHeight:200, overflowY:"auto", marginTop:4, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
          {filtered.map(c => (
            <div key={c} onMouseDown={() => select(c)}
              style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, color:"#e2e8f0", borderBottom:"1px solid #2a2a4522" }}
              onMouseEnter={e => e.currentTarget.style.background = "#2a2a45"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              {c}
            </div>
          ))}
          {showAddNew && (
            <div onMouseDown={() => select(search.trim())}
              style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, color:"#0891b2", fontWeight:600, borderTop:"1px solid #2a2a45" }}
              onMouseEnter={e => e.currentTarget.style.background = "#0891b222"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              + Add "{search.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Sean() {
  const [tasks, setTasks] = useState([]);
  const [inboxTriage, setInboxTriage] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("fya");
  const [newInbox, setNewInbox] = useState("");
  const [newInboxAction, setNewInboxAction] = useState("Delete");
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({});
  // New task modal state
  const [newTaskModal, setNewTaskModal] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    subject:"", client:"", company:"", email:"",
    date_received: TODAY(), owner:"Sean", status:"To Do", priority:"Medium",
    expected_date:"", next_action:"", notes:"", task_type:"Information Request"
  });
  // Accounts state
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountStatusFilter, setAccountStatusFilter] = useState("All");

  const load = async () => {
    const { data: t } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    const { data: i } = await supabase.from("inbox_triage").select("*").order("created_at", { ascending: false });
    const { data: f } = await supabase.from("flags").select("*").order("created_at", { ascending: false });
    if (t) setTasks(t);
    if (i) setInboxTriage(i);
    if (f) setFlags(f);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    const ch = supabase.channel("sean-realtime")
      .on("postgres_changes", { event:"*", schema:"public", table:"tasks" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"flags" }, load)
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(ch); };
  }, []);

  const markDone = async (id) => {
    await supabase.from("tasks").update({ status: "Done", actual_date: TODAY() }).eq("id", id);
    load();
  };

  const saveEdit = async () => {
    const original = editingTask;
    const payload = {
      status: editForm.status,
      expected_date: editForm.expected_date,
      notes: editForm.notes,
      next_action: editForm.next_action,
      actual_date: editForm.status === "Done" ? TODAY() : null,
    };
    await supabase.from("tasks").update(payload).eq("id", original.id);

    // Log status change
    if (original.status !== editForm.status) {
      await supabase.from("task_history").insert([{
        task_id: original.id, changed_by: "Sean", entry_type: "status_change",
        old_status: original.status, new_status: editForm.status, note: null
      }]);
    }

    // Notes preservation — archive old note before overwriting
    if (original.notes !== editForm.notes) {
      if (original.notes && original.notes.trim()) {
        await supabase.from("task_history").insert([{
          task_id: original.id, changed_by: "Sean", entry_type: "note",
          old_status: null, new_status: null,
          note: "[Previous note] " + original.notes.trim()
        }]);
      }
      if (editForm.notes && editForm.notes.trim()) {
        await supabase.from("task_history").insert([{
          task_id: original.id, changed_by: "Sean", entry_type: "note",
          old_status: null, new_status: null, note: editForm.notes.trim()
        }]);
      }
    }

    setEditingTask(null);
    load();
  };

  const saveNewTask = async () => {
    if (!newTaskForm.subject || !newTaskForm.expected_date || !newTaskForm.next_action) return;
    const payload = {
      subject: newTaskForm.subject,
      client: normaliseName(newTaskForm.client),
      company: normaliseName(newTaskForm.company),
      email: newTaskForm.email,
      date_received: newTaskForm.date_received,
      owner: newTaskForm.owner,
      status: newTaskForm.status,
      priority: newTaskForm.priority,
      expected_date: newTaskForm.expected_date,
      next_action: newTaskForm.next_action,
      notes: newTaskForm.notes,
      task_type: newTaskForm.task_type,
      outcome: "",
      actual_date: null,
    };
    await supabase.from("tasks").insert([payload]);
    setNewTaskModal(false);
    setNewTaskForm({ subject:"", client:"", company:"", email:"", date_received:TODAY(), owner:"Sean", status:"To Do", priority:"Medium", expected_date:"", next_action:"", notes:"", task_type:"Information Request" });
    load();
  };

  const markFlagSeen = async (id) => {
    await supabase.from("flags").update({ seen: true }).eq("id", id);
    load();
  };

  const markAllFlagsSeen = async () => {
    const unseen = regularFlags.filter(f => !f.seen);
    for (const f of unseen) {
      await supabase.from("flags").update({ seen: true }).eq("id", f.id);
    }
    load();
  };

  const deleteReport = async (id) => {
    await supabase.from("flags").delete().eq("id", id);
    load();
  };

  const clearInbox = async (id) => {
    await supabase.from("inbox_triage").update({ cleared: true }).eq("id", id);
    load();
  };

  const addInboxItem = async () => {
    if (!newInbox.trim()) return;
    await supabase.from("inbox_triage").insert([{ subject: newInbox.trim(), action: newInboxAction }]);
    setNewInbox("");
    load();
  };

  const openEdit = (task) => {
    setEditingTask(task);
    setEditForm({
      status: task.status,
      expected_date: task.expected_date || "",
      notes: task.notes || "",
      next_action: task.next_action || "",
    });
  };

  // Accounts helpers
  const normKey = (s) => (s || "").trim().toLowerCase();
  const specialKeys = ["finance", "personal"];
  const getDisplayName = (key) => {
    const found = tasks.find(t => normKey(t.company) === key && t.company?.trim());
    return found?.company?.trim() || key;
  };
  const companyKeys = [...new Set(tasks.map(t => normKey(t.company)).filter(k => k && !specialKeys.includes(k)))].sort();
  const getTasksForAccount = (k) => {
    if (k === "__uncategorised__") return tasks.filter(t => !t.company?.trim());
    return tasks.filter(t => normKey(t.company) === k);
  };
  const allAccounts = [
    ...SPECIAL_ACCOUNTS,
    ...companyKeys.map(k => ({ key: k, label: getDisplayName(k), color: "#0891b2" })),
    { key: "__uncategorised__", label: "Uncategorised", color: "#4b5563" },
  ];

  const seanTasks = tasks.filter(t => t.owner === "Sean" && t.status !== "Done");
  const fya = seanTasks.filter(t => t.status === "FYA");
  const todo = seanTasks.filter(t => t.status === "To Do");
  const followUp = seanTasks.filter(t => t.status === "Follow Up");
  const fyi = tasks.filter(t => (t.status === "FYI" || t.task_type === "FYI") && t.status !== "Done");
  const jasonTasks = tasks.filter(t => t.owner === "Jason" && t.status !== "Done");
  const andreaTasks = tasks.filter(t => t.owner === "Andrea" && t.status !== "Done");
  const pendingInbox = inboxTriage.filter(i => !i.cleared);
  const regularFlags = flags.filter(f => f.task_subject !== "Weekly Customer Report");
  const weeklyReports = flags.filter(f => f.task_subject === "Weekly Customer Report");
  const unseenFlags = regularFlags.filter(f => !f.seen);
  const seenFlags = regularFlags.filter(f => f.seen);
  const unreadReports = weeklyReports.filter(f => !f.seen);
  const totalAccounts = [...new Set(tasks.map(t => t.company?.trim().toLowerCase()).filter(Boolean))].length;

  const TABS = [
    { id: "fya", label: "FYA", emoji: "🟠", count: fya.length },
    { id: "todo", label: "To Do", emoji: "🔴", count: todo.length },
    { id: "followup", label: "Follow Up", emoji: "🏌️", count: followUp.length },
    { id: "fyi", label: "FYI", emoji: "🟣", count: fyi.length },
    { id: "accounts", label: "Accounts", emoji: "🏢", count: totalAccounts },
    { id: "team", label: "Team", emoji: "👥", count: 0 },
    { id: "flags", label: "Flags", emoji: "🚨", count: unseenFlags.length },
    { id: "weeklyreport", label: "Report", emoji: "📊", count: unreadReports.length },
    { id: "inbox", label: "Inbox", emoji: "🗑️", count: pendingInbox.length },
  ];

  const s = {
    page: { minHeight:"100vh", background:"#0d0d1a", color:"#e2e8f0", fontFamily:"system-ui,sans-serif", width:"100%", paddingBottom:40 },
    header: { background:"#0a0a16", padding:"16px 20px", borderBottom:"1px solid #1e1e30", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 },
    tabs: { display:"flex", overflowX:"auto", gap:6, padding:"12px 16px", borderBottom:"1px solid #1e1e30", background:"#0a0a16", position:"sticky", top:57, zIndex:99 },
    tab: (active) => ({ flexShrink:0, padding:"8px 14px", borderRadius:99, border:"1px solid " + (active ? "#0891b2" : "#2a2a45"), background: active ? "#0891b233" : "none", color: active ? "#0891b2" : "#6b7280", fontSize:13, fontWeight: active ? 700 : 400, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }),
    content: { padding:"16px" },
    card: (over) => ({ background:"#1a1a2e", border:"1px solid " + (over ? "#7f1d1d" : "#2a2a45"), borderRadius:14, padding:"16px", marginBottom:12 }),
    cardTitle: { fontSize:16, fontWeight:700, color:"#e2e8f0", marginBottom:6, lineHeight:1.3 },
    cardMeta: { fontSize:12, color:"#6b7280", marginBottom:10 },
    doneBtn: { width:"100%", padding:"12px", background:"#10b98122", border:"1px solid #10b981", borderRadius:10, color:"#10b981", fontSize:15, fontWeight:700, cursor:"pointer" },
    editBtn: { width:"100%", padding:"10px", background:"#0891b222", border:"1px solid #0891b2", borderRadius:10, color:"#0891b2", fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:8 },
    sectionTitle: { fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12, marginTop:4 },
    empty: { textAlign:"center", padding:"40px 0", color:"#374151" },
    overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:1000, display:"flex", alignItems:"flex-end", justifyContent:"center" },
    sheet: { background:"#13131f", border:"1px solid #2a2a45", borderRadius:"16px 16px 0 0", padding:"24px 20px", width:"100%", maxWidth:480, maxHeight:"85vh", overflowY:"auto" },
    lbl: { fontSize:11, fontWeight:600, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6, display:"block" },
  };

  if (loading) return (
    <div style={{ ...s.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#0891b2", fontSize:16 }}>Loading...</div>
    </div>
  );

  const TaskCard = ({ task }) => (
    <div style={{ ...s.card(isOverdue(task)), borderLeft:"3px solid " + STATUS_COLOR[task.status] }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div style={{ flex:1, paddingRight:8 }}>
          <div style={s.cardTitle}>{task.subject}</div>
          <div style={s.cardMeta}>
            {task.client && <span>{task.client}{task.company ? " · " + task.company : ""} · </span>}
            <span style={{ color:isOverdue(task) ? "#fca5a5" : "#6b7280" }}>Due {fmtDate(task.expected_date)}</span>
          </div>
          {task.next_action && <div style={{ fontSize:13, color:"#0891b2", marginBottom:6 }}>{"-> " + task.next_action}</div>}
          {task.notes && <div style={{ fontSize:12, color:"#6b7280", fontStyle:"italic", marginBottom:8 }}>💬 {task.notes.length > 80 ? task.notes.substring(0,80) + "..." : task.notes}</div>}
        </div>
        {isOverdue(task) && <span style={{ flexShrink:0, fontSize:10, background:"#7f1d1d", color:"#fca5a5", borderRadius:99, padding:"2px 8px", fontWeight:700 }}>OVERDUE</span>}
      </div>
      <button onClick={() => openEdit(task)} style={s.editBtn}>Edit / Add Note</button>
      <button onClick={() => markDone(task.id)} style={s.doneBtn}>Mark Done</button>
    </div>
  );

  const FYICard = ({ task }) => (
    <div style={{ ...s.card(false), borderLeft:"3px solid #8b5cf6" }}>
      <div style={s.cardTitle}>{task.subject}</div>
      <div style={s.cardMeta}>{task.client ? task.client + (task.company ? " · " + task.company : "") + " · " : ""}Received {fmtDate(task.date_received)}</div>
      {task.notes && <div style={{ fontSize:13, color:"#6b7280", fontStyle:"italic" }}>💬 {task.notes}</div>}
    </div>
  );

  const TeamMini = ({ name, teamTasks }) => {
    const active = teamTasks.filter(t => t.status !== "Done");
    const overdue = teamTasks.filter(isOverdue);
    const done = teamTasks.filter(t => t.status === "Done" && t.actual_date === TODAY());
    return (
      <div style={s.card(false)}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:"#0891b2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:700, color:"#fff" }}>{name[0]}</div>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:"#e2e8f0" }}>{name}</div>
            <div style={{ fontSize:12, color:"#6b7280" }}>{active.length} active{overdue.length > 0 ? " · overdue: " + overdue.length : ""}{done.length > 0 ? " · done today: " + done.length : ""}</div>
          </div>
        </div>
        {active.slice(0,3).map(t => (
          <div key={t.id} style={{ fontSize:13, color:"#9ca3af", padding:"6px 0", borderTop:"1px solid #1e1e30", display:"flex", justifyContent:"space-between" }}>
            <span>{STATUS_EMOJI[t.status]} {t.subject}</span>
            <span style={{ color:isOverdue(t) ? "#fca5a5" : "#4b5563", flexShrink:0, marginLeft:8 }}>{fmtDate(t.expected_date)}</span>
          </div>
        ))}
      </div>
    );
  };

  // ============================================================
  // ACCOUNTS VIEW for Sean
  // ============================================================
  const AccountsView = () => {
    const [search, setSearch] = useState("");

    if (selectedAccount) {
      const accountTasks = getTasksForAccount(selectedAccount.key);
      const filtered = accountStatusFilter === "All" ? accountTasks : accountTasks.filter(t => t.status === accountStatusFilter);
      const statusCounts = STATUSES.reduce((acc, s) => { acc[s] = accountTasks.filter(t => t.status === s).length; return acc; }, {});

      return (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <button onClick={() => { setSelectedAccount(null); setAccountStatusFilter("All"); }}
              style={{ padding:"8px 14px", background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:8, color:"#9ca3af", cursor:"pointer", fontSize:13 }}>
              ← Back
            </button>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:18, fontWeight:800, color:"#e2e8f0" }}>{selectedAccount.label}</div>
              <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
                {accountTasks.filter(t=>t.status!=="Done").length} active · {accountTasks.filter(isOverdue).length} overdue · {accountTasks.filter(t=>t.status==="Done").length} done
              </div>
            </div>
            <button onClick={() => {
              setNewTaskForm(f => ({ ...f, company: selectedAccount.key === "__uncategorised__" ? "" : selectedAccount.label }));
              setNewTaskModal(true);
            }} style={{ padding:"8px 14px", background:"#0891b2", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700 }}>
              + Task
            </button>
          </div>

          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            {["All", ...STATUSES].map(st => {
              const count = st === "All" ? accountTasks.length : statusCounts[st];
              return (
                <button key={st} onClick={() => setAccountStatusFilter(st)}
                  style={{ padding:"5px 10px", borderRadius:99, border:"1px solid " + (accountStatusFilter===st ? (st==="All" ? "#0891b2" : STATUS_COLOR[st]) : "#2a2a45"), background:accountStatusFilter===st ? (st==="All" ? "#0891b233" : STATUS_COLOR[st]+"33") : "none", color:accountStatusFilter===st ? (st==="All" ? "#0891b2" : STATUS_COLOR[st]) : "#6b7280", cursor:"pointer", fontSize:11, fontWeight:accountStatusFilter===st ? 700 : 400, display:"flex", alignItems:"center", gap:4 }}>
                  {st !== "All" && STATUS_EMOJI[st]} {st}
                  {count > 0 && <span style={{ background:"rgba(255,255,255,0.15)", borderRadius:99, padding:"0px 5px", fontSize:10 }}>{count}</span>}
                </button>
              );
            })}
          </div>

          {filtered.length === 0
            ? <div style={s.empty}><div style={{ fontSize:28, marginBottom:8 }}>📂</div><div>No tasks for this account</div></div>
            : filtered.map(t => <TaskCard key={t.id} task={t} />)
          }
        </div>
      );
    }

    const filteredAccounts = allAccounts.filter(a =>
      !search.trim() || a.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div>
        <div style={{ position:"relative", marginBottom:14 }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#4b5563", fontSize:14 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts..."
            style={{ ...inp, paddingLeft:36, background:"#1a1a2e" }} />
          {search && <button onClick={() => setSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:16 }}>✕</button>}
        </div>
        <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>
          {filteredAccounts.filter(a => getTasksForAccount(a.key).length > 0 || specialKeys.includes(a.key)).length} Accounts
        </div>
        {filteredAccounts.map(account => {
          const total = getTasksForAccount(account.key).length;
          const active = getTasksForAccount(account.key).filter(t => t.status !== "Done").length;
          const urgent = getTasksForAccount(account.key).filter(t => t.priority === "Urgent" && t.status !== "Done").length;
          if (total === 0 && !specialKeys.includes(account.key)) return null;
          return (
            <div key={account.key} onClick={() => { setSelectedAccount(account); setAccountStatusFilter("All"); }}
              style={{ background:"#1a1a2e", border:"1px solid #2a2a45", borderLeft:"3px solid " + account.color, borderRadius:12, padding:"14px 16px", marginBottom:10, cursor:"pointer" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:"#e2e8f0", marginBottom:4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{account.label}</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {active > 0 && <span style={{ fontSize:11, color:"#9ca3af" }}>{active} active</span>}
                    {urgent > 0 && <span style={{ fontSize:11, background:"#7f1d1d", color:"#fca5a5", borderRadius:99, padding:"1px 7px", fontWeight:700 }}>🔴 {urgent} urgent</span>}
                    {active === 0 && total > 0 && <span style={{ fontSize:11, color:"#10b981" }}>✅ All done</span>}
                    {total === 0 && <span style={{ fontSize:11, color:"#374151" }}>No tasks yet</span>}
                  </div>
                </div>
                <span style={{ color:"#4b5563", fontSize:18 }}>→</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <img src="https://esbd.co.za/wp-content/uploads/2024/07/4.png" alt="ESBD" style={{ width:80 }} />
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0" }}>
            {"Good " + (new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening") + ", Sean"}
          </div>
          <div style={{ fontSize:11, color:"#4b5563" }}>{new Date().toLocaleDateString("en-GB", { weekday:"long", day:"2-digit", month:"long" })}</div>
        </div>
      </div>

      <div style={s.tabs}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={s.tab(activeTab === tab.id)}>
            <span>{tab.emoji}</span>
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span style={{ background: tab.id === "weeklyreport" ? "#3b82f6" : tab.id === "accounts" ? "#0891b2" : "#ef4444", color:"#fff", borderRadius:99, padding:"1px 6px", fontSize:10, fontWeight:700 }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={s.content}>

        {activeTab === "fya" && (
          <div>
            <div style={s.sectionTitle}>For Your Attention</div>
            {fya.length === 0
              ? <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>🎉</div><div>Nothing needs your attention</div></div>
              : fya.map(t => <TaskCard key={t.id} task={t} />)
            }
          </div>
        )}

        {activeTab === "todo" && (
          <div>
            <div style={s.sectionTitle}>To Do</div>
            {todo.length === 0
              ? <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>✅</div><div>Nothing on your to do list</div></div>
              : todo.map(t => <TaskCard key={t.id} task={t} />)
            }
          </div>
        )}

        {activeTab === "followup" && (
          <div>
            <div style={s.sectionTitle}>Follow Up</div>
            {followUp.length === 0
              ? <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>🏌️</div><div>No follow ups pending</div></div>
              : followUp.map(t => <TaskCard key={t.id} task={t} />)
            }
          </div>
        )}

        {activeTab === "fyi" && (
          <div>
            <div style={s.sectionTitle}>For Your Information</div>
            {fyi.length === 0
              ? <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>📭</div><div>No FYI items</div></div>
              : fyi.map(t => <FYICard key={t.id} task={t} />)
            }
          </div>
        )}

        {activeTab === "accounts" && <AccountsView />}

        {activeTab === "team" && (
          <div>
            <div style={s.sectionTitle}>Team Update</div>
            <TeamMini name="Jason" teamTasks={jasonTasks} />
            <TeamMini name="Andrea" teamTasks={andreaTasks} />
          </div>
        )}

        {activeTab === "flags" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={s.sectionTitle}>Flags from Team</div>
              {unseenFlags.length > 0 && (
                <button onClick={markAllFlagsSeen} style={{ padding:"6px 12px", background:"#10b98122", border:"1px solid #10b981", borderRadius:6, color:"#10b981", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                  Mark all seen
                </button>
              )}
            </div>
            {unseenFlags.length === 0 && seenFlags.length === 0 && (
              <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>✅</div><div>No flags from the team</div></div>
            )}
            {unseenFlags.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, color:"#ef4444", fontWeight:700, marginBottom:8, letterSpacing:"0.06em", textTransform:"uppercase" }}>Needs Your Attention</div>
                {unseenFlags.map(f => (
                  <div key={f.id} style={{ background:"#1a1a2e", border:"1px solid " + (URGENCY_COLOR[f.urgency] + "44"), borderLeft:"3px solid " + URGENCY_COLOR[f.urgency], borderRadius:12, padding:"14px 16px", marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:URGENCY_COLOR[f.urgency] + "33", color:URGENCY_COLOR[f.urgency], fontWeight:700 }}>{f.urgency}</span>
                        <span style={{ fontSize:12, color:"#9ca3af", fontWeight:600 }}>from {f.from_name}</span>
                      </div>
                      <div style={{ fontSize:10, color:"#4b5563" }}>{fmtDateTime(f.created_at)}</div>
                    </div>
                    {f.task_subject && f.task_subject !== "General flag" && (
                      <div style={{ fontSize:12, color:"#6b7280", marginBottom:6 }}>Re: {f.task_subject}</div>
                    )}
                    <div style={{ fontSize:14, color:"#e2e8f0", lineHeight:1.5, marginBottom:12 }}>{f.note}</div>
                    <button onClick={() => markFlagSeen(f.id)} style={{ width:"100%", padding:"10px", background:"#10b98122", border:"1px solid #10b981", borderRadius:8, color:"#10b981", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      Got it - Mark as Seen
                    </button>
                  </div>
                ))}
              </div>
            )}
            {seenFlags.length > 0 && (
              <div>
                <div style={{ fontSize:11, color:"#374151", fontWeight:700, marginBottom:8, letterSpacing:"0.06em", textTransform:"uppercase" }}>Previously Seen</div>
                {seenFlags.slice(0,5).map(f => (
                  <div key={f.id} style={{ background:"#13131f", border:"1px solid #1e1e30", borderLeft:"3px solid #374151", borderRadius:12, padding:"12px 16px", marginBottom:8, opacity:0.6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:11, color:"#4b5563", fontWeight:600 }}>{f.urgency}</span>
                        <span style={{ fontSize:11, color:"#4b5563" }}>from {f.from_name}</span>
                        <span style={{ fontSize:11, color:"#10b981" }}>Seen</span>
                      </div>
                      <div style={{ fontSize:10, color:"#374151" }}>{fmtDateTime(f.created_at)}</div>
                    </div>
                    <div style={{ fontSize:13, color:"#6b7280", lineHeight:1.4 }}>{f.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "weeklyreport" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={s.sectionTitle}>Weekly Reports</div>
              {unreadReports.length > 0 && (
                <span style={{ background:"#3b82f6", color:"#fff", borderRadius:99, padding:"3px 10px", fontSize:12, fontWeight:700 }}>{unreadReports.length} new</span>
              )}
            </div>
            {weeklyReports.length === 0 && (
              <div style={s.empty}>
                <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
                <div>No weekly reports yet</div>
                <div style={{ fontSize:12, color:"#374151", marginTop:8 }}>Andrea and Jason send these from the team view</div>
              </div>
            )}
            {unreadReports.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, color:"#3b82f6", fontWeight:700, marginBottom:8, letterSpacing:"0.06em", textTransform:"uppercase" }}>New Reports</div>
                {unreadReports.map(r => (
                  <div key={r.id} style={{ background:"#1a1a2e", border:"1px solid #3b82f644", borderLeft:"3px solid #3b82f6", borderRadius:12, padding:"14px 16px", marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:"#e2e8f0" }}>Weekly Report</div>
                        <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>from {r.from_name} · {fmtDateTime(r.created_at)}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:11, background:"#f97316", color:"#fff", borderRadius:99, padding:"2px 8px", fontWeight:700 }}>New</span>
                        <button onClick={() => { if(window.confirm("Delete this report?")) deleteReport(r.id); }}
                          style={{ padding:"4px 8px", background:"none", border:"1px solid #7f1d1d", borderRadius:6, color:"#ef4444", cursor:"pointer", fontSize:11 }}>🗑️</button>
                      </div>
                    </div>
                    <pre style={{ background:"#0a0a16", border:"1px solid #2a2a45", borderRadius:8, padding:12, color:"#e2e8f0", fontSize:12, whiteSpace:"pre-wrap", fontFamily:"system-ui", lineHeight:1.6, margin:"0 0 12px 0", overflowX:"auto" }}>{r.note}</pre>
                    <button onClick={() => markFlagSeen(r.id)} style={{ width:"100%", padding:"10px", background:"#10b98122", border:"1px solid #10b981", borderRadius:8, color:"#10b981", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      Mark as Read
                    </button>
                  </div>
                ))}
              </div>
            )}
            {weeklyReports.filter(r => r.seen).length > 0 && (
              <div>
                <div style={{ fontSize:11, color:"#374151", fontWeight:700, marginBottom:8, letterSpacing:"0.06em", textTransform:"uppercase" }}>Previously Read</div>
                {weeklyReports.filter(r => r.seen).slice(0,5).map(r => (
                  <div key={r.id} style={{ background:"#13131f", border:"1px solid #1e1e30", borderLeft:"3px solid #374151", borderRadius:12, padding:"12px 16px", marginBottom:8, opacity:0.6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#6b7280" }}>from {r.from_name}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:11, color:"#10b981" }}>Read</span>
                        <div style={{ fontSize:10, color:"#374151" }}>{fmtDateTime(r.created_at)}</div>
                        <button onClick={() => { if(window.confirm("Delete this report?")) deleteReport(r.id); }}
                          style={{ padding:"2px 6px", background:"none", border:"1px solid #7f1d1d", borderRadius:6, color:"#ef4444", cursor:"pointer", fontSize:10 }}>🗑️</button>
                      </div>
                    </div>
                    <pre style={{ background:"#0a0a16", border:"1px solid #1e1e30", borderRadius:8, padding:10, color:"#6b7280", fontSize:11, whiteSpace:"pre-wrap", fontFamily:"system-ui", lineHeight:1.5, margin:0, overflowX:"auto" }}>{r.note}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "inbox" && (
          <div>
            <div style={s.sectionTitle}>Inbox Triage</div>
            <div style={{ marginBottom:16 }}>
              <input value={newInbox} onChange={e => setNewInbox(e.target.value)} placeholder="Email subject + sender..." style={{ ...inp, marginBottom:10 }} />
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                {["Delete", "Follow Up"].map(a => (
                  <button key={a} onClick={() => setNewInboxAction(a)} style={{ flex:1, padding:"10px", background:newInboxAction===a ? (a==="Delete" ? "#7f1d1d" : "#1e3a8a") : "#1e1e30", border:"1px solid " + (newInboxAction===a ? (a==="Delete" ? "#ef4444" : "#3b82f6") : "#2a2a45"), borderRadius:10, color:newInboxAction===a ? "#fff" : "#6b7280", cursor:"pointer", fontSize:14, fontWeight:600 }}>
                    {a === "Delete" ? "Delete" : "Follow Up"}
                  </button>
                ))}
              </div>
              <button onClick={addInboxItem} style={{ width:"100%", padding:"12px", background:"#0891b2", border:"none", borderRadius:10, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>+ Flag Email</button>
            </div>
            {pendingInbox.length === 0
              ? <div style={s.empty}><div style={{ fontSize:32, marginBottom:8 }}>📭</div><div>Inbox is clear!</div></div>
              : pendingInbox.map(item => (
                <div key={item.id} style={{ ...s.card(false), borderLeft:"3px solid " + (item.action==="Delete" ? "#ef4444" : "#3b82f6") }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#e2e8f0", marginBottom:6 }}>{item.subject}</div>
                  <div style={{ marginBottom:10 }}>
                    <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:item.action==="Delete" ? "#7f1d1d" : "#1e3a8a", color:item.action==="Delete" ? "#fca5a5" : "#93c5fd", fontWeight:700 }}>
                      {item.action==="Delete" ? "Delete" : "Follow Up"}
                    </span>
                  </div>
                  <button onClick={() => clearInbox(item.id)} style={s.doneBtn}>Cleared</button>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* Edit Task Bottom Sheet */}
      {editingTask && (
        <div style={s.overlay} onClick={() => setEditingTask(null)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#e2e8f0" }}>Edit Task</div>
              <button onClick={() => setEditingTask(null)} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:20 }}>✕</button>
            </div>
            <div style={{ fontSize:14, color:"#9ca3af", marginBottom:20, lineHeight:1.4 }}>{editingTask.subject}</div>
            <div style={{ marginBottom:16 }}>
              <label style={s.lbl}>Status</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {STATUSES.map(st => (
                  <button key={st} onClick={() => setEditForm(f => ({ ...f, status:st }))}
                    style={{ padding:"8px 14px", borderRadius:99, border:"1px solid " + (editForm.status===st ? STATUS_COLOR[st] : "#2a2a45"), background:editForm.status===st ? STATUS_COLOR[st] + "33" : "none", color:editForm.status===st ? STATUS_COLOR[st] : "#6b7280", cursor:"pointer", fontSize:13, fontWeight:editForm.status===st ? 700 : 400 }}>
                    {STATUS_EMOJI[st]} {st}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={s.lbl}>Follow Up Date</label>
              <input type="date" value={editForm.expected_date} onChange={e => setEditForm(f => ({ ...f, expected_date:e.target.value }))} style={inp} />
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={s.lbl}>Next Action</label>
              <input value={editForm.next_action} onChange={e => setEditForm(f => ({ ...f, next_action:e.target.value }))} placeholder="What needs to happen next?" style={inp} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={s.lbl}>Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes:e.target.value }))} placeholder="Add a note..." style={{ ...inp, minHeight:100, resize:"vertical" }} />
            </div>
            <button onClick={saveEdit} style={{ width:"100%", padding:"14px", background:"#0891b2", border:"none", borderRadius:10, color:"#fff", fontSize:16, fontWeight:700, cursor:"pointer" }}>
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* New Task Bottom Sheet */}
      {newTaskModal && (
        <div style={s.overlay} onClick={() => setNewTaskModal(false)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#e2e8f0" }}>New Task</div>
              <button onClick={() => setNewTaskModal(false)} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:20 }}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <label style={s.lbl}>Subject *</label>
                <input value={newTaskForm.subject} onChange={e => setNewTaskForm(f => ({ ...f, subject:e.target.value }))} placeholder="What needs to be done?" style={inp} />
              </div>
              <div>
                <label style={s.lbl}>Client</label>
                <input value={newTaskForm.client} onChange={e => setNewTaskForm(f => ({ ...f, client:e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={s.lbl}>Company</label>
                <CompanyDropdown value={newTaskForm.company} onChange={v => setNewTaskForm(f => ({ ...f, company:v }))} />
              </div>
              <div>
                <label style={s.lbl}>Owner</label>
                <select value={newTaskForm.owner} onChange={e => setNewTaskForm(f => ({ ...f, owner:e.target.value }))} style={inp}>
                  {OWNERS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={s.lbl}>Status</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {STATUSES.map(st => (
                    <button key={st} onClick={() => setNewTaskForm(f => ({ ...f, status:st }))}
                      style={{ padding:"6px 12px", borderRadius:99, border:"1px solid " + (newTaskForm.status===st ? STATUS_COLOR[st] : "#2a2a45"), background:newTaskForm.status===st ? STATUS_COLOR[st]+"33" : "none", color:newTaskForm.status===st ? STATUS_COLOR[st] : "#6b7280", cursor:"pointer", fontSize:12 }}>
                      {STATUS_EMOJI[st]} {st}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={s.lbl}>Priority</label>
                <select value={newTaskForm.priority} onChange={e => setNewTaskForm(f => ({ ...f, priority:e.target.value }))} style={inp}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={s.lbl}>Expected Date *</label>
                <input type="date" value={newTaskForm.expected_date} onChange={e => setNewTaskForm(f => ({ ...f, expected_date:e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={s.lbl}>Next Action *</label>
                <input value={newTaskForm.next_action} onChange={e => setNewTaskForm(f => ({ ...f, next_action:e.target.value }))} placeholder="What needs to happen next?" style={inp} />
              </div>
              <div>
                <label style={s.lbl}>Notes</label>
                <textarea value={newTaskForm.notes} onChange={e => setNewTaskForm(f => ({ ...f, notes:e.target.value }))} placeholder="Add context..." style={{ ...inp, minHeight:80, resize:"vertical" }} />
              </div>
            </div>
            <button onClick={saveNewTask} disabled={!newTaskForm.subject || !newTaskForm.expected_date || !newTaskForm.next_action}
              style={{ width:"100%", padding:"14px", background:newTaskForm.subject && newTaskForm.expected_date && newTaskForm.next_action ? "#0891b2" : "#2a2a45", border:"none", borderRadius:10, color:newTaskForm.subject && newTaskForm.expected_date && newTaskForm.next_action ? "#fff" : "#4b5563", fontSize:16, fontWeight:700, cursor:"pointer", marginTop:20 }}>
              Create Task
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
