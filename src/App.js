import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const TODAY = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const isOverdue = (t) => t.status !== "Completed" && t.expected_date && t.expected_date < TODAY();
const thisWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
};

const STATUSES = ["New", "In Progress", "Waiting on Client", "Completed"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const TASK_TYPES = ["Quote", "Order Request", "Information Request", "Complaint", "Follow-up", "Internal Admin"];
const OWNERS = ["You", "Boss"];
const PRIORITY_COLOR = { Low: "#6b7280", Medium: "#3b82f6", High: "#f59e0b", Urgent: "#ef4444" };
const STATUS_COLOR = { New: "#8b5cf6", "In Progress": "#3b82f6", "Waiting on Client": "#f59e0b", Completed: "#10b981" };

const newTask = (overrides = {}) => ({
  subject: "", client: "", company: "", email: "",
  date_received: TODAY(), owner: "You", status: "New", priority: "Medium",
  expected_date: "", actual_date: "", next_action: "", notes: "", outcome: "",
  task_type: "Information Request", client_response_date: "", time_spent: "",
  ...overrides,
});

function exportToCSV(tasks) {
  const headers = ["Task ID","Subject","Client","Company","Email","Date Received","Owner","Status","Priority","Expected Date","Actual Date","Next Action","Notes","Outcome","Task Type","Client Response Date","Time Spent","Revenue Linked"];
  const rows = tasks.map((t) => [t.id,t.subject,t.client,t.company,t.email,t.date_received,t.owner,t.status,t.priority,t.expected_date,t.actual_date,t.next_action,t.notes,t.outcome,t.task_type,t.client_response_date,t.time_spent,t.revenue_linked]);
  const csv = [headers,...rows].map((r) => r.map((c) => `"${(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `workflow-${TODAY()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(10,10,20,0.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)" }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ background:"#13131f",border:"1px solid #2a2a45",borderRadius:16,padding:"28px",maxWidth:740,width:"95vw",maxHeight:"92vh",overflowY:"auto" }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
      <label style={{ fontSize:11,fontWeight:600,letterSpacing:"0.08em",color:"#6b7280",textTransform:"uppercase" }}>
        {label}{required && <span style={{ color:"#ef4444",marginLeft:3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = { background:"#1e1e30",border:"1px solid #2a2a45",borderRadius:8,padding:"8px 12px",color:"#e2e8f0",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box" };

function TaskForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ ...newTask(), ...initial });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.owner && form.status && form.expected_date && form.next_action && form.subject;
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24 }}>
        <h2 style={{ margin:0,fontSize:20,fontWeight:700,color:"#e2e8f0",fontFamily:"'DM Serif Display',Georgia,serif" }}>{initial.id ? "Edit Task" : "New Task"}</h2>
        <button onClick={onClose} style={{ background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:20 }}>✕</button>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
        <div style={{ gridColumn:"1/-1" }}><Field label="Subject / Description" required><input style={inp} value={form.subject} onChange={(e)=>set("subject",e.target.value)} placeholder="What needs to be done?" /></Field></div>
        <Field label="Client Name"><input style={inp} value={form.client} onChange={(e)=>set("client",e.target.value)} placeholder="Client name" /></Field>
        <Field label="Company"><input style={inp} value={form.company} onChange={(e)=>set("company",e.target.value)} placeholder="Company" /></Field>
        <Field label="Contact Email"><input style={inp} value={form.email} onChange={(e)=>set("email",e.target.value)} placeholder="email@company.com" /></Field>
        <Field label="Date Received"><input type="date" style={inp} value={form.date_received} onChange={(e)=>set("date_received",e.target.value)} /></Field>
        <Field label="Owner" required><select style={inp} value={form.owner} onChange={(e)=>set("owner",e.target.value)}>{OWNERS.map((o)=><option key={o}>{o}</option>)}</select></Field>
        <Field label="Status" required><select style={inp} value={form.status} onChange={(e)=>set("status",e.target.value)}>{STATUSES.map((s)=><option key={s}>{s}</option>)}</select></Field>
        <Field label="Priority"><select style={inp} value={form.priority} onChange={(e)=>set("priority",e.target.value)}>{PRIORITIES.map((p)=><option key={p}>{p}</option>)}</select></Field>
        <Field label="Task Type"><select style={inp} value={form.task_type} onChange={(e)=>set("task_type",e.target.value)}>{TASK_TYPES.map((t)=><option key={t}>{t}</option>)}</select></Field>
        <Field label="Expected Completion Date" required><input type="date" style={inp} value={form.expected_date} onChange={(e)=>set("expected_date",e.target.value)} /></Field>
        <div style={{ gridColumn:"1/-1" }}><Field label="Next Action" required><input style={inp} value={form.next_action} onChange={(e)=>set("next_action",e.target.value)} placeholder="What happens next?" /></Field></div>
        <div style={{ gridColumn:"1/-1" }}><Field label="Notes / Summary"><textarea style={{ ...inp,minHeight:72,resize:"vertical" }} value={form.notes} onChange={(e)=>set("notes",e.target.value)} placeholder="Background, context, details…" /></Field></div>
        {form.status === "Completed" && (<>
          <Field label="Actual Completion Date"><input type="date" style={inp} value={form.actual_date} onChange={(e)=>set("actual_date",e.target.value)} /></Field>
          <div style={{ gridColumn:"1/-1" }}><Field label="Outcome"><input style={inp} value={form.outcome} onChange={(e)=>set("outcome",e.target.value)} placeholder="What was the result?" /></Field></div>
        </>)}
        <Field label="Client Response Date"><input type="date" style={inp} value={form.client_response_date} onChange={(e)=>set("client_response_date",e.target.value)} /></Field>
        <Field label="Time Spent (hrs)"><input style={inp} value={form.time_spent} onChange={(e)=>set("time_spent",e.target.value)} placeholder="0.0" /></Field>
      
      </div>
      <div style={{ marginTop:24,display:"flex",gap:10,justifyContent:"flex-end" }}>
        <button onClick={onClose} style={{ padding:"10px 20px",background:"none",border:"1px solid #2a2a45",borderRadius:8,color:"#6b7280",cursor:"pointer",fontSize:14 }}>Cancel</button>
        <button disabled={!valid} onClick={()=>{ if(valid){ onSave(form); onClose(); }}} style={{ padding:"10px 24px",background:valid?"#6366f1":"#2a2a45",border:"none",borderRadius:8,color:valid?"#fff":"#4b5563",cursor:valid?"pointer":"not-allowed",fontSize:14,fontWeight:600 }}>
          {initial.id ? "Save Changes" : "Create Task"}
        </button>
      </div>
      {!valid && <p style={{ textAlign:"right",marginTop:8,fontSize:12,color:"#ef4444" }}>* Subject, Owner, Status, Expected Date and Next Action are required</p>}
    </div>
  );
}

function TaskCard({ task, onClick, compact }) {
  const over = isOverdue(task);
  return (
    <div onClick={()=>onClick(task)}
      style={{ background:"#1a1a2e",border:`1px solid ${over?"#7f1d1d":"#2a2a45"}`,borderLeft:`3px solid ${STATUS_COLOR[task.status]}`,borderRadius:10,padding:compact?"10px 12px":"14px 16px",cursor:"pointer",transition:"transform 0.15s,box-shadow 0.15s",marginBottom:compact?6:10 }}
      onMouseEnter={(e)=>{ e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.4)"; }}
      onMouseLeave={(e)=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8 }}>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap" }}>
            <span style={{ fontSize:10,color:"#6b7280",fontFamily:"monospace" }}>#{task.id?.toString().slice(-4)}</span>
            <span style={{ fontSize:10,padding:"2px 7px",borderRadius:99,background:PRIORITY_COLOR[task.priority]+"22",color:PRIORITY_COLOR[task.priority],fontWeight:600 }}>{task.priority}</span>
            {over && <span style={{ fontSize:10,padding:"2px 7px",borderRadius:99,background:"#7f1d1d",color:"#fca5a5",fontWeight:600 }}>OVERDUE</span>}
            {!task.next_action && <span style={{ fontSize:10,padding:"2px 7px",borderRadius:99,background:"#451a03",color:"#fcd34d",fontWeight:600 }}>NO NEXT ACTION</span>}
          </div>
          <div style={{ fontSize:14,fontWeight:600,color:"#e2e8f0",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{task.subject||"Untitled"}</div>
          {!compact && <div style={{ fontSize:12,color:"#6b7280" }}>{[task.client,task.company].filter(Boolean).join(" · ")||"No client"}</div>}
        </div>
        <div style={{ textAlign:"right",flexShrink:0 }}>
          <div style={{ fontSize:11,color:"#6b7280",marginBottom:3 }}>{task.owner}</div>
          <div style={{ fontSize:11,color:over?"#fca5a5":"#6b7280" }}>{fmtDate(task.expected_date)}</div>
        </div>
      </div>
      {!compact && task.next_action && <div style={{ marginTop:8,fontSize:12,color:"#a78bfa",borderTop:"1px solid #2a2a45",paddingTop:8 }}>→ {task.next_action}</div>}
    </div>
  );
}

function Stat({ label, value, color, onClick }) {
  return (
    <div onClick={onClick} style={{ background:"#1a1a2e",border:"1px solid #2a2a45",borderRadius:12,padding:"20px 24px",cursor:onClick?"pointer":"default",borderTop:`3px solid ${color}`,transition:"border-color 0.2s" }}
      onMouseEnter={(e)=>{ if(onClick) e.currentTarget.style.borderColor="#6366f1"; }}
      onMouseLeave={(e)=>{ if(onClick) e.currentTarget.style.borderColor="#2a2a45"; }}>
      <div style={{ fontSize:32,fontWeight:800,color,fontFamily:"'DM Serif Display',Georgia,serif" }}>{value}</div>
      <div style={{ fontSize:11,color:"#6b7280",marginTop:4,fontWeight:500,letterSpacing:"0.06em",textTransform:"uppercase" }}>{label}</div>
    </div>
  );
}

function KanbanCol({ status, tasks, onClick, onDrop }) {
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={(e)=>{ e.preventDefault(); setOver(true); }} onDragLeave={()=>setOver(false)}
      onDrop={(e)=>{ e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData("taskId"), status); }}
      style={{ flex:1,minWidth:220,background:over?"#1e1e35":"#13131f",border:`1px solid ${over?STATUS_COLOR[status]:"#2a2a45"}`,borderRadius:12,padding:14,transition:"background 0.2s,border-color 0.2s" }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14 }}>
        <div style={{ width:10,height:10,borderRadius:"50%",background:STATUS_COLOR[status] }} />
        <span style={{ fontWeight:700,color:"#e2e8f0",fontSize:13 }}>{status}</span>
        <span style={{ marginLeft:"auto",background:"#2a2a45",borderRadius:99,padding:"2px 8px",fontSize:11,color:"#9ca3af" }}>{tasks.length}</span>
      </div>
      {tasks.map((t)=>(
        <div key={t.id} draggable onDragStart={(e)=>e.dataTransfer.setData("taskId",String(t.id))}>
          <TaskCard task={t} onClick={onClick} compact />
        </div>
      ))}
      {tasks.length===0 && <div style={{ textAlign:"center",padding:"24px 0",color:"#374151",fontSize:12 }}>Drop tasks here</div>}
    </div>
  );
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState("dashboard");
  const [modalTask, setModalTask] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Connecting…");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (!error) { setTasks(data || []); setStatus("Live"); }
    else setStatus("Error loading");
  }, []);

  useEffect(() => {
    loadTasks();
    const channel = supabase.channel("tasks-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"tasks" }, ()=>loadTasks())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadTasks]);

  const upsertTask = async (form) => {
    if (form.id) { await supabase.from("tasks").update(form).eq("id", form.id); }
    else { await supabase.from("tasks").insert([form]); }
  };
  const deleteTask = async (id) => { await supabase.from("tasks").delete().eq("id", id); };
  const moveTask = async (id, newStatus) => {
    const extra = newStatus === "Completed" ? { actual_date: TODAY() } : {};
    await supabase.from("tasks").update({ status: newStatus, ...extra }).eq("id", id);
  };

  const q = search.toLowerCase();
  const filtered = tasks.filter((t) => !q || [t.subject,t.client,t.company,t.owner,t.status,t.next_action].some((f)=>(f||"").toLowerCase().includes(q)));
  const byStatus = (s) => filtered.filter((t)=>t.status===s);
  const overdue = filtered.filter(isOverdue);
  const myTasks = filtered.filter((t)=>t.owner==="You");
  const bossTasks = filtered.filter((t)=>t.owner==="Boss");
  const noNextAction = filtered.filter((t)=>!t.next_action && t.status!=="Completed");
  const completedThisWeek = tasks.filter((t)=>t.status==="Completed" && t.actual_date>=thisWeekStart());

  const VIEWS = [
    { id:"dashboard", label:"Dashboard", icon:"⬡" },
    { id:"kanban", label:"Kanban Board", icon:"⊞" },
    { id:"new", label:"New Tasks", icon:"✦", count:byStatus("New").length },
    { id:"active", label:"Active Work", icon:"▶", count:byStatus("In Progress").length },
    { id:"waiting", label:"Waiting on Client", icon:"⏳", count:byStatus("Waiting on Client").length },
    { id:"completed", label:"Completed", icon:"✓", count:byStatus("Completed").length },
    { id:"overdue", label:"Overdue", icon:"⚠", count:overdue.length },
    { id:"mine", label:"My Tasks", icon:"◉", count:myTasks.length },
    { id:"boss", label:"Boss Tasks", icon:"◈", count:bossTasks.length },
    { id:"all", label:"All Tasks", icon:"≡" },
  ];

  const viewTasks = { new:byStatus("New"), active:byStatus("In Progress"), waiting:byStatus("Waiting on Client"), completed:byStatus("Completed"), overdue, mine:myTasks, boss:bossTasks, all:filtered };

  const Sidebar = (
    <div style={{ width:220,background:"#0a0a16",borderRight:"1px solid #1e1e30",padding:"24px 12px",display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ padding:"0 8px 24px",borderBottom:"1px solid #1e1e30" }}>
        <div style={{ fontSize:18,fontWeight:800,color:"#e2e8f0",fontFamily:"'DM Serif Display',Georgia,serif" }}>Workflow</div>
        <div style={{ fontSize:11,color:"#4b5563",marginTop:2 }}>Operations Tracker</div>
      </div>
      <div style={{ marginTop:16,flex:1,overflowY:"auto" }}>
        {VIEWS.map((v)=>(
          <button key={v.id} onClick={()=>{ setView(v.id); setSidebarOpen(false); }}
            style={{ width:"100%",textAlign:"left",padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",background:view===v.id?"#1e1e35":"none",color:view===v.id?"#a78bfa":"#6b7280",display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:view===v.id?600:400,transition:"all 0.15s",marginBottom:2 }}>
            <span style={{ fontSize:14,width:16,textAlign:"center" }}>{v.icon}</span>
            <span style={{ flex:1 }}>{v.label}</span>
            {v.count!==undefined && v.count>0 && <span style={{ background:v.id==="overdue"?"#7f1d1d":"#2a2a45",color:v.id==="overdue"?"#fca5a5":"#9ca3af",borderRadius:99,padding:"1px 7px",fontSize:11 }}>{v.count}</span>}
          </button>
        ))}
      </div>
      <div style={{ paddingTop:16,borderTop:"1px solid #1e1e30" }}>
        <div style={{ fontSize:10,color:"#374151",textAlign:"center",marginBottom:8 }}>
          <span style={{ display:"inline-block",width:6,height:6,borderRadius:"50%",background:status==="Live"?"#10b981":status==="Connecting…"?"#f59e0b":"#ef4444",marginRight:6,verticalAlign:"middle" }} />{status}
        </div>
        <button onClick={()=>setModalTask({})} style={{ width:"100%",padding:"10px",background:"#6366f1",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700 }}>+ New Task</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh",background:"#0d0d1a",color:"#e2e8f0",fontFamily:"'DM Sans',system-ui,sans-serif",display:"flex",flexDirection:"column" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Serif+Display&display=swap'); *{box-sizing:border-box;} ::-webkit-scrollbar{width:5px;height:5px;} ::-webkit-scrollbar-track{background:#0d0d1a;} ::-webkit-scrollbar-thumb{background:#2a2a45;border-radius:3px;} select option{background:#1e1e30;}`}</style>

      <div style={{ display:"flex",alignItems:"center",padding:"14px 16px",borderBottom:"1px solid #1e1e30",background:"#0a0a16",gap:12 }}>
        <button onClick={()=>setSidebarOpen(true)} style={{ background:"none",border:"1px solid #2a2a45",borderRadius:7,color:"#6b7280",cursor:"pointer",padding:"6px 10px",fontSize:16 }}>☰</button>
        <span style={{ fontSize:16,fontWeight:800,color:"#e2e8f0",fontFamily:"'DM Serif Display',Georgia,serif",flex:1 }}>{VIEWS.find((v)=>v.id===view)?.label}</span>
        <button onClick={()=>exportToCSV(tasks)} style={{ padding:"7px 12px",background:"none",border:"1px solid #2a2a45",borderRadius:7,color:"#6b7280",cursor:"pointer",fontSize:12 }}>↓ CSV</button>
        <button onClick={()=>setModalTask({})} style={{ padding:"7px 14px",background:"#6366f1",border:"none",borderRadius:7,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700 }}>+ New</button>
      </div>

      <div style={{ flex:1,display:"flex",overflow:"hidden" }}>
        <div style={{ display:window.innerWidth>=768?"flex":"none",flexDirection:"column" }}>{Sidebar}</div>

        {sidebarOpen && (
          <div style={{ position:"fixed",inset:0,zIndex:500,display:"flex" }} onClick={()=>setSidebarOpen(false)}>
            <div style={{ width:240,height:"100%",background:"#0a0a16" }} onClick={(e)=>e.stopPropagation()}>{Sidebar}</div>
            <div style={{ flex:1,background:"rgba(0,0,0,0.5)" }} />
          </div>
        )}

        <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
          <div style={{ padding:"14px 20px",borderBottom:"1px solid #1e1e30",background:"#0a0a16",display:window.innerWidth>=768?"flex":"none",alignItems:"center",gap:12 }}>
            <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search tasks…" style={{ ...inp,maxWidth:340,padding:"8px 14px" }} />
            <div style={{ flex:1 }} />
            <button onClick={()=>exportToCSV(tasks)} style={{ padding:"8px 16px",background:"none",border:"1px solid #2a2a45",borderRadius:8,color:"#6b7280",cursor:"pointer",fontSize:13 }}>↓ Export CSV</button>
          </div>
          <div style={{ padding:"10px 16px",borderBottom:"1px solid #1e1e30",display:window.innerWidth<768?"block":"none" }}>
            <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search…" style={{ ...inp }} />
          </div>

          <div style={{ flex:1,overflowY:"auto",padding:window.innerWidth>=768?28:14 }}>
            {view==="dashboard" && (
              <div>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:28 }}>
                  <Stat label="Active" value={byStatus("In Progress").length} color="#3b82f6" onClick={()=>setView("active")} />
                  <Stat label="Waiting on Client" value={byStatus("Waiting on Client").length} color="#f59e0b" onClick={()=>setView("waiting")} />
                  <Stat label="Overdue" value={overdue.length} color="#ef4444" onClick={()=>setView("overdue")} />
                  <Stat label="Completed This Week" value={completedThisWeek.length} color="#10b981" />
                  <Stat label="No Next Action" value={noNextAction.length} color="#f97316" />
                  <Stat label="Total Tasks" value={tasks.length} color="#8b5cf6" onClick={()=>setView("all")} />
                </div>
                <div style={{ display:"grid",gridTemplateColumns:window.innerWidth>=768?"1fr 1fr":"1fr",gap:20 }}>
                  {[
                    { title:"⚠ Overdue", items:overdue.slice(0,5), empty:"No overdue tasks 🎉" },
                    { title:"⚡ No Next Action", items:noNextAction.slice(0,5), empty:"All tasks have next actions ✓" },
                    { title:"▶ Your Active Tasks", items:myTasks.filter((t)=>t.status==="In Progress").slice(0,5), empty:"Nothing active" },
                    { title:"✓ Completed This Week", items:completedThisWeek.slice(0,5), empty:"None yet this week" },
                  ].map(({ title, items, empty })=>(
                    <div key={title}>
                      <div style={{ fontSize:12,fontWeight:700,color:"#6b7280",marginBottom:10,letterSpacing:"0.06em",textTransform:"uppercase" }}>{title}</div>
                      {items.length===0 ? <div style={{ color:"#374151",fontSize:13,padding:"12px 0" }}>{empty}</div> : items.map((t)=><TaskCard key={t.id} task={t} onClick={(t)=>setModalTask(t)} compact />)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view==="kanban" && (
              <div style={{ display:"flex",gap:12,overflowX:"auto",paddingBottom:8,minHeight:400 }}>
                {STATUSES.map((s)=><KanbanCol key={s} status={s} tasks={tasks.filter((t)=>t.status===s)} onClick={(t)=>setModalTask(t)} onDrop={moveTask} />)}
              </div>
            )}

            {!["dashboard","kanban"].includes(view) && (
              <div>
                {(viewTasks[view]||[]).length===0
                  ? <div style={{ textAlign:"center",padding:"60px 0",color:"#374151" }}><div style={{ fontSize:40,marginBottom:12 }}>◌</div><div style={{ fontSize:15 }}>No tasks here</div></div>
                  : (viewTasks[view]||[]).map((t)=><TaskCard key={t.id} task={t} onClick={(t)=>setModalTask(t)} />)
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
                <TaskForm initial={modalTask} onSave={upsertTask} onClose={()=>setModalTask(null)} />
                <div style={{ marginTop:16,borderTop:"1px solid #2a2a45",paddingTop:16,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <div style={{ fontSize:12,color:"#4b5563" }}>Received {fmtDate(modalTask.date_received)}</div>
                  <button onClick={()=>{ if(window.confirm("Delete this task?")){ deleteTask(modalTask.id); setModalTask(null); }}} style={{ padding:"6px 14px",background:"none",border:"1px solid #7f1d1d",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:12 }}>Delete Task</button>
                </div>
              </div>
            : <TaskForm initial={newTask()} onSave={upsertTask} onClose={()=>setModalTask(null)} />
          }
        </Modal>
      )}
    </div>
  );
}
