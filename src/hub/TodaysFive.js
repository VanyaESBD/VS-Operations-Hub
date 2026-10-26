import { useEffect, useMemo, useState } from "react";
import { isOpenTask, stateOf, actionDate, todayISO, addDays } from "../lib/hub";
import { setTaskState, loadMovedToday, moveTaskTo } from "../lib/data";
import { C, btn, useHubUser } from "./ui";

// Today's Five — a small daily set of quick jobs, Wordle-style (Vanya, 26 Oct 2026).
// Everything is derived from existing data: green = completed today, amber = moved to tomorrow today.
const N = 5;
const QUICK_VERB = /^(send|confirm|chase|call|email|e-mail|message|whatsapp|book|reply|forward|pay|sign|print|check|ask|remind|tell|share|upload|order)\b/i;
const localDay = (ts) => (ts ? todayISO(new Date(ts)) : null);
const isWeekend = (iso) => { const d = new Date(iso + "T00:00:00").getDay(); return d === 0 || d === 6; };
// What the job is = the task name; the next step goes underneath (Vanya, 26 Oct: lines must make sense on their own).
const label = (t) => t.subject;
const isQuick = (t) => QUICK_VERB.test((t.next_action || "").trim()) || QUICK_VERB.test(t.subject || "");
const nextStep = (t) => { const n = (t.next_action || "").trim(); return n && n !== t.subject ? n : null; };

export function pickFive(tasks, me, today) {
  const mine = tasks.filter((t) => t.owner === me && isOpenTask(t) && stateOf(t) === "Our action");
  const due = (t) => { const d = actionDate(t); return !d || d <= today; };
  const P = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const byUrgency = (a, b) => (P[a.priority] ?? 2) - (P[b.priority] ?? 2) || String(actionDate(a) || "9").localeCompare(String(actionDate(b) || "9")) || a.id - b.id;
  const quick = mine.filter((t) => t.task_type === "Quick task" && due(t)).sort(byUrgency);
  const verb = mine.filter((t) => t.task_type !== "Quick task" && actionDate(t) && actionDate(t) <= today && isQuick(t)).sort(byUrgency);
  const rest = mine.filter((t) => t.task_type !== "Quick task" && actionDate(t) && actionDate(t) <= today && !isQuick(t)).sort(byUrgency);
  const seen = new Set();
  return [...quick, ...verb, ...rest].filter((t) => !seen.has(t.id) && seen.add(t.id));
}

export function streakFor(tasks, me, today) {
  const perDay = {};
  for (const t of tasks) if (t.owner === me && stateOf(t) === "Completed") { const d = localDay(t.completed_at) || t.actual_date; if (d) perDay[d] = (perDay[d] || 0) + 1; }
  let streak = (perDay[today] || 0) >= N ? 1 : 0;
  for (let d = addDays(today, -1), guard = 0; guard < 400; d = addDays(d, -1), guard++) {
    if (isWeekend(d)) continue;
    if ((perDay[d] || 0) >= N) streak++; else break;
  }
  const monday = (() => { let d = today; while (new Date(d + "T00:00:00").getDay() !== 1 && d > addDays(today, -7)) d = addDays(d, -1); return d; })();
  const week = Object.entries(perDay).filter(([d]) => d >= monday && d <= today).reduce((a, [, n]) => a + n, 0);
  return { streak, week, today: perDay[today] || 0 };
}

