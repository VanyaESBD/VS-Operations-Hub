import { useState, useMemo, useEffect, useCallback } from "react";
import { ACTION_STATES, PRIORITIES, stateOf, isOpenTask, actionDate, dueBucket, needsChasing, isActiveLead, leadFollowUp, stageOf, todayISO, addDays, ago } from "../lib/hub";
import { CATEGORIES, CATEGORY_NAMES, STATE_STYLE, normaliseCategory, isDelegated, ownerLabel } from "../lib/categories";
import { setTaskState, scheduleFollowUp, replyReceived, loadTaskContacts, summariseContacts } from "../lib/data";
import { C, inp, btn, Banner, Empty, Card, fmtDate, useHubUser } from "./ui";
import { CategoryTag, StateTag, UrgentTag, DelegatedTag } from "./tags";

// Order matters: the first tabs are the ones used every day.
const VIEWS = [
  ["today", "Today"], ["week", "This week"], ["awaiting", "Waiting for reply"], ["upcoming", "Later"],
  ["monitoring", "For information"], ["onhold", "On hold"],
  ["sean", "Sean's"], ["vanya", "Vanya's"], ["team", "Delegated"],
  ["overdue", "Overdue"], ["mine", "My items"], ["completed", "Completed"],
];
const BUCKET_COLOR = { overdue: C.red, today: C.amber, week: C.accent, later: C.dim, none: C.faint };
const CHASE_IN = [["2d", 2], ["3d", 3], ["1 wk", 7], ["2 wks", 14]];

