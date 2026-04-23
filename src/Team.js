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

const STATUS_COLOR = { "To Do": "#ef4444", "FYA": "#f97316", "Follow Up": "#10b981", "FYI": "#8b5cf6", "Done": "#0891b2" };
const STATUS_EMOJI = { "To Do": "🔴", "FYA": "🟠", "Follow Up": "🏌️", "FYI": "🟣", "Done": "✅" };
const STATUSES = ["To Do", "FYA", "Follow Up", "FYI", "Done"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const PRIORITY_COLOR = { Low: "#6b7280", Medium: "#0891b2", High: "#f59e0b", Urgent: "#ef4444" };
const TASK_TYPES = ["Quote", "Order Request", "Information Request", "Complaint", "Follow-up", "Internal Admin", "FYI"];
const URGENCY_LEVELS = ["Low", "Medium", "High", "Urgent"];
const URGENCY_COLOR = { Low: "#6b7280", Medium: "#0891b2", High: "#f59e0b", Urgent: "#ef4444" };
const INTERACTION_TYPES = ["📞 Call", "📧 Email", "🤝 Meeting", "🏢 Site Visit", "💬 WhatsApp", "📋 Other"];
const ALL_OWNERS = ["Vanya", "Sean", "Jason", "Andrea"];

const inp = { background:"#1e1e30", border:"1px solid #2a2a45", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };
const label = { fontSize:11, fontWeight:600, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6 };

function TaskActivityFeed({ taskId, taskNotes, myName }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

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
      task_id: taskId, changed_by: myName, entry_type: "note",
      note: newNote.trim(), old_status: null, new_status: null,
    }]);
    setNewNote("");
    setSaving(false);
    load();
  };

  if (loading) return null;

  return (
    <div style={{ marginTop:16, borderTop:"1px solid #2a2a45", paddingTop:16 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>📋 Activity & Notes</div>
      <div style={{ background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:10, padding:12, marginBottom:12 }}>
        <textarea value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Add a note or update..." style={{ ...inp, minHeight:60, resize:"vertical", marginBottom:8, background:"#13131f" }} />
        <div style={{ display:"flex", justifyContent:"flex-end" }}>
          <button onClick={addNote} disabled={!newNote.trim()||saving} style={{ padding:"7px 18px", background:newNote.trim()?"#0891b2":"#2a2a45", border:"none", borderRadius:7, color:newNote.trim()?"#fff":"#4b5563", cursor:newNote.trim()?"pointer":"not-allowed", fontSize:13, fontWeight:600 }}>
            {saving ? "Saving..." : "Add Note"}
          </button>
        </div>
      </div>
      {taskNotes && taskNotes.trim() && (
        <div style={{ display:"flex", gap:12, marginBottom:12 }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:"#1e3a8a", border:"2px solid #3b82f6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0 }}>📌</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#60a5fa", marginBottom:4 }}>📌 Original Notes</div>
            <div style={{ background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#e2e8f0", lineHeight:1.5 }}>{taskNotes}</div>
          </div>
        </div>
      )}
      {history.length === 0 && (!taskNotes || !taskNotes.trim())
        ? <div style={{ fontSize:12, color:"#374151", textAlign:"center", padding:"8px 0" }}>No activity yet</div>
        : history.map((h, i) => (
          <div key={h.id} style={{ display:"flex", gap:12, marginBottom:0 }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:h.entry_type==="note"?"#1e3a8a":STATUS_COLOR[h.new_status]+"33", border:"2px solid " + (h.entry_type==="note"?"#3b82f6":STATUS_COLOR[h.new_status]||"#2a2a45"), display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>
                {h.entry_type==="note" ? "💬" : STATUS_EMOJI[h.new_status]||"📌"}
              </div>
              {i < history.length-1 && <div style={{ width:2, flex:1, background:"#1e1e30", minHeight:16, margin:"2px 0" }} />}
            </div>
            <div style={{ flex:1, paddingBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#9ca3af" }}>
                  {h.entry_type==="note"
                    ? <span style={{ color:"#60a5fa" }}>{h.changed_by}</span>
                    : <span>{h.changed_by}: <span style={{ color:STATUS_COLOR[h.old_status]||"#6b7280" }}>{h.old_status}</span> → <span style={{ color:STATUS_COLOR[h.new_status]||"#0891b2" }}>{h.new_status}</span></span>
                  }
                </div>
                <div style={{ fontSize:10, color:"#4b5563", flexShrink:0, marginLeft:8 }}>{fmtDateTime(h.created_at)}</div>
              </div>
              {h.note && <div style={{ background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#e2e8f0", lineHeight:1.5 }}>{h.note}</div>}
            </div>
          </div>
        ))
      }
    </div>
  );
}

function NewTaskModal({ myName, onClose, onSaved }) {
  const [form, setForm] = useState({
    subject:"", client:"", company:"", email:"",
    date_received: TODAY(), owner: myName, status:"To Do", priority:"Medium",
    expected_date:"", next_action:"", notes:"", task_type:"Information Request"
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const valid = form.subject && form.owner && form.status && form.expected_date && form.next_action;

  const save = async () => {
    if (!valid) return;
    await supabase.from("tasks").insert([form]);
    onSaved();
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#13131f", border:"1px solid #2a2a45", borderRadius:16, padding:"24px", maxWidth:600, width:"95vw", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:"#e2e8f0" }}>New Task</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:20 }}>✕</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={label}>Subject *</label>
            <input style={inp} value={form.subject} onChange={e=>set("subject",e.target.value)} placeholder="What needs to be done?" />
          </div>
          <div>
            <label style={label}>Client</label>
            <input style={inp} value={form.client} onChange={e=>set("client",e.target.value)} />
          </div>
          <div>
            <label style={label}>Company</label>
            <input style={inp} value={form.company} onChange={e=>set("company",e.target.value)} />
          </div>
          <div>
            <label style={label}>Owner *</label>
            <select style={inp} value={form.owner} onChange={e=>set("owner",e.target.value)}>
              {ALL_OWNERS.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Status *</label>
            <select style={inp} value={form.status} onChange={e=>set("status",e.target.value)}>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Priority</label>
            <select style={inp} value={form.priority} onChange={e=>set("priority",e.target.value)}>
              {PRIORITIES.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Task Type</label>
            <select style={inp} value={form.task_type} onChange={e=>set("task_type",e.target.value)}>
              {TASK_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Expected Date *</label>
            <input type="date" style={inp} value={form.expected_date} onChange={e=>set("expected_date",e.target.value)} />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={label}>Next Action *</label>
            <input style={inp} value={form.next_action} onChange={e=>set("next_action",e.target.value)} placeholder="What needs to happen next?" />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={label}>Notes</label>
            <textarea value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, minHeight:72, resize:"vertical" }} placeholder="Add context or background..." />
          </div>
        </div>
        <div style={{ marginTop:20, display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 20px", background:"none", border:"1px solid #2a2a45", borderRadius:8, color:"#6b7280", cursor:"pointer" }}>Cancel</button>
          <button onClick={save} disabled={!valid} style={{ padding:"10px 24px", background:valid?"#0891b2":"#2a2a45", border:"none", borderRadius:8, color:valid?"#fff":"#4b5563", cursor:valid?"pointer":"not-allowed", fontWeight:600 }}>
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskModal({ task, myName, onClose, onUpdate, onDelete }) {
  const [form, setForm] = useState({ status:task.status, expected_date:task.expected_date||"", next_action:task.next_action||"", notes:task.notes||"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEdit = task.owner === myName || task.owner === (myName === "Jason" ? "Andrea" : "Jason");

  const save = async () => {
    await supabase.from("tasks").update({
      status: form.status, expected_date: form.expected_date,
      next_action: form.next_action, notes: form.notes,
      actual_date: form.status === "Done" ? TODAY() : null,
    }).eq("id", task.id);
    if (task.status !== form.status) {
      await supabase.from("task_history").insert([{
        task_id: task.id, changed_by: myName, entry_type: "status_change",
        old_status: task.status, new_status: form.status, note: null
      }]);
    }
    onUpdate(); onClose();
  };

  const markDone = async () => {
    await supabase.from("tasks").update({ status:"Done", actual_date:TODAY() }).eq("id", task.id);
    await supabase.from("task_history").insert([{
      task_id: task.id, changed_by: myName, entry_type: "status_change",
      old_status: task.status, new_status: "Done", note: null
    }]);
    onUpdate(); onClose();
  };

  const deleteTask = async () => {
    await supabase.from("tasks").delete().eq("id", task.id);
    onDelete(); onClose();
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(10,10,20,0.8)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#13131f", border:"1px solid #2a2a45", borderRadius:16, padding:"24px", maxWidth:600, width:"95vw", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div style={{ flex:1, paddingRight:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
              <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:STATUS_COLOR[task.status]+"33", color:STATUS_COLOR[task.status], fontWeight:700 }}>{STATUS_EMOJI[task.status]} {task.status}</span>
              <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99, background:PRIORITY_COLOR[task.priority]+"22", color:PRIORITY_COLOR[task.priority], fontWeight:600 }}>{task.priority}</span>
              {isOverdue(task) && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99, background:"#7f1d1d", color:"#fca5a5", fontWeight:600 }}>OVERDUE</span>}
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:"#e2e8f0", lineHeight:1.3 }}>{task.subject}</div>
            {(task.client||task.company) && <div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>{[task.client,task.company].filter(Boolean).join(" · ")}</div>}
            <div style={{ fontSize:11, color:"#4b5563", marginTop:4 }}>Assigned to {task.owner}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:20 }}>✕</button>
        </div>

        {canEdit ? (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <label style={label}>Status</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {STATUSES.map(s => (
                  <button key={s} onClick={()=>set("status",s)} style={{ padding:"7px 12px", borderRadius:99, border:"1px solid " + (form.status===s?STATUS_COLOR[s]:"#2a2a45"), background:form.status===s?STATUS_COLOR[s]+"33":"none", color:form.status===s?STATUS_COLOR[s]:"#6b7280", cursor:"pointer", fontSize:12, fontWeight:form.status===s?700:400 }}>
                    {STATUS_EMOJI[s]} {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={label}>Follow Up Date</label>
              <input type="date" value={form.expected_date} onChange={e=>set("expected_date",e.target.value)} style={inp} />
            </div>
            <div>
              <label style={label}>Next Action</label>
              <input value={form.next_action} onChange={e=>set("next_action",e.target.value)} style={inp} />
            </div>
            <div>
              <label style={label}>Notes</label>
              <textarea value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, minHeight:72, resize:"vertical" }} />
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={save} style={{ flex:1, padding:"11px", background:"#0891b2", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:14, fontWeight:700 }}>Save Changes</button>
              {task.status !== "Done" && <button onClick={markDone} style={{ padding:"11px 20px", background:"#10b98122", border:"1px solid #10b981", borderRadius:8, color:"#10b981", cursor:"pointer", fontSize:14, fontWeight:700 }}>✓ Done</button>}
            </div>
            <div style={{ borderTop:"1px solid #2a2a45", paddingTop:12 }}>
              {!confirmDelete ? (
                <button onClick={()=>setConfirmDelete(true)} style={{ width:"100%", padding:"9px", background:"none", border:"1px solid #7f1d1d", borderRadius:8, color:"#ef4444", cursor:"pointer", fontSize:13 }}>
                  🗑️ Delete Task
                </button>
              ) : (
                <div style={{ background:"#7f1d1d22", border:"1px solid #ef4444", borderRadius:8, padding:12 }}>
                  <div style={{ fontSize:13, color:"#fca5a5", marginBottom:10, textAlign:"center" }}>Are you sure? This cannot be undone.</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>setConfirmDelete(false)} style={{ flex:1, padding:"8px", background:"none", border:"1px solid #2a2a45", borderRadius:7, color:"#6b7280", cursor:"pointer" }}>Cancel</button>
                    <button onClick={deleteTask} style={{ flex:1, padding:"8px", background:"#ef4444", border:"none", borderRadius:7, color:"#fff", cursor:"pointer", fontWeight:700 }}>Yes, Delete</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:10, padding:14, marginBottom:12 }}>
            <div style={{ fontSize:12, color:"#6b7280", marginBottom:6 }}>Assigned to <span style={{ color:"#0891b2", fontWeight:600 }}>{task.owner}</span> — view only</div>
            {task.next_action && <div style={{ fontSize:13, color:"#0891b2" }}>→ {task.next_action}</div>}
            {task.expected_date && <div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>Due {fmtDate(task.expected_date)}</div>}
            {task.notes && <div style={{ fontSize:13, color:"#9ca3af", marginTop:8, fontStyle:"italic" }}>📝 {task.notes}</div>}
          </div>
        )}

        <TaskActivityFeed taskId={task.id} taskNotes={task.notes} myName={myName} />
      </div>
    </div>
  );
}

function FlagSeanModal({ task, myName, onClose, onSent }) {
  const [urgency, setUrgency] = useState("Medium");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!note.trim()) return;
    setSending(true);
    await supabase.from("flags").insert([{
      from_name: myName, task_id: task?.id||null,
      task_subject: task?.subject||"General flag",
      urgency, note: note.trim(), seen: false,
    }]);
    setSending(false);
    onSent(); onClose();
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:1100, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#13131f", border:"1px solid #ef4444", borderRadius:16, padding:"24px", maxWidth:480, width:"95vw" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:"#e2e8f0" }}>🚨 Flag Sean</div>
            {task && <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>Re: {task.subject}</div>}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:20 }}>✕</button>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={label}>Urgency</label>
          <div style={{ display:"flex", gap:8 }}>
            {URGENCY_LEVELS.map(u => (
              <button key={u} onClick={()=>setUrgency(u)} style={{ flex:1, padding:"8px 4px", borderRadius:8, border:"1px solid " + (urgency===u?URGENCY_COLOR[u]:"#2a2a45"), background:urgency===u?URGENCY_COLOR[u]+"33":"none", color:urgency===u?URGENCY_COLOR[u]:"#6b7280", cursor:"pointer", fontSize:12, fontWeight:urgency===u?700:400 }}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={label}>Message to Sean</label>
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="What does Sean need to know or do?" style={{ ...inp, minHeight:90, resize:"vertical" }} />
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:"11px", background:"none", border:"1px solid #2a2a45", borderRadius:8, color:"#6b7280", cursor:"pointer" }}>Cancel</button>
          <button onClick={send} disabled={!note.trim()||sending} style={{ flex:2, padding:"11px", background:note.trim()?"#ef4444":"#2a2a45", border:"none", borderRadius:8, color:note.trim()?"#fff":"#4b5563", cursor:note.trim()?"pointer":"not-allowed", fontSize:14, fontWeight:700 }}>
            {sending ? "Sending..." : "🚨 Send Flag to Sean"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditFlagModal({ flag, onClose, onSaved, onDeleted }) {
  const [urgency, setUrgency] = useState(flag.urgency || "Medium");
  const [note, setNote] = useState(flag.note || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    setSaving(true);
    await supabase.from("flags").update({ urgency, note }).eq("id", flag.id);
    setSaving(false);
    onSaved(); onClose();
  };

  const deleteFlag = async () => {
    await supabase.from("flags").delete().eq("id", flag.id);
    onDeleted(); onClose();
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:1200, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#13131f", border:"1px solid #f97316", borderRadius:16, padding:"24px", maxWidth:480, width:"95vw" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:"#e2e8f0" }}>✏️ Edit Flag</div>
            {flag.task_subject && <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>Re: {flag.task_subject}</div>}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:20 }}>✕</button>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={label}>Urgency</label>
          <div style={{ display:"flex", gap:8 }}>
            {URGENCY_LEVELS.map(u => (
              <button key={u} onClick={()=>setUrgency(u)} style={{ flex:1, padding:"8px 4px", borderRadius:8, border:"1px solid " + (urgency===u?URGENCY_COLOR[u]:"#2a2a45"), background:urgency===u?URGENCY_COLOR[u]+"33":"none", color:urgency===u?URGENCY_COLOR[u]:"#6b7280", cursor:"pointer", fontSize:12, fontWeight:urgency===u?700:400 }}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={label}>Message to Sean</label>
          <textarea value={note} onChange={e=>setNote(e.target.value)} style={{ ...inp, minHeight:90, resize:"vertical" }} />
        </div>
        <div style={{ display:"flex", gap:10, marginBottom:12 }}>
          <button onClick={onClose} style={{ flex:1, padding:"11px", background:"none", border:"1px solid #2a2a45", borderRadius:8, color:"#6b7280", cursor:"pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex:2, padding:"11px", background:"#f97316", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:14, fontWeight:700 }}>
            {saving ? "Saving..." : "💾 Save Changes"}
          </button>
        </div>
        <div style={{ borderTop:"1px solid #2a2a45", paddingTop:12 }}>
          {!confirmDelete ? (
            <button onClick={()=>setConfirmDelete(true)} style={{ width:"100%", padding:"9px", background:"none", border:"1px solid #7f1d1d", borderRadius:8, color:"#ef4444", cursor:"pointer", fontSize:13 }}>
              🗑️ Undo — Delete this flag
            </button>
          ) : (
            <div style={{ background:"#7f1d1d22", border:"1px solid #ef4444", borderRadius:8, padding:12 }}>
              <div style={{ fontSize:13, color:"#fca5a5", marginBottom:10, textAlign:"center" }}>Remove this flag from Sean's view?</div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setConfirmDelete(false)} style={{ flex:1, padding:"8px", background:"none", border:"1px solid #2a2a45", borderRadius:7, color:"#6b7280", cursor:"pointer" }}>Cancel</button>
                <button onClick={deleteFlag} style={{ flex:1, padding:"8px", background:"#ef4444", border:"none", borderRadius:7, color:"#fff", cursor:"pointer", fontWeight:700 }}>Yes, Remove</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogInteractionModal({ myName, tasks, onClose, onSaved }) {
  const [form, setForm] = useState({
    interaction_date: TODAY(), client:"", company:"",
    type:"📞 Call", notes:"", outcome:"", logged_by: myName
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const [taskSearch, setTaskSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskList, setShowTaskList] = useState(false);
  const taskSearchRef = useRef(null);
  const valid = form.client && form.notes;

  // ✅ Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (taskSearchRef.current && !taskSearchRef.current.contains(e.target)) {
        setShowTaskList(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const myTasks = tasks.filter(t => t.owner === myName && t.status !== "Done");
  const filteredTasks = myTasks.filter(t =>
    !taskSearch.trim() ||
    (t.subject||"").toLowerCase().includes(taskSearch.toLowerCase()) ||
    (t.client||"").toLowerCase().includes(taskSearch.toLowerCase()) ||
    (t.company||"").toLowerCase().includes(taskSearch.toLowerCase())
  );

  const selectTask = (t) => {
    setSelectedTask(t);
    setTaskSearch(t.subject);
    setShowTaskList(false);
    if (t.client) set("client", t.client);
    if (t.company) set("company", t.company);
  };

  const clearTask = () => {
    setSelectedTask(null);
    setTaskSearch("");
    set("client","");
    set("company","");
  };

  const save = async () => {
    if (!valid) return;
    await supabase.from("interactions").insert([{ ...form }]);
    onSaved(); onClose();
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#13131f", border:"1px solid #2a2a45", borderRadius:16, padding:"24px", maxWidth:520, width:"95vw", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:"#e2e8f0" }}>📋 Log Interaction</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:20 }}>✕</button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {/* ✅ Task search with click-outside ref */}
          <div ref={taskSearchRef} style={{ position:"relative" }}>
            <label style={label}>Link to My Task (optional)</label>
            <div style={{ position:"relative" }}>
              <input
                value={taskSearch}
                onChange={e=>{ setTaskSearch(e.target.value); setShowTaskList(true); setSelectedTask(null); }}
                onFocus={()=>setShowTaskList(true)}
                placeholder="Search your tasks..."
                style={{ ...inp, paddingRight: selectedTask ? 36 : 12 }}
              />
              {selectedTask && (
                <button onClick={clearTask} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:16 }}>✕</button>
              )}
            </div>
            {showTaskList && !selectedTask && (
              <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:8, zIndex:200, maxHeight:200, overflowY:"auto", marginTop:4 }}>
                {filteredTasks.length === 0
                  ? <div style={{ padding:"10px 14px", fontSize:13, color:"#4b5563" }}>No matching tasks</div>
                  : filteredTasks.map(t => (
                    <div
                      key={t.id}
                      onMouseDown={e=>{ e.preventDefault(); selectTask(t); }}
                      style={{ padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid #2a2a45", fontSize:13 }}
                      onMouseEnter={e=>e.currentTarget.style.background="#2a2a45"}
                      onMouseLeave={e=>e.currentTarget.style.background="none"}
                    >
                      <div style={{ fontWeight:600, color:"#e2e8f0", marginBottom:2 }}>{t.subject}</div>
                      {(t.client||t.company) && <div style={{ fontSize:11, color:"#6b7280" }}>{[t.client,t.company].filter(Boolean).join(" · ")}</div>}
                    </div>
                  ))
                }
              </div>
            )}
            {selectedTask && (
              <div style={{ marginTop:6, padding:"6px 10px", background:"#0891b222", border:"1px solid #0891b244", borderRadius:6, fontSize:12, color:"#0891b2" }}>
                Linked to: {selectedTask.subject}
              </div>
            )}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label style={label}>Client / Contact *</label>
              <input style={inp} value={form.client} onChange={e=>set("client",e.target.value)} placeholder="Name" />
            </div>
            <div>
              <label style={label}>Company</label>
              <input style={inp} value={form.company} onChange={e=>set("company",e.target.value)} />
            </div>
            <div>
              <label style={label}>Type</label>
              <select style={inp} value={form.type} onChange={e=>set("type",e.target.value)}>
                {INTERACTION_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Date</label>
              <input type="date" style={inp} value={form.interaction_date} onChange={e=>set("interaction_date",e.target.value)} />
            </div>
          </div>
          <div>
            <label style={label}>What was discussed? *</label>
            <textarea value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Summary of the interaction..." style={{ ...inp, minHeight:80, resize:"vertical" }} />
          </div>
          <div>
            <label style={label}>Outcome</label>
            <input style={inp} value={form.outcome} onChange={e=>set("outcome",e.target.value)} placeholder="What was agreed or what happens next?" />
          </div>
        </div>
        <div style={{ marginTop:20, display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 20px", background:"none", border:"1px solid #2a2a45", borderRadius:8, color:"#6b7280", cursor:"pointer" }}>Cancel</button>
          <button onClick={save} disabled={!valid} style={{ padding:"10px 24px", background:valid?"#0891b2":"#2a2a45", border:"none", borderRadius:8, color:valid?"#fff":"#4b5563", cursor:valid?"pointer":"not-allowed", fontWeight:600 }}>Log It</button>
        </div>
      </div>
    </div>
  );
}

function WeeklyReportModal({ interactions, myName, onClose }) {
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split("T")[0]; })();
  const thisWeek = interactions.filter(i => i.interaction_date >= weekStart);
  const [edited, setEdited] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const grouped = thisWeek.reduce((acc, i) => {
    const key = i.company || i.client;
    if (!acc[key]) acc[key] = [];
    acc[key].push(i);
    return acc;
  }, {});

  const generateReport = () => {
    let report = "📊 *Weekly Customer Interaction Report*\n";
    report += "Week of " + new Date(weekStart+"T00:00:00").toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) + "\n";
    report += "Logged by: " + myName + "\n\n";
    Object.entries(grouped).forEach(([company, items]) => {
      report += "*" + company + "*\n";
      items.forEach(i => {
        report += "• " + i.type + " — " + i.notes;
        if (i.outcome) report += " → " + i.outcome;
        report += "\n";
      });
      report += "\n";
    });
    if (thisWeek.length === 0) report += "No interactions logged this week.";
    return report;
  };

  useEffect(() => { setEdited(generateReport()); }, []);

  const sendToSean = async () => {
    setSending(true);
    await supabase.from("flags").insert([{ from_name: myName, task_id: null, task_subject: "Weekly Customer Report", urgency: "Low", note: edited, seen: false }]);
    if (thisWeek.length > 0) await supabase.from("interactions").update({ week_sent: true }).in("id", thisWeek.map(i=>i.id));
    setSending(false);
    setSent(true);
    setTimeout(onClose, 2000);
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#13131f", border:"1px solid #2a2a45", borderRadius:16, padding:"24px", maxWidth:600, width:"95vw", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:"#e2e8f0" }}>📊 Weekly Report</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:20 }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:"#6b7280", marginBottom:12 }}>{thisWeek.length} interactions this week — edit before sending</div>
        <textarea value={edited} onChange={e=>setEdited(e.target.value)} style={{ ...inp, minHeight:300, resize:"vertical", fontFamily:"monospace", fontSize:13, lineHeight:1.6, marginBottom:16 }} />
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 20px", background:"none", border:"1px solid #2a2a45", borderRadius:8, color:"#6b7280", cursor:"pointer" }}>Close</button>
          <button onClick={sendToSean} disabled={sending||sent} style={{ padding:"10px 24px", background:sent?"#10b981":"#0891b2", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontWeight:700 }}>
            {sent ? "✅ Sent to Sean!" : sending ? "Sending..." : "📤 Send to Sean"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Team() {
  const [myName, setMyName] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [flags, setFlags] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("mine");
  const [selectedTask, setSelectedTask] = useState(null);
  const [flagTask, setFlagTask] = useState(undefined);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showLogInteraction, setShowLogInteraction] = useState(false);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [editingFlag, setEditingFlag] = useState(null);
  const [flagSent, setFlagSent] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data: t } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    const { data: f } = await supabase.from("flags").select("*").order("created_at", { ascending: false });
    const { data: i } = await supabase.from("interactions").select("*").order("interaction_date", { ascending: false });
    if (t) setTasks(t);
    if (f) setFlags(f);
    if (i) setInteractions(i);
    setLoading(false);
  };

  useEffect(() => {
    if (!myName) return;
    load();
    const interval = setInterval(load, 30000);
    const ch = supabase.channel("team-ch")
      .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"flags"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"interactions"},load)
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(ch); };
  }, [myName]);

  const otherName = myName === "Jason" ? "Andrea" : "Jason";

  const filterTasks = (taskList) => {
    if (!search.trim()) return taskList;
    const q = search.toLowerCase();
    return taskList.filter(t =>
      (t.subject||"").toLowerCase().includes(q) ||
      (t.client||"").toLowerCase().includes(q) ||
      (t.company||"").toLowerCase().includes(q) ||
      (t.next_action||"").toLowerCase().includes(q)
    );
  };

  const myTasks = filterTasks(tasks.filter(t => t.owner === myName && t.status !== "Done"));
  const theirTasks = filterTasks(tasks.filter(t => t.owner === otherName && t.status !== "Done"));
  const myDoneToday = tasks.filter(t => t.owner === myName && t.status === "Done" && t.actual_date === TODAY());
  const myOverdue = myTasks.filter(isOverdue);
  const myFlags = flags.filter(f => f.from_name === myName);
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split("T")[0]; })();
  const thisWeekInteractions = interactions.filter(i => i.interaction_date >= weekStart);

  const groupByStatus = (taskList) => {
    return STATUSES.filter(s => s !== "Done").reduce((acc, s) => {
      acc[s] = taskList.filter(t => t.status === s);
      return acc;
    }, {});
  };

  const s = {
    page: { minHeight:"100vh", background:"#0d0d1a", color:"#e2e8f0", fontFamily:"system-ui,sans-serif", width:"100%", paddingBottom:40 },
    header: { background:"#0a0a16", padding:"16px 20px", borderBottom:"1px solid #1e1e30", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 },
    tabs: { display:"flex", overflowX:"auto", gap:6, padding:"12px 16px", borderBottom:"1px solid #1e1e30", background:"#0a0a16", position:"sticky", top:57, zIndex:99 },
    tab: (active) => ({ flexShrink:0, padding:"8px 14px", borderRadius:99, border:"1px solid " + (active?"#0891b2":"#2a2a45"), background:active?"#0891b233":"none", color:active?"#0891b2":"#6b7280", fontSize:13, fontWeight:active?700:400, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }),
    content: { padding:"16px" },
    card: (over) => ({ background:"#1a1a2e", border:"1px solid " + (over?"#7f1d1d":"#2a2a45"), borderRadius:14, padding:"14px 16px", marginBottom:10, cursor:"pointer", transition:"transform 0.15s" }),
    sectionTitle: (color) => ({ fontSize:11, fontWeight:700, color: color||"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10, marginTop:20, display:"flex", alignItems:"center", gap:8 }),
  };

  if (!myName) return (
    <div style={{ minHeight:"100vh", background:"#0d0d1a", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui,sans-serif" }}>
      <div style={{ textAlign:"center", padding:32 }}>
        <img src="https://esbd.co.za/wp-content/uploads/2024/07/4.png" alt="ESBD" style={{ width:120, marginBottom:24 }} />
        <div style={{ fontSize:20, fontWeight:700, color:"#e2e8f0", marginBottom:8 }}>
          {"Good " + (new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening") + "!"}
        </div>
        <div style={{ fontSize:14, color:"#6b7280", marginBottom:28 }}>Who are you?</div>
        <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
          {["Jason","Andrea"].map(name => (
            <button key={name} onClick={()=>setMyName(name)} style={{ padding:"16px 32px", background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:12, color:"#e2e8f0", cursor:"pointer", fontSize:18, fontWeight:700 }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#0891b2";e.currentTarget.style.color="#0891b2";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a2a45";e.currentTarget.style.color="#e2e8f0";}}>
              <div style={{ width:40, height:40, borderRadius:"50%", background:"#0891b2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:700, color:"#fff", margin:"0 auto 8px" }}>{name[0]}</div>
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ ...s.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#0891b2", fontSize:16 }}>Loading...</div>
    </div>
  );

  const TaskCard = ({ task, showOwner }) => (
    <div onClick={()=>setSelectedTask(task)} style={{ ...s.card(isOverdue(task)), borderLeft:"3px solid " + STATUS_COLOR[task.status] }}
      onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
      onMouseLeave={e=>e.currentTarget.style.transform=""}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99, background:PRIORITY_COLOR[task.priority]+"22", color:PRIORITY_COLOR[task.priority], fontWeight:600 }}>{task.priority}</span>
            {isOverdue(task) && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99, background:"#7f1d1d", color:"#fca5a5", fontWeight:600 }}>OVERDUE</span>}
            {showOwner && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99, background:"#2a2a45", color:"#9ca3af", fontWeight:600 }}>{task.owner}</span>}
          </div>
          <div style={{ fontSize:15, fontWeight:700, color:"#e2e8f0", marginBottom:4, lineHeight:1.3 }}>{task.subject}</div>
          {(task.client||task.company) && <div style={{ fontSize:12, color:"#6b7280", marginBottom:4 }}>{[task.client,task.company].filter(Boolean).join(" · ")}</div>}
          {task.next_action && <div style={{ fontSize:12, color:"#0891b2" }}>→ {task.next_action}</div>}
          {task.notes && <div style={{ fontSize:12, color:"#6b7280", fontStyle:"italic", marginTop:4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>💬 {task.notes.length>60?task.notes.substring(0,60)+"...":task.notes}</div>}
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontSize:11, color:isOverdue(task)?"#fca5a5":"#6b7280" }}>{fmtDate(task.expected_date)}</div>
          <button onClick={e=>{e.stopPropagation();setFlagTask(task);setShowFlagModal(true);}} style={{ marginTop:8, padding:"4px 10px", background:"#7f1d1d22", border:"1px solid #ef444444", borderRadius:6, color:"#ef4444", cursor:"pointer", fontSize:11, fontWeight:600 }}>
            🚨 Flag
          </button>
        </div>
      </div>
    </div>
  );

  const StatusSection = ({ status, taskList, showOwner }) => {
    if (taskList.length === 0) return null;
    return (
      <div>
        <div style={s.sectionTitle(STATUS_COLOR[status])}>
          <span>{STATUS_EMOJI[status]}</span>
          <span style={{ color:STATUS_COLOR[status] }}>{status}</span>
          <span style={{ background:STATUS_COLOR[status]+"33", color:STATUS_COLOR[status], borderRadius:99, padding:"1px 8px", fontSize:10, fontWeight:700 }}>{taskList.length}</span>
        </div>
        {taskList.map(t => <TaskCard key={t.id} task={t} showOwner={showOwner} />)}
      </div>
    );
  };

  const TABS = [
    { id:"mine", label:"My Tasks", emoji:"◉", count:myTasks.length },
    { id:"team", label:otherName + "'s Tasks", emoji:"◈", count:theirTasks.length },
    { id:"interactions", label:"Interactions", emoji:"📋", count:thisWeekInteractions.length },
    { id:"flags", label:"Flagged Sean", emoji:"🚨", count:myFlags.filter(f=>!f.seen).length },
  ];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <img src="https://esbd.co.za/wp-content/uploads/2024/07/4.png" alt="ESBD" style={{ width:70 }} />
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#e2e8f0" }}>
              {"Good " + (new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening") + ", " + myName + "!"}
            </div>
            <div style={{ fontSize:11, color:"#4b5563" }}>{myTasks.length} active · {myOverdue.length>0?"⚠️ " + myOverdue.length + " overdue":"✅ no overdue"} · {myDoneToday.length} done today</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={()=>setShowNewTask(true)} style={{ padding:"8px 14px", background:"#0891b2", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700 }}>+ Task</button>
          <button onClick={()=>setShowLogInteraction(true)} style={{ padding:"8px 14px", background:"#10b98122", border:"1px solid #10b981", borderRadius:8, color:"#10b981", cursor:"pointer", fontSize:13, fontWeight:600 }}>📋 Log</button>
          <button onClick={()=>{setFlagTask(null);setShowFlagModal(true);}} style={{ padding:"8px 14px", background:"#7f1d1d33", border:"1px solid #ef4444", borderRadius:8, color:"#ef4444", cursor:"pointer", fontSize:13, fontWeight:700 }}>🚨 Flag</button>
          <button onClick={()=>setMyName(null)} style={{ padding:"8px 12px", background:"none", border:"1px solid #2a2a45", borderRadius:8, color:"#6b7280", cursor:"pointer", fontSize:12 }}>Switch</button>
        </div>
      </div>

      <div style={{ padding:"12px 16px", background:"#0a0a16", borderBottom:"1px solid #1e1e30" }}>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#4b5563", fontSize:14 }}>🔍</span>
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Search tasks by subject, client, company or next action..."
            style={{ ...inp, paddingLeft:36, background:"#1a1a2e" }}
          />
          {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:16 }}>✕</button>}
        </div>
      </div>

      {flagSent && (
        <div style={{ background:"#10b98122", border:"1px solid #10b981", borderRadius:8, padding:"10px 16px", margin:"12px 16px", fontSize:13, color:"#10b981", fontWeight:600 }}>
          ✅ Flag sent to Sean!
          <button onClick={()=>setFlagSent(false)} style={{ float:"right", background:"none", border:"none", color:"#10b981", cursor:"pointer", fontSize:16 }}>✕</button>
        </div>
      )}

      <div style={s.tabs}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={s.tab(activeTab===tab.id)}>
            <span>{tab.emoji}</span>
            <span>{tab.label}</span>
            {tab.count>0 && <span style={{ background:"#ef4444", color:"#fff", borderRadius:99, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      <div style={s.content}>
        {activeTab==="mine" && (
          <div>
            {myTasks.length === 0
              ? <div style={{ textAlign:"center", padding:"40px 0", color:"#374151" }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>{search ? "🔍" : "🎉"}</div>
                  <div>{search ? `No tasks matching "${search}"` : "No active tasks! Click + Task to add one."}</div>
                </div>
              : Object.entries(groupByStatus(myTasks)).map(([status, taskList]) =>
                  <StatusSection key={status} status={status} taskList={taskList} showOwner={false} />
                )
            }
          </div>
        )}

        {activeTab==="team" && (
          <div>
            {theirTasks.length === 0
              ? <div style={{ textAlign:"center", padding:"40px 0", color:"#374151" }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>{search ? "🔍" : "✅"}</div>
                  <div>{search ? `No tasks matching "${search}"` : `${otherName} has no active tasks`}</div>
                </div>
              : Object.entries(groupByStatus(theirTasks)).map(([status, taskList]) =>
                  <StatusSection key={status} status={status} taskList={taskList} showOwner={false} />
                )
            }
          </div>
        )}

        {activeTab==="interactions" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase" }}>Customer Interactions</div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setShowLogInteraction(true)} style={{ padding:"7px 14px", background:"#0891b2", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700 }}>+ Log</button>
                <button onClick={()=>setShowWeeklyReport(true)} style={{ padding:"7px 14px", background:"#1e3a8a22", border:"1px solid #3b82f6", borderRadius:8, color:"#60a5fa", cursor:"pointer", fontSize:13, fontWeight:600 }}>📊 Weekly Report</button>
              </div>
            </div>
            {interactions.length===0
              ? <div style={{ textAlign:"center", padding:"40px 0", color:"#374151" }}><div style={{ fontSize:32, marginBottom:8 }}>📋</div><div>No interactions logged yet</div></div>
              : interactions.map(i=>(
                <div key={i.id} style={{ background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:12, padding:"14px 16px", marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:"#e2e8f0" }}>{i.type}</span>
                      <span style={{ fontSize:11, background:"#2a2a45", borderRadius:99, padding:"2px 8px", color:"#9ca3af" }}>{i.logged_by}</span>
                      {i.week_sent && <span style={{ fontSize:11, color:"#10b981" }}>✅ Reported</span>}
                    </div>
                    <div style={{ fontSize:11, color:"#4b5563" }}>{fmtDate(i.interaction_date)}</div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#0891b2", marginBottom:4 }}>{i.client}{i.company?" · "+i.company:""}</div>
                  <div style={{ fontSize:13, color:"#e2e8f0", lineHeight:1.5, marginBottom:i.outcome?8:0 }}>{i.notes}</div>
                  {i.outcome && <div style={{ fontSize:12, color:"#10b981" }}>→ {i.outcome}</div>}
                </div>
              ))
            }
          </div>
        )}

        {activeTab==="flags" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:"0.08em", textTransform:"uppercase" }}>Flags Sent to Sean</div>
              <button onClick={()=>{setFlagTask(null);setShowFlagModal(true);}} style={{ padding:"7px 14px", background:"#ef444422", border:"1px solid #ef4444", borderRadius:8, color:"#ef4444", cursor:"pointer", fontSize:13, fontWeight:700 }}>
                + New Flag
              </button>
            </div>
            {myFlags.length===0
              ? <div style={{ textAlign:"center", padding:"40px 0", color:"#374151" }}><div style={{ fontSize:32, marginBottom:8 }}>🚨</div><div>No flags sent yet</div></div>
              : myFlags.map(f=>(
                <div key={f.id} style={{ background:"#1a1a2e", border:"1px solid " + (f.seen?"#2a2a45":URGENCY_COLOR[f.urgency]+"44"), borderLeft:"3px solid " + URGENCY_COLOR[f.urgency], borderRadius:12, padding:"14px 16px", marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:URGENCY_COLOR[f.urgency]+"33", color:URGENCY_COLOR[f.urgency], fontWeight:700 }}>{f.urgency}</span>
                      {f.seen
                        ? <span style={{ fontSize:11, color:"#10b981" }}>✅ Seen by Sean</span>
                        : <span style={{ fontSize:11, color:"#f59e0b" }}>⏳ Pending</span>
                      }
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <div style={{ fontSize:10, color:"#4b5563" }}>{fmtDateTime(f.created_at)}</div>
                      {!f.seen && (
                        <button onClick={()=>setEditingFlag(f)} style={{ padding:"4px 10px", background:"#f9731622", border:"1px solid #f97316", borderRadius:6, color:"#f97316", cursor:"pointer", fontSize:11, fontWeight:600 }}>
                          ✏️ Edit
                        </button>
                      )}
                    </div>
                  </div>
                  {f.task_subject && f.task_subject!=="General flag" && <div style={{ fontSize:12, color:"#6b7280", marginBottom:6 }}>Re: {f.task_subject}</div>}
                  <div style={{ fontSize:13, color:"#e2e8f0", lineHeight:1.5 }}>{f.note}</div>
                  {f.seen && <div style={{ fontSize:11, color:"#374151", marginTop:8, fontStyle:"italic" }}>Sean has seen this — editing disabled</div>}
                </div>
              ))
            }
          </div>
        )}
      </div>

      {selectedTask && <TaskModal task={selectedTask} myName={myName} onClose={()=>setSelectedTask(null)} onUpdate={load} onDelete={load} />}
      {showNewTask && <NewTaskModal myName={myName} onClose={()=>setShowNewTask(false)} onSaved={load} />}
      {showFlagModal && <FlagSeanModal task={flagTask} myName={myName} onClose={()=>{setShowFlagModal(false);setFlagTask(undefined);}} onSent={()=>{setFlagSent(true);load();setTimeout(()=>setFlagSent(false),4000);}} />}
      {showLogInteraction && <LogInteractionModal myName={myName} tasks={tasks} onClose={()=>setShowLogInteraction(false)} onSaved={load} />}
      {showWeeklyReport && <WeeklyReportModal interactions={interactions} myName={myName} onClose={()=>setShowWeeklyReport(false)} />}
      {editingFlag && <EditFlagModal flag={editingFlag} onClose={()=>setEditingFlag(null)} onSaved={load} onDeleted={load} />}
    </div>
  );
}