export default function TodaysFive({ tasks, onChanged, compact, who }) {
  const { name: signedIn } = useHubUser();
  const me = who || signedIn;   // Sean's phone view always shows Sean's five
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const [moved, setMoved] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [bonus, setBonus] = useState(0);
  const [copied, setCopied] = useState(false);
  const [last, setLast] = useState(null);   // { task, kind } — for Undo

  useEffect(() => {
    const since = new Date(today + "T00:00:00").toISOString();
    loadMovedToday(me, since, tomorrow).then(({ data }) => setMoved([...new Set((data || []).map((r) => r.entity_id))]));
  }, [me, today, tomorrow, tasks]);

  const doneToday = useMemo(() => tasks.filter((t) => t.owner === me && stateOf(t) === "Completed" && (localDay(t.completed_at) || t.actual_date) === today)
    .sort((a, b) => String(a.completed_at || "").localeCompare(String(b.completed_at || ""))), [tasks, me, today]);
  const candidates = useMemo(() => pickFive(tasks, me, today), [tasks, me, today]);
  const stats = useMemo(() => streakFor(tasks, me, today), [tasks, me, today]);

  const greens = Math.min(doneToday.length, N);
  const ambers = Math.min(moved.length, N - greens);
  const slots = N - greens - ambers + bonus;
  const open = candidates.slice(0, Math.max(0, slots));
  const squares = [...Array(greens).fill("g"), ...Array(ambers).fill("y"), ...Array(Math.max(0, N - greens - ambers)).fill("")].slice(0, N);
  const finished = greens + ambers >= N && open.length === 0;
  const nothingToDo = candidates.length === 0 && greens + ambers < N;

  // Changes are recorded under whoever is signed in (not the person whose five it is).
  const actor = signedIn || me;
  const act = async (t, kind) => {
    setBusy(t.id + kind); setError(null);
    const { error: e } = kind === "done" ? await setTaskState(t, "Completed", actor) : await moveTaskTo(t, tomorrow, actor);
    setBusy(null);
    if (e) setError(e); else { setLast({ task: t, kind }); onChanged(); }
  };
  const undo = async () => {
    if (!last) return;
    const t = last.task;
    setBusy("undo"); setError(null);
    const { error: e } = last.kind === "done"
      ? await setTaskState(t, stateOf(t), actor)
      : await moveTaskTo(t, (t.action_state === "Awaiting response" ? t.follow_up_date : t.expected_date) || null, actor);
    setBusy(null);
    if (e) setError(e); else { setLast(null); onChanged(); }
  };
  const share = `Today's Five ${new Date(today + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}\n${squares.map((q) => (q === "g" ? "🟩" : q === "y" ? "🟨" : "⬜")).join("")}`;
  const copy = async () => { try { await navigator.clipboard.writeText(share); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };

  return (
    <section aria-label="Today's Five" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: compact ? 12 : 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: compact ? 15 : 17, fontWeight: 900, letterSpacing: 0.5 }}>TODAY'S FIVE</span>
        <span style={{ fontSize: 12, color: C.amber, fontWeight: 700 }} title="Weekdays in a row with 5 or more jobs done">{stats.streak > 0 ? `🔥 ${stats.streak}-day streak` : "Start a streak"}</span>
      </div>
      <div style={{ display: "flex", gap: 6, margin: "10px 0 12px" }} aria-label={`${greens} done, ${ambers} moved to tomorrow, ${N - greens - ambers} left`}>
        {squares.map((q, i) => (
          <span key={i} style={{ flex: 1, maxWidth: 56, aspectRatio: "1", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16,
            border: `2px solid ${q === "g" ? C.green : q === "y" ? C.amber : C.line}`, background: q === "g" ? C.green : q === "y" ? C.amber : "none", color: "#05241a" }}>{q === "g" ? "✓" : q === "y" ? "→" : ""}</span>
        ))}
      </div>
      {error && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
      {last && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, background: C.input, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 12, color: C.muted }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last.kind === "done" ? "✓ Done:" : "→ Moved to tomorrow:"} {label(last.task)}</span>
          <button onClick={undo} disabled={busy === "undo"} style={{ ...btn("small"), padding: "3px 10px", color: C.accent, borderColor: C.accent }}>Undo</button>
        </div>
      )}
      {finished ? (
        <div style={{ textAlign: "center", padding: "4px 0" }}>
          <div style={{ fontSize: 30 }}>🎉</div>
          <div style={{ fontSize: 17, fontWeight: 900, margin: "4px 0" }}>{greens === N ? "Five for five!" : "Today's five sorted"}</div>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>{stats.today} done today{ambers ? ` · ${ambers} moved to tomorrow` : ""} · {stats.week} this week</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {candidates.length > 0 && <button style={btn("primary")} onClick={() => setBonus((b) => b + 3)}>Do 3 more?</button>}
            <button style={btn("ghost")} onClick={copy}>{copied ? "Copied" : "Copy 🟩 result"}</button>
          </div>
        </div>
      ) : nothingToDo ? (
        <div style={{ fontSize: 13, color: C.dim }}>No quick jobs due for you today. Add one on the Quick list.</div>
      ) : (
        <div>
          {open.map((t, i) => {
            const d = actionDate(t);
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.input, border: `2px solid ${C.line}`, borderRadius: 10, padding: compact ? "8px 10px" : "10px 12px", marginBottom: 6 }}>
                <button aria-label={`Done: ${label(t)}`} disabled={!!busy} onClick={() => act(t, "done")}
                  style={{ width: 28, height: 28, borderRadius: 6, border: `2px solid ${C.line}`, background: "none", color: C.dim, fontWeight: 900, cursor: "pointer", flexShrink: 0 }}>{greens + ambers + i + 1}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.priority === "Urgent" && <span style={{ color: C.red }}>! </span>}{label(t)}</div>
                  {nextStep(t) && <div style={{ fontSize: 12, color: C.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>→ {nextStep(t)}</div>}
                  <div style={{ fontSize: 11, color: d && d < today ? "#fca5a5" : C.dim }}>{[t.company, d ? (d < today ? "overdue" : "today") : "quick"].filter(Boolean).join(" · ")}</div>
                </div>
                <button aria-label={`Tomorrow: ${label(t)}`} title="Move to tomorrow" disabled={!!busy} onClick={() => act(t, "move")}
                  style={{ ...btn("small"), padding: "4px 8px", flexShrink: 0 }}>→ tmrw</button>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>Tap the number when it's done · → tmrw moves it to tomorrow</div>
        </div>
      )}
    </section>
  );
}
