import { useState } from "react";
import { supabase } from "../supabase";
import { isOpenTask, stateOf, todayISO, addDays } from "../lib/hub";
import { PEOPLE, rag, RAG } from "../lib/categories";
import { saveTask, setTaskState } from "../lib/data";
import { C, inp, btn, Banner, fmtDate, useHubUser } from "./ui";

// Quick list = the "under 5 minutes" things (book a flight, message so-and-so) + dated diary reminders.
// Quick items are ordinary tasks (task_type "Quick task"), so they also show in Tasks → Today.
export const QUICK_TYPE = "Quick task";
const GLOW_CSS = `@keyframes hubGlow{0%,100%{box-shadow:0 0 6px 1px rgba(239,68,68,.35)}50%{box-shadow:0 0 16px 4px rgba(239,68,68,.45)}}.hub-glow{animation:hubGlow 2.2s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.hub-glow{animation:none;box-shadow:0 0 0 2px rgba(239,68,68,.6)}}`;

export default function QuickList({ tasks, reminders, onChanged, onReminders, onOpenTask, goTasks }) {
  const { name: me } = useHubUser();
  const today = todayISO();
  const [text, setText] = useState("");
  const [owner, setOwner] = useState(me);
  const [urgent, setUrgent] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [rTitle, setRTitle] = useState("");
  const [rDate, setRDate] = useState(addDays(today, 1));

  const quick = tasks.filter((t) => t.task_type === QUICK_TYPE && !t.archived_at && (!mineOnly || t.owner === me));
  const P = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const open = quick.filter(isOpenTask).sort((a, b) =>
    (P[a.priority] ?? 2) - (P[b.priority] ?? 2) || String(a.expected_date || "9").localeCompare(String(b.expected_date || "9")) || a.id - b.id);
  const doneToday = quick.filter((t) => stateOf(t) === "Completed" && String(t.completed_at || t.actual_date || "").slice(0, 10) === today);

  const add = async (e) => {
    e?.preventDefault();
    const subject = text.trim();
    if (!subject) return;
    setBusy("add"); setError(null);
    const { error: err } = await saveTask({
      subject, owner, task_type: QUICK_TYPE, action_state: "Our action", priority: urgent ? "Urgent" : "Medium",
      expected_date: today, date_received: today, visibility: "team",
    }, me);
    setBusy(null);
    if (err) { setError(err); return; }
    setText(""); setUrgent(false); onChanged();
  };
  const tick = async (t, state) => {
    setBusy(t.id); setError(null);
    const { error: err } = await setTaskState(t, state, me);
    setBusy(null);
    if (err) setError(err); else onChanged();
  };

  const myRem = reminders.filter((r) => !r.completed && (!mineOnly || r.owner === me));
  const remNow = myRem.filter((r) => r.remind_date <= today);
  const remNext = myRem.filter((r) => r.remind_date > today).slice(0, 20);
  const addReminder = async (e) => {
    e?.preventDefault();
    if (!rTitle.trim() || !rDate) return;
    setBusy("rem"); setError(null);
    const { error: err } = await supabase.from("reminders").insert([{ title: rTitle.trim(), remind_date: rDate, owner: me, category: "General", visibility: "team" }]);
    setBusy(null);
    if (err) { setError(err.message); return; }
    setRTitle(""); onReminders();
  };
  const remDone = async (r) => {
    setBusy("r" + r.id);
    const { error: err } = await supabase.from("reminders").update({ completed: true }).eq("id", r.id);
    setBusy(null);
    if (err) setError(err.message); else onReminders();
  };

  const section = (label, color) => <div style={{ fontSize: 12, fontWeight: 700, color, margin: "18px 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>;

  return (
    <div style={{ maxWidth: 760 }}>
      <style>{GLOW_CSS}</style>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, color: C.dim }}>Things that take under 5 minutes. Type it, press Enter, tick it off.</div>
        <label style={{ fontSize: 12, color: C.muted, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only mine</label>
      </div>

      <form onSubmit={add} style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <input aria-label="Quick task" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Book flight to JHB · Message Rajinder re samples"
          style={{ ...inp, flex: "1 1 260px", fontSize: 15, padding: "11px 14px" }} />
        <select aria-label="For" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ ...inp, width: 110 }}>{PEOPLE.map((p) => <option key={p}>{p}</option>)}</select>
        <button type="button" aria-pressed={urgent} onClick={() => setUrgent((u) => !u)} title="Urgent — goes to the top"
          style={{ ...btn("small"), padding: "0 12px", fontWeight: 800, background: urgent ? C.redBg : C.input, color: urgent ? "#fca5a5" : C.muted, borderColor: urgent ? C.red : C.line }}>! Urgent</button>
        <button type="submit" disabled={busy === "add" || !text.trim()} style={btn("primary")}>{busy === "add" ? "Adding…" : "Add"}</button>
      </form>

      {section(`To do now · ${open.length}`, "#fcd34d")}
      {open.length === 0 && <div style={{ fontSize: 13, color: C.faint, padding: "8px 0" }}>Nothing quick waiting — nice.</div>}
      {open.map((t) => {
        const light = rag(t.expected_date || t.follow_up_date, today, { updatedAt: t.updated_at, updatedBy: t.updated_by });
        const isUrgent = t.priority === "Urgent";
        return (
          <div key={t.id} className={light.glow ? "hub-glow" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 10, background: C.card, border: `1px solid ${isUrgent || light.level === "red" ? C.red + "99" : C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
            <input type="checkbox" aria-label={`Done: ${t.subject}`} disabled={busy === t.id} checked={false} onChange={() => tick(t, "Completed")} style={{ width: 20, height: 20, accentColor: C.green, cursor: "pointer", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onOpenTask(t)}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{isUrgent && <span style={{ color: C.red, fontWeight: 900 }}>! </span>}{t.subject}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{t.owner}{t.next_action ? ` · → ${t.next_action}` : ""}</div>
            </div>
            {(t.expected_date || t.follow_up_date) && <span title={RAG[light.level].label} style={{ fontSize: 11, color: RAG[light.level].ink, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: RAG[light.level].ink, display: "inline-block" }} />{(t.expected_date || t.follow_up_date) === today ? "today" : fmtDate(t.expected_date || t.follow_up_date)}</span>}
          </div>
        );
      })}
      {doneToday.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: C.dim }}>✓ Done today · {doneToday.length}</summary>
          {doneToday.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", fontSize: 13, color: C.faint }}>
              <span style={{ textDecoration: "line-through", flex: 1 }}>{t.subject}</span>
              <button disabled={busy === t.id} style={{ ...btn("small"), padding: "2px 8px" }} onClick={() => tick(t, "Our action")}>Undo</button>
            </div>
          ))}
        </details>
      )}

      {section(`Diary reminders${remNow.length ? ` · ${remNow.length} due` : ""}`, C.accent)}
      <form onSubmit={addReminder} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <input aria-label="Reminder" value={rTitle} onChange={(e) => setRTitle(e.target.value)} placeholder="Remind me to… (on a date)" style={{ ...inp, flex: "1 1 220px" }} />
        <input aria-label="Reminder date" type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} style={{ ...inp, width: 160 }} />
        <button type="submit" disabled={busy === "rem" || !rTitle.trim()} style={btn("small")}>+ Reminder</button>
      </form>
      {[...remNow, ...remNext].length === 0 && <div style={{ fontSize: 13, color: C.faint }}>No reminders set.</div>}
      {[...remNow, ...remNext].map((r) => {
        const light = rag(r.remind_date, today, {});
        return (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, background: r.remind_date <= today ? C.card : "none", border: `1px solid ${r.remind_date < today ? C.red + "88" : C.lineSoft}`, borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: RAG[light.level].ink, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: r.remind_date <= today ? C.text : C.muted }}>{r.title}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{r.remind_date < today ? "overdue · " : r.remind_date === today ? "today · " : ""}{fmtDate(r.remind_date)} · {r.owner}{r.description ? ` · ${r.description}` : ""}</div>
            </div>
            <button disabled={busy === "r" + r.id} onClick={() => remDone(r)} style={{ ...btn("small"), color: C.green, borderColor: C.green + "66" }}>✓ Done</button>
          </div>
        );
      })}

      <div style={{ marginTop: 22, fontSize: 12, color: C.dim }}>Bigger tasks and follow-ups live in <button onClick={goTasks} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12, padding: 0 }}>Tasks → Today</button>.</div>
    </div>
  );
}