export default function FollowUps({ tasks, opportunities, companies, initialView = "today", onOpenTask, onOpenOpportunity, onChanged }) {
  const { name: me } = useHubUser();
  const [view, setView] = useState(initialView);
  const [who, setWho] = useState("All");          // quick switch: everyone / Vanya / Sean
  const [owner, setOwner] = useState("All");
  const [company, setCompany] = useState("");
  const [opp, setOpp] = useState("");
  const [state, setState] = useState("All");
  const [priority, setPriority] = useState("All");
  const [category, setCategory] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeOpps, setIncludeOpps] = useState(true);
  const [error, setError] = useState(null);
  const [contacts, setContacts] = useState({});
  const [busy, setBusy] = useState(null);
  const today = todayISO();

  const loadContacts = useCallback(() => {
    loadTaskContacts().then(({ data }) => setContacts(summariseContacts(data || [])));
  }, []);
  useEffect(() => { loadContacts(); }, [loadContacts, tasks]);

  // Unified list of "things with a next step": tasks + opportunity next actions.
  const rows = useMemo(() => {
    const t = tasks.filter((x) => !x.archived_at).map((x) => ({
      kind: "task", id: x.id, raw: x, title: x.subject, owner: x.owner, state: stateOf(x), date: actionDate(x),
      priority: x.priority, company_id: x.company_id, company: x.company || x.client, opportunity_id: x.opportunity_id,
      waiting_on: x.waiting_on, next: x.next_action, visibility: x.visibility, category: normaliseCategory(x.category),
    }));
    const o = includeOpps ? opportunities.filter(isActiveLead).filter((x) => x.next_action || leadFollowUp(x)).map((x) => ({
      kind: "opp", id: x.id, raw: x, title: x.name || x.company, owner: x.next_action_owner || x.owner,
      state: stageOf(x) === "On Hold / Nurture" ? "On hold" : (x.action_state || "Our action"), date: leadFollowUp(x),
      priority: x.priority || "Medium", company_id: x.company_id, company: x.company, opportunity_id: x.id, next: x.next_action, stage: stageOf(x), category: null,
    })) : [];
    return [...t, ...o];
  }, [tasks, opportunities, includeOpps]);

  const open = (r) => ["Our action", "Awaiting response", "Monitoring", "On hold"].includes(r.state);
  function inViewFor(v, r) {
    const b = open(r) ? dueBucket(r.date, today) : "closed";
    return {
      today: b === "today" || b === "overdue",
      week: ["overdue", "today", "week"].includes(b), upcoming: b === "later", overdue: b === "overdue",
      awaiting: r.state === "Awaiting response", monitoring: r.state === "Monitoring", onhold: r.state === "On hold",
      mine: open(r) && r.owner === me, sean: open(r) && r.owner === "Sean", vanya: open(r) && r.owner === "Vanya",
      team: open(r) && isDelegated(r.owner),
      completed: r.state === "Completed" || r.state === "Cancelled",
    }[v];
  }
  const passes = (r) =>
    (who === "All" || r.owner === who) &&
    (owner === "All" || r.owner === owner) &&
    (!company || String(r.company_id) === company) &&
    (!opp || String(r.opportunity_id) === opp) &&
    (state === "All" || r.state === state) &&
    (priority === "All" || r.priority === priority) &&
    (category === "All" || r.category === category) &&
    (!from || (r.date && r.date >= from)) && (!to || (r.date && r.date <= to));
  const list = rows.filter((r) => inViewFor(view, r) && passes(r)).sort((a, b) => {
    if (view === "completed") return String(b.raw.completed_at || b.raw.actual_date || "").localeCompare(String(a.raw.completed_at || a.raw.actual_date || ""));
    // Date first — earliest (most overdue) at the top; undated last; urgency breaks ties.
    const da = a.date || "9999-12-31", db = b.date || "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    const P = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
    return (P[a.priority] ?? 2) - (P[b.priority] ?? 2);
  });
  const shown = view === "completed" ? list.slice(0, 100) : list;

  const run = async (key, fn) => {
    setBusy(key); setError(null);
    const { error: e } = await fn();
    setBusy(null);
    if (e) setError(e); else { onChanged(); loadContacts(); }
  };

  return (
    <div>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {VIEWS.map(([k, l]) => {
          const n = k === "completed" ? null : rows.filter((r) => inViewFor(k, r) && passes(r)).length;
          const active = view === k;
          return (
            <button key={k} onClick={() => setView(k)} style={{ ...btn("small"), background: active ? C.accent + "33" : C.input, color: active ? "#e2f6fb" : k === "today" && n ? "#fcd34d" : C.muted, borderColor: active ? C.accent : C.line, fontWeight: active ? 700 : 400 }}>
              {l}{n ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: C.dim, marginRight: 2 }}>Showing</span>
        {["All", "Vanya", "Sean"].map((w) => (
          <button key={w} onClick={() => setWho(w)} aria-pressed={who === w} style={{ ...btn("small"), padding: "3px 10px", borderRadius: 99, background: who === w ? C.accent : "none", color: who === w ? "#fff" : C.muted, borderColor: who === w ? C.accent : C.line }}>{w === "All" ? "Everyone" : w}</button>
        ))}
        <span style={{ width: 1, height: 18, background: C.line, margin: "0 4px" }} />
        <button onClick={() => setCategory("All")} style={{ ...btn("small"), padding: "3px 10px", borderRadius: 99, background: category === "All" ? C.input : "none", color: C.muted }}>All areas</button>
        {CATEGORY_NAMES.filter((c) => rows.some((r) => r.category === c)).map((c) => (
          <button key={c} onClick={() => setCategory(category === c ? "All" : c)} aria-pressed={category === c}
            style={{ ...btn("small"), padding: "3px 10px", borderRadius: 99, background: category === c ? CATEGORIES[c].fill : "none", color: CATEGORIES[c].ink, borderColor: category === c ? CATEGORIES[c].ink : CATEGORIES[c].ink + "66" }}>{c}</button>
        ))}
      </div>
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: C.dim }}>More filters{[owner !== "All", company, opp, state !== "All", priority !== "All", from, to].filter(Boolean).length ? " (active)" : ""}</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 10 }}>
          <select style={inp} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner"><option value="All">Any owner</option>{[...new Set(rows.map((r) => r.owner).filter(Boolean))].sort().map((o) => <option key={o} value={o}>{ownerLabel(o)}</option>)}</select>
          <select style={inp} value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company"><option value="">Any company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select style={inp} value={opp} onChange={(e) => setOpp(e.target.value)} aria-label="Opportunity"><option value="">Any opportunity</option>{opportunities.filter(isActiveLead).map((o) => <option key={o.id} value={o.id}>{o.name || o.company}</option>)}</select>
          <select style={inp} value={state} onChange={(e) => setState(e.target.value)} aria-label="State"><option value="All">Any state</option>{ACTION_STATES.map((s) => <option key={s} value={s}>{STATE_STYLE[s]?.label || s}</option>)}</select>
          <select style={inp} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority"><option value="All">Any priority</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
          <input type="date" style={inp} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" style={inp} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <label style={{ fontSize: 12, color: C.muted, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={includeOpps} onChange={(e) => setIncludeOpps(e.target.checked)} /> Include opportunity follow-ups</label>
        </div>
      </details>

      {shown.length === 0 ? <Empty icon="✅">{view === "today" ? "Nothing due today — nice." : "Nothing here"}</Empty> : shown.map((r) => {
        const b = open(r) ? dueBucket(r.date, today) : "closed";
        const chase = r.kind === "task" && needsChasing(r.raw, today);
        const ct = r.kind === "task" ? contacts[r.id] : null;
        const k = r.kind + r.id;
        return (
          <Card key={k} onClick={() => (r.kind === "task" ? onOpenTask(r.raw) : onOpenOpportunity(r.raw))}
            accent={r.category ? CATEGORIES[r.category].ink : (STATE_STYLE[r.state]?.ink || C.line)}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
                  <StateTag state={r.state} small />
                  {r.category && <CategoryTag category={r.category} small />}
                  {r.kind === "opp" && <span style={{ fontSize: 11, color: C.violet, fontWeight: 700 }}>🎯 {r.stage}</span>}
                  <UrgentTag priority={r.priority} small />
                  {chase && <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: C.red, borderRadius: 99, padding: "1px 8px" }}>chase now</span>}
                  <DelegatedTag owner={r.owner} small />
                  {r.visibility === "private" && <span style={{ fontSize: 10, color: C.dim }}>🔒 private</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.title}</div>
                <div style={{ fontSize: 12, color: C.dim }}>{[r.company, r.waiting_on ? `waiting on ${r.waiting_on}` : null].filter(Boolean).join(" · ")}</div>
                {ct?.last && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{ct.lastDir === "Inbound" ? "Last heard from them" : "Last contacted"} {ago(ct.last)}{ct.chases ? ` · chased ${ct.chases}×` : ""}</div>}
                {r.next && <div style={{ fontSize: 12, color: C.accent, marginTop: 3 }}>→ {r.next}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: 12, color: C.muted }}>{r.owner || "—"}</div>
                {r.date && <div style={{ fontSize: 12, color: BUCKET_COLOR[b] || C.dim, fontWeight: b === "overdue" ? 700 : 400 }}>{r.state === "Awaiting response" ? "follow up " : ""}{fmtDate(r.date)}</div>}
                {r.kind === "task" && isOpenTask(r.raw) && (
                  <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end", flexWrap: "wrap", maxWidth: 300 }}>
                    {r.state === "Awaiting response" ? <>
                      <button disabled={busy === k} title="They replied — it's our move again" style={btn("small")} onClick={() => run(k, () => replyReceived(r.raw, me))}>↩ Replied</button>
                      <ChaseButton label="No reply — chased" busy={busy === k} onPick={(d) => run(k, () => scheduleFollowUp(r.raw, d, me, { chase: true }))} />
                    </> : r.state === "Our action" ? (
                      <ChaseButton label="📧 Sent — follow up" busy={busy === k} onPick={(d) => run(k, () => scheduleFollowUp(r.raw, d, me))} />
                    ) : null}
                    <button disabled={busy === k} title="Mark completed — only when the actual outcome is done" style={btn("small")} onClick={() => run(k, () => setTaskState(r.raw, "Completed", me))}>✓ Done</button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
      {view === "completed" && list.length > 100 && <div style={{ fontSize: 12, color: C.dim, textAlign: "center" }}>Showing the latest 100 of {list.length}</div>}
    </div>
  );
}

// "Follow up in 2d / 3d / 1 wk / 2 wks / pick a date" — one tap to schedule the next chase.
function ChaseButton({ label, onPick, busy }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const today = todayISO();
  if (!open) return <button disabled={busy} style={{ ...btn("small"), color: "#e2f6fb", borderColor: C.accent }} onClick={() => setOpen(true)}>{busy ? "Saving…" : label}</button>;
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", background: C.input, border: `1px solid ${C.accent}`, borderRadius: 8, padding: 4 }}>
      <span style={{ fontSize: 11, color: C.muted }}>Follow up in</span>
      {CHASE_IN.map(([l, n]) => <button key={l} style={{ ...btn("small"), padding: "3px 8px" }} onClick={() => { setOpen(false); onPick(addDays(today, n)); }}>{l}</button>)}
      <input type="date" aria-label="Follow-up date" min={today} value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inp, width: 140, padding: "3px 6px", fontSize: 12 }} />
      <button disabled={!date} style={{ ...btn("small"), padding: "3px 8px" }} onClick={() => { setOpen(false); onPick(date); }}>Set</button>
      <button aria-label="Cancel" style={{ ...btn("small"), padding: "3px 8px" }} onClick={() => setOpen(false)}>✕</button>
    </div>
  );
}
