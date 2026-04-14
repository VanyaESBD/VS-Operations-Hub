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

const inp = { background:"#1e1e30", border:"1px solid #2a2a45", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };

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
    await supabase.from("tasks").update({
      status: editForm.status,
      expected_date: editForm.expected_date,
      notes: editForm.notes,
      next_action: editForm.next_action,
      actual_date: editForm.status === "Done" ? TODAY() : null,
    }).eq("id", editingTask.id);
    i
