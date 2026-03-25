import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const TODAY = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";
const isOverdue = (t) => t.status !== "Done" && t.expected_date && t.expected_date < TODAY();

const STATUS_COLOR = { "To Do": "#ef4444", "FYA": "#f97316", "Follow Up": "#10b981", "Done": "#0891b2" };

export default function Sean() {
  const [tasks, setTasks] = useState([]);
  const [inboxTriage, setInboxTriage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("fya");
  const [newInbox, setNewInbox] = useState("");
  const [newInboxAction, setNewInboxAction] = useState("Delete");

  const load = async () => {
    const { data: t } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    const { data: i } = await supabase.from("inbox_triage").select("*").order("created_at", { ascending: false });
    if (t) setTasks(t);
    if (i) setInboxTriage(i);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const markDone = async (id) => {
    await supabase.from("tasks").update({ status: "Done", actual_date: TODAY() }).eq("id", id);
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

  const seanTasks = tasks.filter(t => t.owner === "Sean" && t.status !== "Done");
  const fya = seanTasks.filter(t => t.status === "FYA");
  const todo = seanTasks.filter(t => t.status === "To Do");
  const followUp = seanTasks.filter(t => t.status === "Follow Up");
  const fyi = tasks.filter(t => t.task_type === "FYI" && t.status !== "Done");
  const jasonTasks = tasks.filter(t => t.owner === "Jason" && t.status !== "Done");
  const andreaTasks = tasks.filter(t => t.owner === "Andrea" && t.status !== "Done");
  const pendingInbox = inboxTriage.filter(i => !i.cleared);

  const TABS = [
    { id: "fya", label: "FYA", emoji: "🟠", count: fya.length },
    { id: "todo", label: "To Do", emoji: "🔴", count: todo.length },
    { id: "followup", label: "Follow Up", emoji: "🏌️", count: followUp.length },
    { id: "fyi", label: "FYI", emoji: "🟣", count: fyi.length },
    { id: "team", label: "Team", emoji: "👥", count: 0 },
    { id: "inbox", label: "Inbox", emoji: "🗑️", count: pendingInbox.length },
  ];

  const s = {
    page: { minHeight: "100vh", background: "#0d0d1a", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", width: "100%", paddingBottom: 40 },
    header: { background: "#0a0a16", padding: "16px 20px", borderBottom: "1px solid #1e1e30", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 },
    logo: { width: 80 },
    greeting: { fontSize: 12, color: "#4b5563" },
    tabs: { display: "flex", overflowX: "auto", gap: 6, padding: "12px 16px", borderBottom: "1px solid #1e1e30", background: "#0a0a16", position: "sticky", top: 57, zIndex: 99 },
    tab: (active) => ({ flexShrink: 0, padding: "8px 14px", borderRadius: 99, border: `1px solid ${active ? "#0891b2" : "#2a2a45"}`, background: active ? "#0891b233" : "none", color: active ? "#0891b2" : "#6b7280", fontSize: 13, fontWeight: active ? 700 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }),
    badge: (n) => ({ background: "#ef4444", color: "#fff", borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 700 }),
    content: { padding: "16px" },
    card: (over) => ({ background: "#1a1a2e", border: `1px solid ${over ? "#7f1d1d" : "#2a2a45"}`, borderRadius: 14, padding: "16px", marginBottom: 12 }),
    cardTitle: { fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 6, lineHeight: 1.3 },
    cardMeta: { fontSize: 12, color: "#6b7280", marginBottom: 10 },
    doneBtn: { width: "100%", padding: "12px", background: "#10b98122", border: "1px solid #10b981", borderRadius: 10, color: "#10b981", fontSize: 15, fontWeight: 700, cursor: "pointer" },
    sectionTitle: { fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12, marginTop: 4 },
    empty: { textAlign: "center", padding: "40px 0", color: "#374151" },
    inp: { background: "#1e1e30", border: "1px solid #2a2a45", borderRadius: 10, padding: "12px 14px", color: "#e2e8f0", fontSize: 15, outline: "none", width: "100%", boxSizing: "border-box" },
  };

  if (loading) return (
    <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#0891b2", fontSize: 16 }}>Loading...</div>
    </div>
  );

  const TaskCard = ({ task }) => (
    <div style={s.card(isOverdue(task))}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ flex: 1, paddingRight: 8 }}>
          <div style={s.cardTitle}>{task.subject}</div>
          <div style={s.cardMeta}>
            {task.client && <span>{task.client}{task.company ? ` · ${task.company}` : ""} · </span>}
            <span style={{ color: isOverdue(task) ? "#fca5a5" : "#6b7280" }}>Due {fmtDate(task.expected_date)}</span>
          </div>
          {task.next_action && <div style={{ fontSize: 13, color: "#0891b2", marginBottom: 10 }}>→ {task.next_action}</div>}
        </div>
        {isOverdue(task) && <span style={{ flexShrink: 0, fontSize: 10, background: "#7f1d1d", color: "#fca5a5", borderRadius: 99, padding: "2px 8px", fontWeight: 700 }}>OVERDUE</span>}
      </div>
      <button onClick={() => markDone(task.id)} style={s.doneBtn}>✓ Mark Done</button>
    </div>
  );

  const FYICard = ({ task }) => (
    <div style={{ ...s.card(false), borderLeft: "3px solid #1e3a8a" }}>
      <div style={s.cardTitle}>{task.subject}</div>
      <div style={s.cardMeta}>{task.client && `${task.client}${task.company ? ` · ${task.company}` : ""} · `}Received {fmtDate(task.date_received)}</div>
      {task.notes && <div style={{ fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>"{task.notes}"</div>}
    </div>
  );

  const TeamMini = ({ name, tasks }) => {
    const active = tasks.filter(t => t.status !== "Done");
    const overdue = tasks.filter(isOverdue);
    const done = tasks.filter(t => t.status === "Done" && t.actual_date === TODAY());
    return (
      <div style={s.card(false)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0891b2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff" }}>{name[0]}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{name}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{active.length} active{overdue.length > 0 ? ` · ⚠️ ${overdue.length} overdue` : ""}{done.length > 0 ? ` · ✅ ${done.length} done today` : ""}</div>
          </div>
        </div>
        {active.slice(0, 3).map(t => (
          <div key={t.id} style={{ fontSize: 13, color: "#9ca3af", padding: "6px 0", borderTop: "1px solid #1e1e30", display: "flex", justifyContent: "space-between" }}>
            <span>{t.subject}</span>
            <span style={{ color: isOverdue(t) ? "#fca5a5" : "#4b5563", flexShrink: 0, marginLeft: 8 }}>{fmtDate(t.expected_date)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <img src="https://esbd.co.za/wp-content/uploads/2024/07/4.png" alt="ESBD" style={s.logo} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, Sean</div>
          <div style={s.greeting}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" })}</div>
        </div>
      </div>

      <div style={s.tabs}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={s.tab(activeTab === tab.id)}>
            <span>{tab.emoji}</span>
            <span>{tab.label}</span>
            {tab.count > 0 && <span style={s.badge(tab.count)}>{tab.count}</span>}
          </button>
        ))}
      </div>

      <div style={s.content}>

        {activeTab === "fya" && (
          <div>
            <div style={s.sectionTitle}>🟠 For Your Attention</div>
            {fya.length === 0
              ? <div style={s.empty}><div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div><div>Nothing needs your attention</div></div>
              : fya.map(t => <TaskCard key={t.id} task={t} />)
            }
          </div>
        )}

        {activeTab === "todo" && (
          <div>
            <div style={s.sectionTitle}>🔴 To Do</div>
            {todo.length === 0
              ? <div style={s.empty}><div style={{ fontSize: 32, marginBottom: 8 }}>✅</div><div>Nothing on your to do list</div></div>
              : todo.map(t => <TaskCard key={t.id} task={t} />)
            }
          </div>
        )}

        {activeTab === "followup" && (
          <div>
            <div style={s.sectionTitle}>🏌️ Follow Up</div>
            {followUp.length === 0
              ? <div style={s.empty}><div style={{ fontSize: 32, marginBottom: 8 }}>🏌️</div><div>No follow ups pending</div></div>
              : followUp.map(t => <TaskCard key={t.id} task={t} />)
            }
          </div>
        )}

        {activeTab === "fyi" && (
          <div>
            <div style={s.sectionTitle}>🟣 For Your Information</div>
            {fyi.length === 0
              ? <div style={s.empty}><div style={{ fontSize: 32, marginBottom: 8 }}>📭</div><div>No FYI items</div></div>
              : fyi.map(t => <FYICard key={t.id} task={t} />)
            }
          </div>
        )}

        {activeTab === "team" && (
          <div>
            <div style={s.sectionTitle}>👥 Team Update</div>
            <TeamMini name="Jason" tasks={jasonTasks} />
            <TeamMini name="Andrea" tasks={andreaTasks} />
          </div>
        )}

        {activeTab === "inbox" && (
          <div>
            <div style={s.sectionTitle}>🗑️ Inbox Triage</div>
            <div style={{ marginBottom: 16 }}>
              <input value={newInbox} onChange={e => setNewInbox(e.target.value)} placeholder="Email subject + sender..." style={{ ...s.inp, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {["Delete", "Follow Up"].map(a => (
                  <button key={a} onClick={() => setNewInboxAction(a)} style={{ flex: 1, padding: "10px", background: newInboxAction === a ? (a === "Delete" ? "#7f1d1d" : "#1e3a8a") : "#1e1e30", border: `1px solid ${newInboxAction === a ? (a === "Delete" ? "#ef4444" : "#3b82f6") : "#2a2a45"}`, borderRadius: 10, color: newInboxAction === a ? "#fff" : "#6b7280", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                    {a === "Delete" ? "🗑️ Delete" : "→ Follow Up"}
                  </button>
                ))}
              </div>
              <button onClick={addInboxItem} style={{ width: "100%", padding: "12px", background: "#0891b2", border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>+ Flag Email</button>
            </div>
            {pendingInbox.length === 0
              ? <div style={s.empty}><div style={{ fontSize: 32, marginBottom: 8 }}>📭</div><div>Inbox is clear!</div></div>
              : pendingInbox.map(item => (
                <div key={item.id} style={{ ...s.card(false), borderLeft: `3px solid ${item.action === "Delete" ? "#ef4444" : "#3b82f6"}` }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 6 }}>{item.subject}</div>
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: item.action === "Delete" ? "#7f1d1d" : "#1e3a8a", color: item.action === "Delete" ? "#fca5a5" : "#93c5fd", fontWeight: 700 }}>{item.action === "Delete" ? "🗑️ Delete" : "→ Follow Up"}</span>
                  </div>
                  <button onClick={() => clearInbox(item.id)} style={s.doneBtn}>✓ Cleared</button>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
