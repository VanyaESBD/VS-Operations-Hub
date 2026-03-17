import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const TODAY = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const isOverdue = (t) => t.status !== "Done" && t.expected_date && t.expected_date < TODAY();
const thisWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
};

const STATUSES = ["To Do", "FYA", "Follow Up", "Done"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const TASK_TYPES = ["Quote", "Order Request", "Information Request", "Complaint", "Follow-up", "Internal Admin", "FYI"];
const OWNERS = ["You", "Sean", "Jason", "Andrea"];
const LEAD_STAGES = ["Cold", "Warm", "Hot", "Negotiating", "Won", "Lost"];
const LEAD_STAGE_COLOR = { Cold: "#3b82f6", Warm: "#f59e0b", Hot: "#ef4444", Negotiating: "#8b5cf6", Won: "#10b981", Lost: "#6b7280" };
const LEAD_STAGE_EMOJI = { Cold: "🧊", Warm: "🌡️", Hot: "🔥", Negotiating: "🤝", Won: "✅", Lost: "❌" };
const PRIORITY_COLOR = { Low: "#6b7280", Medium: "#0891b2", High: "#f59e0b", Urgent: "#ef4444" };
const STATUS_COLOR = { "To Do": "#ef4444", "FYA": "#f97316", "Follow Up": "#10b981", "Done": "#0891b2" };
const STATUS_EMOJI = { "To Do": "🔴", "FYA": "🟠", "Follow Up": "🏌️", "Done": "✅" };
const FYI_COLOR = "#1e3a8a";

const newTask = (overrides = {}) => ({
  subject: "", client: "", company: "", email: "",
  date_received: TODAY(), owner: "You", status: "To Do", priority: "Medium",
  expected_date: "", actual_date: "", next_action: "", notes: "", outcome: "", task_type: "Information Request",
  ...overrides,
});

const newLead = (overrides = {}) => ({
  company: "", contact: "", email: "", phone: "", product_interest: "",
  value: "", stage: "Cold", owner: "You", next_action: "", notes: "", last_contact: TODAY(),
  ...overrides,
});

function generateSummary(tasks) {
  const today = TODAY();
  const seanFYA = tasks.filter(t => t.owner === "Sean" && t.status === "FYA");
  const fyi = tasks.filter(t => t.task_type === "FYI" && t.status !== "Done");
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
        <h2 style={{ margin:0,fontSize:20,fontWeight:700,color:"#e2e8f0" }}>{initial.id ? "Edit Task" : "New Task"}</h2>
        <button onClick={onClose} style={{ background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:20 }}>✕</button>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
        <div style={{ gridColumn:"1/-1" }}><Field label="Subject" required><input style={inp} value={form.subject} onChange={(e)=>set("subject",e.target.value)} placeholder="What needs to be done?" /></Field></div>
        <Field label="Client"><input style={inp} value={form.client} onChange={(e)=>set("client",e.target.value)} /></Field>
        <Field label="Company"><input style={inp} value={form.company} onChange={(e)=>set("company",e.target.value)} /></Field>
        <Field label="Email"><input style={inp} value={form.email} onChange={(e)=>set("email",e.target.value)} /></Field>
        <Field label="Date Received"><input type="date" style={inp} value={form.date_received} onChange={(e)=>set("date_received",e.target.value)} /></Field>
        <Field label="Owner" required><select style={inp} value={form.owner} onChange={(e)=>set("owner",e.target.value)}>{OWNERS.map(o=><option key={o}>{o}</option>)}</select></Field>
        <Field label="Status" required><select style={inp} value={form.status} onChange={(e)=>set("status",e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></Field>
        <Field label="Priority"><select style={inp} value={form.priority} onChange={(e)=>set("priority",e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></Field>
        <Field label="Task Type"><select style={inp} value={form.task_type} onChange={(e)=>set("task_type",e.target.value)}>{TASK_TYPES.map(t=><option key={t}>{t}</option>)}</select></Field>
        <Field label="Expected Date" required><input type="date" style={inp} value={form.expected_date} onChange={(e)=>set("expected_date",e.target.value)} /></Field>
        <div style={{ gridColumn:"1/-1" }}><Field label="Next Action" required><input style={inp} value={form.next_action} onChange={(e)=>set("next_action",e.target.value)} /></Field></div>
        <div style={{ gridColumn:"1/-1" }}><Field label="Notes"><textarea style={{ ...inp,minHeight:72,resize:"vertical" }} value={form.notes} onChange={(e)=>set("notes",e.target.value)} /></Field></div>
        {form.status === "Done" && <div style={{ gridColumn:"1/-1" }}><Field label="Outcome"><input style={inp} value={form.outcome} onChange={(e)=>set("outcome",e.target.value)} /></Field></div>}
      </div>
      <div style={{ marginTop:24,display:"flex",gap:10,justifyContent:"flex-end" }}>
        <button onClick={onClose} style={{ padding:"10px 20px",background:"none",border:"1px solid #2a2a45",borderRadius:8,color:"#6b7280",cursor:"pointer" }}>Cancel</button>
        <button disabled={!valid} onClick={()=>{ if(valid){ onSave(form); onClose(); }}} style={{ padding:"10px 24px",background:valid?"#0891b2":"#2a2a45",border:"none",borderRadius:8,color:valid?"#fff":"#4b5563",cursor:valid?"pointer":"not-allowed",fontWeight:600 }}>
          {initial.id ? "Save Changes" : "Create Task"}
        </button>
      </div>
    </div>
  );
}

function LeadForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ ...newLead(), ...initial });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.company && form.stage;
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24 }}>
        <h2 style={{ margin:0,fontSize:20,fontWeight:700,color:"#e2e8f0" }}>{initial.id ? "Edit Lead" : "New Lead"}</h2>
        <button onClick={onClose} style={{ background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:20 }}>✕</button>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
        <Field label="Company" required><input style={inp} value={form.company} onChange={(e)=>set("company",e.target.value)} placeholder="Company name" /></Field>
        <Field label="Contact Name"><input style={inp} value={form.contact} onChange={(e)=>set("contact",e.target.value)} /></Field>
        <Field label="Email"><input style={inp} value={form.email} onChange={(e)=>set("email",e.target.value)} /></Field>
        <Field label="Phone"><input style={inp} value={form.phone} onChange={(e)=>set("phone",e.target.value)} /></Field>
        <Field label="Product Interest"><input style={inp} value={form.product_interest} onChange={(e)=>set("product_interest",e.target.value)} placeholder="e.g. Top Loader Boxes" /></Field>
        <Field label="Deal Value (R)"><input style={inp} value={form.value} onChange={(e)=>set("value",e.target.value)} placeholder="0.00" /></Field>
        <Field label="Stage" required><select style={inp} value={form.stage} onChange={(e)=>set("stage",e.target.value)}>{LEAD_STAGES.map(s=><option key={s}>{s}</option>)}</select></Field>
        <Field label="Owner"><select style={inp} value={form.owner} onChange={(e)=>set("owner",e.target.value)}>{OWNERS.map(o=><option key={o}>{o}</option>)}</select></Field>
        <Field label="Last Contact"><input type="date" style={inp} value={form.last_contact} onChange={(e)=>set("last_contact",e.target.value)} /></Field>
        <div style={{ gridColumn:"1/-1" }}><Field label="Next Action"><input style={inp} value={form.next_action} onChange={(e)=>set("next_action",e.target.value)} /></Field></div>
        <div style={{ gridColumn:"1/-1" }}><Field label="Notes"><textarea style={{ ...inp,minHeight:72,resize:"vertical" }} value={form.notes} onChange={(e)=>set("notes",e.target.value)} /></Field></div>
      </div>
      <div style={{ marginTop:24,display:"flex",gap:10,justifyContent:"flex-end" }}>
        <button onClick={onClose} style={{ padding:"10px 20px",background:"none",border:"1px solid #2a2a45",borderRadius:8,color:"#6b7280",cursor:"pointer" }}>Cancel</button>
        <button disabled={!valid} onClick={()=>{ if(valid){ onSave(form); onClose(); }}} style={{ padding:"10px 24px",background:valid?"#0891b2":"#2a2a45",border:"none",borderRadius:8,color:valid?"#fff":"#4b5563",cursor:valid?"pointer":"not-allowed",fontWeight:600 }}>
          {initial.id ? "Save Changes" : "Add Lead"}
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
      <style>{`@keyframes completeFlash { 0%{background:#0891b2;transform:scale(1);opacity:1} 50%{background:#10b981;transform:scale(1.02);opacity:1} 100%{background:#10b981;transform:scale(0.95);opacity:0;height:0;padding:0;margin:0} }`}</style>
      <div style={{ padding:compact?"10px 12px":"14px 16px",display:"flex",alignItems:"center",gap:10 }}>
        <div style={{ width:22,height:22,borderRadius:"50%",background:"#10b981",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14 }}>✓</div>
        <span style={{ fontSize:14,fontWeight:600,color:"#fff",textDecoration:"line-through" }}>{task.subject}</span>
        <span style={{ marginLeft:"auto",fontSize:12,color:"#a7f3d0" }}>Done! 🎉</span>
      </div>
    </div>
  );

  return (
    <div onClick={()=>onClick(task)}
      style={{ background:"#1a1a2e",border:`1px solid ${over?"#7f1d1d":"#2a2a45"}`,borderLeft:`3px solid ${STATUS_COLOR[task.status]}`,borderRadius:10,padding:compact?"10px 12px":"14px 16px",cursor:"pointer",transition:"transform 0.15s,box-shadow 0.15s",marginBottom:compact?6:10 }}
     onMouseEnter={(e)=>{ e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.4)"; }}
      onMouseLeave={(e)=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8 }}>
        {task.status !== "Done" && (
          <div onClick={handleComplete} style={{ flexShrink:0,width:22,height:22,borderRadius:"50%",border:"2px solid #2a2a45",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",marginTop:2,transition:"all 0.2s" }}
            onMouseEnter={(e)=>{ e.stopPropagation(); e.currentTarget.style.borderColor="#10b981"; e.currentTarget.style.background="#10b98122"; }}
            onMouseLeave={(e)=>{ e.stopPropagation(); e.currentTarget.style.borderColor="#2a2a45"; e.currentTarget.style.background="none"; }}>
          </div>
        )}
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap" }}>
            <span style={{ fontSize:10,color:"#6b7280",fontFamily:"monospace" }}>#{task.id?.toString().slice(-4)}</span>
            <span style={{ fontSize:11,padding:"2px 8px",borderRadius:99,background:STATUS_COLOR[task.status]+"33",color:STATUS_COLOR[task.status],fontWeight:700 }}>{STATUS_EMOJI[task.status]} {task.status}</span>
            <span style={{ fontSize:10,padding:"2px 7px",borderRadius:99,background:PRIORITY_COLOR[task.priority]+"22",color:PRIORITY_COLOR[task.priority],fontWeight:600 }}>{task.priority}</span>
            {over && <span style={{ fontSize:10,padding:"2px 7px",borderRadius:99,background:"#7f1d1d",color:"#fca5a5",fontWeight:600 }}>OVERDUE</span>}
          </div>
          <div style={{ fontSize:14,fontWeight:600,color:"#e2e8f0",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{task.subject||"Untitled"}</div>
          {!compact && <div style={{ fontSize:12,color:"#6b7280" }}>{[task.client,task.company].filter(Boolean).join(" · ")||"No client"}</div>}
        </div>
        <div style={{ textAlign:"right",flexShrink:0 }}>
          <div style={{ fontSize:11,color:"#6b7280",marginBottom:3 }}>{task.owner}</div>
          <div style={{ fontSize:11,color:over?"#fca5a5":"#6b7280" }}>{fmtDate(task.expected_date)}</div>
        </div>
      </div>
      {!compact && task.next_action && <div style={{ marginTop:8,fontSize:12,color:"#0891b2",borderTop:"1px solid #2a2a45",paddingTop:8 }}>→ {task.next_action}</div>}
    </div>
  );
}

function LeadCard({ lead, onClick }) {
  const color = LEAD_STAGE_COLOR[lead.stage];
  return (
    <div onClick={()=>onClick(lead)}
      style={{ background:"#1a1a2e",border:`1px solid #2a2a45`,borderLeft:`3px solid ${color}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",transition:"transform 0.15s,box-shadow 0.15s",marginBottom:8 }}
      onMouseEnter={(e)=>{ e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.4)"; }}
      onMouseLeave={(e)=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8 }}>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4 }}>
            <span style={{ fontSize:11,padding:"2px 8px",borderRadius:99,background:color+"33",color,fontWeight:700 }}>{LEAD_STAGE_EMOJI[lead.stage]} {lead.stage}</span>
            {lead.value && <span style={{ fontSize:10,color:"#10b981",fontWeight:600 }}>R {lead.value}</span>}
          </div>
          <div style={{ fontSize:14,fontWeight:600,color:"#e2e8f0",marginBottom:2 }}>{lead.company}</div>
          {lead.contact && <div style={{ fontSize:12,color:"#6b7280" }}>{lead.contact}</div>}
          {lead.product_interest && <div style={{ fontSize:11,color:"#4b5563",marginTop:2 }}>{lead.product_interest}</div>}
        </div>
        <div style={{ textAlign:"right",flexShrink:0 }}>
          <div style={{ fontSize:11,color:"#6b7280",marginBottom:3 }}>{lead.owner}</div>
          <div style={{ fontSize:11,color:"#4b5563" }}>Last: {fmtDate(lead.last_contact)}</div>
        </div>
      </div>
      {lead.next_action && <div style={{ marginTop:8,fontSize:12,color:"#0891b2",borderTop:"1px solid #2a2a45",paddingTop:8 }}>→ {lead.next_action}</div>}
    </div>
  );
}

function Stat({ label, value, color, onClick }) {
  return (
    <div onClick={onClick} style={{ background:"#1a1a2e",border:"1px solid #2a2a45",borderRadius:12,padding:"20px 24px",cursor:onClick?"pointer":"default",borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:32,fontWeight:800,color }}>{value}</div>
      <div style={{ fontSize:11,color:"#6b7280",marginTop:4,fontWeight:500,letterSpacing:"0.06em",textTransform:"uppercase" }}>{label}</div>
    </div>
  );
}

function KanbanCol({ status, tasks, onClick, onDrop }) {
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={(e)=>{ e.preventDefault(); setOver(true); }} onDragLeave={()=>setOver(false)}
      onDrop={(e)=>{ e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData("taskId"), status); }}
      style={{ flex:1,minWidth:220,background:over?"#1e1e35":"#13131f",border:`1px solid ${over?STATUS_COLOR[status]:"#2a2a45"}`,borderRadius:12,padding:14 }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14 }}>
        <span>{STATUS_EMOJI[status]}</span>
        <span style={{ fontWeight:700,color:"#e2e8f0",fontSize:13 }}>{status}</span>
        <span style={{ marginLeft:"auto",background:"#2a2a45",borderRadius:99,padding:"2px 8px",fontSize:11,color:"#9ca3af" }}>{tasks.length}</span>
      </div>
      {tasks.map(t=>(
        <div key={t.id} draggable onDragStart={(e)=>e.dataTransfer.setData("taskId",String(t.id))}>
          <TaskCard task={t} onClick={onClick} compact />
        </div>
      ))}
      {tasks.length===0 && <div style={{ textAlign:"center",padding:"24px 0",color:"#374151",fontSize:12 }}>Drop tasks here</div>}
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
    <div style={{ background:"#1a1a2e",border:"1px solid #2a2a45",borderRadius:12,padding:20,marginBottom:16 }}>
      <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
        <div style={{ width:40,height:40,borderRadius:"50%",background:"#0891b2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#fff" }}>{name[0]}</div>
        <div>
          <div style={{ fontSize:16,fontWeight:700,color:"#e2e8f0" }}>{name}</div>
          <div style={{ fontSize:11,color:"#6b7280" }}>{active.length} active tasks</div>
        </div>
        {overdue.length>0 && <span style={{ marginLeft:"auto",background:"#7f1d1d",color:"#fca5a5",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700 }}>⚠️ {overdue.length} overdue</span>}
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16 }}>
        {[{label:"Active",value:active.length,color:"#0891b2"},{label:"FYA",value:fya.length,color:"#f97316"},{label:"Follow Up",value:followUp.length,color:"#10b981"},{label:"Done Today",value:done.length,color:"#10b981"}].map(({label,value,color})=>(
          <div key={label} style={{ background:"#13131f",borderRadius:8,padding:10,textAlign:"center",border:"1px solid #2a2a45" }}>
            <div style={{ fontSize:22,fontWeight:800,color }}>{value}</div>
            <div style={{ fontSize:10,color:"#6b7280",marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>
      {active.slice(0,3).map(t=>(
        <div key={t.id} style={{ fontSize:12,color:"#9ca3af",padding:"4px 0",borderBottom:"1px solid #1e1e30",display:"flex",justifyContent:"space-between" }}>
          <span>{STATUS_EMOJI[t.status]} {t.subject}</span>
          <span style={{ color:isOverdue(t)?"#fca5a5":"#4b5563" }}>{fmtDate(t.expected_date)}</span>
        </div>
      ))}
      <button onClick={()=>setShowNotes(!showNotes)} style={{ marginTop:12,background:"none",border:"1px solid #2a2a45",borderRadius:6,color:"#6b7280",cursor:"pointer",fontSize:12,padding:"6px 12px" }}>
        {showNotes?"Hide Notes":"📝 Performance Notes"}
      </button>
      {showNotes && <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder={`Private notes about ${name}...`} style={{ ...inp,marginTop:8,minHeight:80,resize:"vertical" }} />}
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
        <button onClick={onClose} style={{ background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:20 }}>✕</button>
      </div>
      <pre style={{ background:"#0a0a16",border:"1px solid #2a2a45",borderRadius:8,padding:16,color:"#e2e8f0",fontSize:13,whiteSpace:"pre-wrap",fontFamily:"system-ui",lineHeight:1.6,maxHeight:400,overflowY:"auto" }}>{summary}</pre>
      <div style={{ marginTop:16,display:"flex",gap:10,justifyContent:"flex-end" }}>
        <button onClick={onClose} style={{ padding:"10px 20px",background:"none",border:"1px solid #2a2a45",borderRadius:8,color:"#6b7280",cursor:"pointer" }}>Close</button>
        <button onClick={copy} style={{ padding:"10px 24px",background:"#0891b2",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:700 }}>{copied?"✅ Copied!":"📋 Copy for WhatsApp"}</button>
      </div>
    </Modal>
  );
}

function StickyNote({ onClose }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [author, setAuthor] = useState("You");
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
    <div style={{ position:"fixed",bottom:80,right:20,width:300,background:"#13131f",border:"1px solid #1e3a8a",borderRadius:12,zIndex:900,boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
      <div style={{ background:"#1e3a8a",borderRadius:"12px 12px 0 0",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <span style={{ fontSize:14 }}>📝</span>
          <span style={{ fontSize:13,fontWeight:700,color:"#fff" }}>Quick Notes</span>
        </div>
        <button onClick={onClose} style={{ background:"none",border:"none",color:"#93c5fd",cursor:"pointer",fontSize:16 }}>✕</button>
      </div>
      <div style={{ padding:12,maxHeight:240,overflowY:"auto" }}>
        {loading ? <div style={{ color:"#6b7280",fontSize:12,textAlign:"center",padding:16 }}>Loading...</div>
          : notes.length===0 ? <div style={{ color:"#6b7280",fontSize:12,textAlign:"center",padding:16 }}>No notes yet</div>
          : notes.map(n=>(
            <div key={n.id} style={{ background:"#1a1a2e",borderRadius:8,padding:"8px 10px",marginBottom:8,border:"1px solid #2a2a45" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
                <span style={{ fontSize:11,fontWeight:600,color:"#60a5fa" }}>{n.author}</span>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <span style={{ fontSize:10,color:"#4b5563" }}>{fmtDate(n.created_at?.split("T")[0])}</span>
                  <button onClick={()=>deleteNote(n.id)} style={{ background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:12 }}>✕</button>
                </div>
              </div>
              <div style={{ fontSize:13,color:"#e2e8f0",lineHeight:1.4 }}>{n.content}</div>
            </div>
          ))
        }
      </div>
      <div style={{ padding:"10px 12px",borderTop:"1px solid #2a2a45" }}>
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

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [leads, setLeads] = useState([]);
  const [view, setView] = useState("dashboard");
  const [modalTask, setModalTask] = useState(null);
  const [modalLead, setModalLead] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Connecting…");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [leadStageFilter, setLeadStageFilter] = useState("All");

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (!error) { setTasks(data||[]); setStatus("Live"); }
    else { console.error(error); setStatus("Error"); }
  }, []);

  const loadLeads = useCallback(async () => {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (data) setLeads(data);
  }, []);

  useEffect(() => {
    loadTasks();
    loadLeads();
    const taskChannel = supabase.channel("tasks-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"tasks" }, loadTasks)
      .subscribe();
    const leadChannel = supabase.channel("leads-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"leads" }, loadLeads)
      .subscribe();
    const interval = setInterval(() => { loadTasks(); loadLeads(); }, 30000);
    return () => { supabase.removeChannel(taskChannel); supabase.removeChannel(leadChannel); clearInterval(interval); };
  }, [loadTasks, loadLeads]);

  const upsertTask = async (form) => {
    const payload = { subject:form.subject, client:form.client, company:form.company, email:form.email, date_received:form.date_received, owner:form.owner, status:form.status, priority:form.priority, expected_date:form.expected_date, actual_date:form.status==="Done"?(form.actual_date||TODAY()):(form.actual_date||null), next_action:form.next_action, notes:form.notes, outcome:form.outcome, task_type:form.task_type };
    if (form.id) { const {error} = await supabase.from("tasks").update(payload).eq("id",form.id); if(error) console.error(error); }
    else { const {error} = await supabase.from("tasks").insert([payload]); if(error) console.error(error); }
  };

  const upsertLead = async (form) => {
    const payload = { company:form.company, contact:form.contact, email:form.email, phone:form.phone, product_interest:form.product_interest, value:form.value, stage:form.stage, owner:form.owner, next_action:form.next_action, notes:form.notes, last_contact:form.last_contact };
    if (form.id) { await supabase.from("leads").update(payload).eq("id",form.id); }
    else { await supabase.from("leads").insert([payload]); }
  };

  const deleteTask = async (id) => { await supabase.from("tasks").delete().eq("id",id); };
  const deleteLead = async (id) => { await supabase.from("leads").delete().eq("id",id); };
  const moveTask = async (id, newStatus) => {
    const extra = newStatus==="Done"?{actual_date:TODAY()}:{};
    await supabase.from("tasks").update({status:newStatus,...extra}).eq("id",id);
  };

  const q = search.toLowerCase();
  const filtered = tasks.filter(t=>!q||[t.subject,t.client,t.company,t.owner,t.status,t.next_action].some(f=>(f||"").toLowerCase().includes(q)));
  const byStatus = (s) => filtered.filter(t=>t.status===s);
  const overdue = filtered.filter(isOverdue);
  const myTasks = filtered.filter(t=>t.owner==="You");
  const seanTasks = filtered.filter(t=>t.owner==="Sean");
  const noNextAction = filtered.filter(t=>!t.next_action&&t.status!=="Done");
  const completedThisWeek = tasks.filter(t=>t.status==="Done"&&t.actual_date>=thisWeekStart());
  const jasonTasks = tasks.filter(t=>t.owner==="Jason");
  const andreaTasks = tasks.filter(t=>t.owner==="Andrea");
  const filteredLeads = leadStageFilter==="All" ? leads : leads.filter(l=>l.stage===leadStageFilter);
  const hotLeads = leads.filter(l=>l.stage==="Hot"||l.stage==="Negotiating");

  const VIEWS = [
    { id:"dashboard", label:"Dashboard", icon:"⬡" },
    { id:"kanban", label:"Kanban Board", icon:"⊞" },
    { id:"todo", label:"To Do", icon:"🔴", count:byStatus("To Do").length },
    { id:"fya", label:"FYA", icon:"🟠", count:byStatus("FYA").length },
    { id:"followup", label:"Follow Up", icon:"🏌️", count:byStatus("Follow Up").length },
    { id:"done", label:"Done", icon:"✅", count:byStatus("Done").length },
    { id:"overdue", label:"Overdue", icon:"⚠", count:overdue.length },
    { id:"mine", label:"My Tasks", icon:"◉", count:myTasks.length },
    { id:"sean", label:"Sean's Tasks", icon:"◈", count:seanTasks.length },
    { id:"leads", label:"Leads & Pipeline", icon:"🎯", count:hotLeads.length },
    { id:"team", label:"Team", icon:"👥" },
    { id:"all", label:"All Tasks", icon:"≡" },
  ];

  const viewTasks = { todo:byStatus("To Do"), fya:byStatus("FYA"), followup:byStatus("Follow Up"), done:byStatus("Done"), overdue, mine:myTasks, sean:seanTasks, all:filtered };

  const Sidebar = (
    <div style={{ width:220,background:"#0a0a16",borderRight:"1px solid #1e1e30",padding:"24px 12px",display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ padding:"0 8px 24px",borderBottom:"1px solid #1e1e30" }}>
        <img src="https://esbd.co.za/wp-content/uploads/2024/07/4.png" alt="ESBD" style={{ width:120,marginBottom:6 }} />
        <div style={{ fontSize:11,color:"#4b5563",marginTop:2 }}>Operations Tracker</div>
      </div>
      <div style={{ marginTop:16,flex:1,overflowY:"auto" }}>
        {VIEWS.map(v=>(
          <button key={v.id} onClick={()=>{ setView(v.id); setSidebarOpen(false); }}
            style={{ width:"100%",textAlign:"left",padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",background:view===v.id?"#1e1e35":"none",color:view===v.id?"#0891b2":"#6b7280",display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:view===v.id?600:400,marginBottom:2 }}>
            <span style={{ fontSize:14,width:16,textAlign:"center" }}>{v.icon}</span>
            <span style={{ flex:1 }}>{v.label}</span>
            {v.count!==undefined&&v.count>0&&<span style={{ background:v.id==="overdue"?"#7f1d1d":v.id==="leads"?"#1e3a8a":"#2a2a45",color:v.id==="overdue"?"#fca5a5":v.id==="leads"?"#93c5fd":"#9ca3af",borderRadius:99,padding:"1px 7px",fontSize:11 }}>{v.count}</span>}
          </button>
        ))}
      </div>
      <div style={{ paddingTop:16,borderTop:"1px solid #1e1e30" }}>
        <div style={{ fontSize:10,color:"#374151",textAlign:"center",marginBottom:8 }}>
          <span style={{ display:"inline-block",width:6,height:6,borderRadius:"50%",background:status==="Live"?"#10b981":status==="Connecting…"?"#f59e0b":"#ef4444",marginRight:6,verticalAlign:"middle" }} />{status}
        </div>
        <button onClick={()=>setShowNotes(!showNotes)} style={{ width:"100%",padding:"8px",background:"#1e1e30",border:"1px solid #1e3a8a",borderRadius:8,color:"#60a5fa",cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:8 }}>📝 Quick Notes</button>
        <button onClick={()=>setShowSummary(true)} style={{ width:"100%",padding:"8px",background:"#1e1e30",border:"1px solid #2a2a45",borderRadius:8,color:"#0891b2",cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:8 }}>📋 Daily Summary</button>
        <button onClick={()=>setModalTask({})} style={{ width:"100%",padding:"10px",background:"#0891b2",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700 }}>+ New Task</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh",background:"#0d0d1a",color:"#e2e8f0",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column" }}>
      <style>{`*{box-sizing:border-box;} ::-webkit-scrollbar{width:5px;} ::-webkit-scrollbar-track{background:#0d0d1a;} ::-webkit-scrollbar-thumb{background:#2a2a45;border-radius:3px;} select option{background:#1e1e30;}`}</style>

      <div style={{ display:"flex",alignItems:"center",padding:"14px 16px",borderBottom:"1px solid #1e1e30",background:"#0a0a16",gap:12 }}>
        <button onClick={()=>setSidebarOpen(true)} style={{ background:"none",border:"1px solid #2a2a45",borderRadius:7,color:"#6b7280",cursor:"pointer",padding:"6px 10px",fontSize:16 }}>☰</button>
        <span style={{ fontSize:16,fontWeight:800,color:"#e2e8f0",flex:1 }}>{VIEWS.find(v=>v.id===view)?.label}</span>
        <button onClick={()=>setShowNotes(!showNotes)} style={{ padding:"7px 12px",background:"none",border:"1px solid #1e3a8a",borderRadius:7,color:"#60a5fa",cursor:"pointer",fontSize:12,fontWeight:600 }}>📝</button>
        <button onClick={()=>setShowSummary(true)} style={{ padding:"7px 12px",background:"none",border:"1px solid #2a2a45",borderRadius:7,color:"#0891b2",cursor:"pointer",fontSize:12,fontWeight:600 }}>📋</button>
        <button onClick={()=>setModalTask({})} style={{ padding:"7px 14px",background:"#0891b2",border:"none",borderRadius:7,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700 }}>+ New</button>
      </div>

      <div style={{ flex:1,display:"flex",overflow:"hidden" }}>
        <div style={{ display:"flex",flexDirection:"column" }}>{Sidebar}</div>

        {sidebarOpen && (
          <div style={{ position:"fixed",inset:0,zIndex:500,display:"flex" }} onClick={()=>setSidebarOpen(false)}>
            <div style={{ width:240,height:"100%",background:"#0a0a16" }} onClick={e=>e.stopPropagation()}>{Sidebar}</div>
            <div style={{ flex:1,background:"rgba(0,0,0,0.5)" }} />
          </div>
        )}

        <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
          <div style={{ padding:"14px 20px",borderBottom:"1px solid #1e1e30",background:"#0a0a16",display:"flex",alignItems:"center",gap:12 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ ...inp,maxWidth:340,padding:"8px 14px" }} />
          </div>

          <div style={{ flex:1,overflowY:"auto",padding:28 }}>

            {view==="dashboard" && (
              <div>
                {(tasks.filter(t=>t.task_type==="FYI"&&t.status!=="Done").length>0||seanTasks.filter(t=>t.status==="FYA").length>0) && (
                  <div style={{ marginBottom:28,border:"0.5px solid #2a2a45",borderRadius:12,overflow:"hidden" }}>
                    <div style={{ padding:"10px 16px",borderBottom:"0.5px solid #2a2a45",display:"flex",alignItems:"center",gap:8 }}>
                      <div style={{ fontSize:11,fontWeight:600,color:"#6b7280",letterSpacing:"0.08em",textTransform:"uppercase" }}>Daily Briefing</div>
                    </div>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr" }}>
                      <div style={{ padding:"14px 16px",borderRight:"0.5px solid #2a2a45" }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
                          <div style={{ width:8,height:8,borderRadius:"50%",background:"#f97316" }} />
                          <span style={{ fontSize:11,fontWeight:600,color:"#6b7280",letterSpacing:"0.06em",textTransform:"uppercase" }}>FYA — Sean</span>
                          <span style={{ marginLeft:"auto",fontSize:11,background:"#1e1e30",border:"0.5px solid #2a2a45",borderRadius:99,padding:"1px 8px",color:"#6b7280" }}>{seanTasks.filter(t=>t.status==="FYA").length}</span>
                        </div>
                        {seanTasks.filter(t=>t.status==="FYA").length===0
                          ? <div style={{ fontSize:12,color:"#374151",padding:"8px 0" }}>No FYA for Sean</div>
                          : seanTasks.filter(t=>t.status==="FYA").map(t=>(
                            <div key={t.id} onClick={()=>setModalTask(t)} style={{ borderLeft:"2px solid #f97316",padding:"8px 10px",background:"#1a1a2e",borderRadius:"0 8px 8px 0",marginBottom:8,cursor:"pointer" }}>
                              <div style={{ fontSize:13,fontWeight:500,color:"#e2e8f0",marginBottom:2 }}>{t.subject}</div>
                              <div style={{ fontSize:11,color:"#6b7280" }}>{t.client||t.company||"—"} · {fmtDate(t.date_received)}</div>
                            </div>
                          ))
                        }
                      </div>
                      <div style={{ padding:"14px 16px" }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
                          <div style={{ width:8,height:8,borderRadius:"50%",background:"#1e3a8a" }} />
                          <span style={{ fontSize:11,fontWeight:600,color:"#6b7280",letterSpacing:"0.06em",textTransform:"uppercase" }}>FYI</span>
                          <span style={{ marginLeft:"auto",fontSize:11,background:"#1e1e30",border:"0.5px solid #2a2a45",borderRadius:99,padding:"1px 8px",color:"#6b7280" }}>{tasks.filter(t=>t.task_type==="FYI"&&t.status!=="Done").length}</span>
                        </div>
                        {tasks.filter(t=>t.task_type==="FYI"&&t.status!=="Done").length===0
                          ? <div style={{ fontSize:12,color:"#374151",padding:"8px 0" }}>No FYI items</div>
                          : tasks.filter(t=>t.task_type==="FYI"&&t.status!=="Done").map(t=>(
                            <div key={t.id} onClick={()=>setModalTask(t)} style={{ borderLeft:"2px solid #1e3a8a",padding:"8px 10px",background:"#1a1a2e",borderRadius:"0 8px 8px 0",marginBottom:8,cursor:"pointer" }}>
                              <div style={{ fontSize:13,fontWeight:500,color:"#e2e8f0",marginBottom:2 }}>{t.subject}</div>
                              <div style={{ fontSize:11,color:"#6b7280" }}>{t.client||t.company||"—"} · {fmtDate(t.date_received)}</div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:28 }}>
                  <Stat label="FYA" value={byStatus("FYA").length} color="#f97316" onClick={()=>setView("fya")} />
                  <Stat label="To Do" value={byStatus("To Do").length} color="#ef4444" onClick={()=>setView("todo")} />
                  <Stat label="Follow Up" value={byStatus("Follow Up").length} color="#10b981" onClick={()=>setView("followup")} />
                  <Stat label="Overdue" value={overdue.length} color="#ef4444" onClick={()=>setView("overdue")} />
                  <Stat label="Done This Week" value={completedThisWeek.length} color="#0891b2" />
                  <Stat label="Hot Leads" value={hotLeads.length} color="#1e3a8a" onClick={()=>setView("leads")} />
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
                  {[
                    { title:"⚠️ Overdue", items:overdue.slice(0,5), empty:"No overdue tasks 🎉" },
                    { title:"⚡ No Next Action", items:noNextAction.slice(0,5), empty:"All tasks have next actions ✓" },
                    { title:"✅ Done This Week", items:completedThisWeek.slice(0,5), empty:"None yet this week" },
                  ].map(({title,items,empty})=>(
                    <div key={title}>
                      <div style={{ fontSize:12,fontWeight:700,color:"#6b7280",marginBottom:10,letterSpacing:"0.06em",textTransform:"uppercase" }}>{title}</div>
                      {items.length===0?<div style={{ color:"#374151",fontSize:13,padding:"12px 0" }}>{empty}</div>:items.map(t=><TaskCard key={t.id} task={t} onClick={t=>setModalTask(t)} onComplete={(id)=>moveTask(id,"Done")} compact />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view==="kanban" && (
              <div style={{ display:"flex",gap:12,overflowX:"auto",paddingBottom:8,minHeight:400 }}>
                {STATUSES.map(s=><KanbanCol key={s} status={s} tasks={tasks.filter(t=>t.status===s)} onClick={t=>setModalTask(t)} onDrop={moveTask} />)}
              </div>
            )}

            {view==="leads" && (
              <div>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12 }}>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:8,flex:1 }}>
                    {LEAD_STAGES.map(s=>(
                      <div key={s} style={{ background:"#1a1a2e",borderRadius:10,padding:"10px 12px",textAlign:"center",border:`1px solid ${leadStageFilter===s?LEAD_STAGE_COLOR[s]:"#2a2a45"}`,cursor:"pointer" }} onClick={()=>setLeadStageFilter(leadStageFilter===s?"All":s)}>
                        <div style={{ fontSize:18,marginBottom:2 }}>{LEAD_STAGE_EMOJI[s]}</div>
                        <div style={{ fontSize:20,fontWeight:800,color:LEAD_STAGE_COLOR[s] }}>{leads.filter(l=>l.stage===s).length}</div>
                        <div style={{ fontSize:10,color:"#6b7280" }}>{s}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setModalLead({})} style={{ padding:"10px 20px",background:"#0891b2",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700,flexShrink:0 }}>+ Add Lead</button>
                </div>
                {leadStageFilter!=="All" && (
                  <div style={{ marginBottom:12,display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ fontSize:12,color:"#6b7280" }}>Showing: {LEAD_STAGE_EMOJI[leadStageFilter]} {leadStageFilter}</span>
                    <button onClick={()=>setLeadStageFilter("All")} style={{ background:"none",border:"1px solid #2a2a45",borderRadius:6,color:"#6b7280",cursor:"pointer",fontSize:11,padding:"2px 8px" }}>Clear filter</button>
                  </div>
                )}
                {filteredLeads.length===0
                  ? <div style={{ textAlign:"center",padding:"60px 0",color:"#374151" }}><div style={{ fontSize:40,marginBottom:12 }}>🎯</div><div>No leads yet — click + Add Lead to get started</div></div>
                  : filteredLeads.map(l=><LeadCard key={l.id} lead={l} onClick={l=>setModalLead(l)} />)
                }
              </div>
            )}

            {view==="team" && (
              <div>
                <div style={{ fontSize:12,fontWeight:700,color:"#6b7280",marginBottom:16,letterSpacing:"0.06em",textTransform:"uppercase" }}>Team Performance</div>
                <TeamCard name="Jason" tasks={jasonTasks} />
                <TeamCard name="Andrea" tasks={andreaTasks} />
              </div>
            )}

            {!["dashboard","kanban","leads","team"].includes(view) && (
              <div>
                {(viewTasks[view]||[]).length===0
                  ? <div style={{ textAlign:"center",padding:"60px 0",color:"#374151" }}><div style={{ fontSize:40,marginBottom:12 }}>◌</div><div style={{ fontSize:15 }}>No tasks here</div></div>
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

      {modalLead !== null && (
        <Modal onClose={()=>setModalLead(null)}>
          {modalLead.id
            ? <div>
                <LeadForm initial={modalLead} onSave={upsertLead} onClose={()=>setModalLead(null)} />
                <div style={{ marginTop:16,borderTop:"1px solid #2a2a45",paddingTop:16,display:"flex",justifyContent:"flex-end" }}>
                  <button onClick={()=>{ if(window.confirm("Delete this lead?")){ deleteLead(modalLead.id); setModalLead(null); }}} style={{ padding:"6px 14px",background:"none",border:"1px solid #7f1d1d",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:12 }}>Delete Lead</button>
                </div>
              </div>
            : <LeadForm initial={newLead()} onSave={upsertLead} onClose={()=>setModalLead(null)} />
          }
        </Modal>
      )}

      {showSummary && <SummaryModal tasks={tasks} onClose={()=>setShowSummary(false)} />}
      {showNotes && <StickyNote onClose={()=>setShowNotes(false)} />}
    </div>
  );
}
