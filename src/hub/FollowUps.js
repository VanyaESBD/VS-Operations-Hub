import { useState, useMemo } from "react";
import { ACTION_STATES, STATE_COLOR, PRIORITIES, OWNERS, stateOf, isOpenTask, actionDate, dueBucket, needsChasing, isActiveLead, leadFollowUp, stageOf, todayISO, addDays } from "../lib/hub";
import { setTaskState } from "../lib/data";
import { C, inp, btn, Pill, Banner, Empty, Card, fmtDate, useHubUser } from "./ui";

const VIEWS = [
  ["mine", "My items"], ["sean", "Sean's"], ["vanya", "Vanya's"], ["team", "Team"],
  ["today", "Due today"], ["overdue", "Overdue"], ["week", "This week"], ["upcoming", "Upcoming"],
  ["awaiting", "Awaiting response"], ["monitoring", "Monitoring"], ["onhold", "On hold"], ["completed", "Completed"],
];
const BUCKET_COLOR = { overdue: C.red, today: C.amber, week: C.accent, later: C.dim, none: C.faint };

export default function FollowUps({ tasks, opportunities, companies, initialView = "mine", onOpenTask, onOpenOpportunity, onChanged }) {
  const { name: me } = useHubUser();
  const [view, setView] = useState(initialView);
  const [owner, setOwner] = useState("All");
  const [company, setCompany] = useState("");
  const [opp, setOpp] = useState("");
  const [state, setState] = useState("All");
  const [priority, setPriority] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeOpps, setIncludeOpps] = useState(true);
  const [error, setError] = useState(null);
  const today = todayISO();

  // Unified list of "things with a next step": tasks + opportunity next actions.
  const rows = useMemo(() => {
    const t = tasks.filter((x) => !x.archived_at).map((x) => ({
      kind: "task", id: x.id, raw: x, title: x.subject, owner: x.owner, state: stateOf(x), date: actionDate(x),
      priority: x.priority, company_id: x.company_id, company: x.company || x.client, opportunity_id: x.opportunity_id,
      waiting_on: x.waiting_on, next: x.next_action, visibility: x.visibility,
    }));
    const o = includeOpps ? opportunities.filter(isActiveLead).filter((x) => x.next_action || leadFollowUp(x)).map((x) => ({
      kind: "opp", id: x.id, raw: x, title: x.name || x.company, owner: x.next_action_owner || x.owner,
      state: stageOf(x) === "On Hold / Nurture" ? "On hold" : (x.action_state || "Our action"), date: leadFollowUp(x),
      priority: x.priority || "Medium", company_id: x.company_id, company: x.company, opportunity_id: x.id, next: x.next_action, stage: stageOf(x),
    })) : [];
    return [...t, ...o];
  }, [tasks, opportunities, includeOpps]);

  const open = (r) => ["Our action", "Awaiting response", "Monitoring", "On hold"].includes(r.state);
  function inViewFor(v, r) {
    const b = open(r) ? dueBucket(r.date, today) : "closed";
    return {
      mine: open(r) && r.owner === me, sean: open(r) && r.owner === "Sean", vanya: open(r) && r.owner === "Vanya",
      team: open(r) && !["Sean", "Vanya"].includes(r.owner),
      today: b === "today", overdue: b === "overdue", week: ["today", "week"].includes(b), upcoming: b === "later",
      awaiting: r.state === "Awaiting response", monitoring: r.state === "Monitoring", onhold: r.state === "On hold",
      completed: r.state === "Completed" || r.state === "Cancelled",
    }[v];
  }
  const inView = (r) => inViewFor(view, r);
  const list = rows
    .filter(inView)
    .filter((r) => owner === "All" || r.owner === owner)
    .filter((r) => !company || String(r.company_id) === company)
    .filter((r) => !opp || String(r.opportunity_id) === opp)
    .filter((r) => state === "All" || r.state === state)
    .filter((r) => priority === "All" || r.priority === priority)
    .filter((r) => (!from || (r.date && r.date >= from)) && (!to || (r.date && r.date <= to)))
    .sort((a, b) => {
      if (view === "completed") return String(b.raw.completed_at || b.raw.actual_date || "").localeCompare(String(a.raw.completed_at || a.raw.actual_date || ""));
      const pa = { Urgent: 0, High: 1, Medium: 2, Low: 3 }[a.priority] ?? 2, pb = { Urgent: 0, High: 1, Medium: 2, Low: 3 }[b.priority] ?? 2;
      return (a.date || "9999") < (b.date || "9999") ? -1 : (a.date || "9999") > (b.date || "9999") ? 1 : pa - pb;
    });
  const shown = view === "completed" ? list.slice(0, 100) : list;

  const act = async (r, newState) => {
    const { error: e } = await setTaskState(r.raw, newState, me);
    if (e) setError(e); else onChanged();
  };

  return (
    <div>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {VIEWS.map(([k, l]) => {
          const n = k === "completed" ? null : rows.filter((r) => inViewFor(k, r)).length;
          return (
            <button key={k} onClick={() => setView(k)} style={{ ...btn("small"), background: view === k ? C.accent + "33" : C.input, color: view === k ? C.accent : k === "overdue" && n ? "#fca5a5" : C.muted, borderColor: view === k ? C.accent : C.line }}>
              {l}{n ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: C.dim }}>Filters{[owner !== "All", company, opp, state !== "All", priority !== "All", from, to].filter(Boolean).length ? " (active)" : ""}</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 10 }}>
          <select style={inp} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner"><option value="All">Any owner</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select>
          <select style={inp} value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company"><option value="">Any company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select style={inp} value={opp} onChange={(e) => setOpp(e.target.value)} aria-label="Opportunity"><option value="">Any opportunity</option>{opportunities.filter(isActiveLead).map((o) => <option key={o.id} value={o.id}>{o.name || o.company}</option>)}</select>
          <select style={inp} value={state} onChange={(e) => setState(e.target.value)} aria-label="State"><option value="All">Any state</option>{ACTION_STATES.map((s) => <option key={s}>{s}</option>)}</select>
          <select style={inp} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority"><option value="All">Any priority</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
          <input type="date" style={inp} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" style={inp} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <label style={{ fontSize: 12, color: C.muted, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={includeOpps} onChange={(e) => setIncludeOpps(e.target.checked)} /> Include opportunity follow-ups</label>
        </div>
      </details>

      {shown.length === 0 ? <Empty icon="✅">Nothing here{view === "overdue" ? " — no overdue items" : ""}</Empty> : shown.map((r) => {
        const b = open(r) ? dueBucket(r.date, today) : "closed";
        const chase = r.kind === "task" && needsChasing(r.raw, today);
        return (
          <Card key={r.kind + r.id} onClick={() => (r.kind === "task" ? onOpenTask(r.raw) : onOpenOpportunity(r.raw))} accent={STATE_COLOR[r.state]}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                  <Pill color={STATE_COLOR[r.state]}>{r.state}</Pill>
                  {r.kind === "opp" && <Pill color={C.violet}>🎯 {r.stage}</Pill>}
                  {r.priority && r.priority !== "Medium" && <Pill color={r.priority === "Urgent" ? C.red : r.priority === "High" ? C.amber : C.dim}>{r.priority}</Pill>}
                  {chase && <Pill color={C.red} solid>chase now</Pill>}
                  {r.visibility === "private" && <Pill color={C.dim}>private</Pill>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.title}</div>
                <div style={{ fontSize: 12, color: C.dim }}>{[r.company, r.waiting_on ? `waiting on ${r.waiting_on}` : null].filter(Boolean).join(" · ")}</div>
                {r.next && <div style={{ fontSize: 12, color: C.accent, marginTop: 3 }}>→ {r.next}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 12, color: C.muted }}>{r.owner || "—"}</div>
                {r.date && <div style={{ fontSize: 12, color: BUCKET_COLOR[b] || C.dim, fontWeight: b === "overdue" ? 700 : 400 }}>{fmtDate(r.date)}</div>}
                {r.kind === "task" && isOpenTask(r.raw) && (
                  <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                    <button title="Mark completed (the actual outcome is done)" style={btn("small")} onClick={() => act(r, "Completed")}>✓</button>
                    {r.state !== "Awaiting response" && <button title="Now waiting on someone else" style={btn("small")} onClick={() => onOpenTask({ ...r.raw, action_state: "Awaiting response", follow_up_date: r.raw.follow_up_date || addDays(today, 3) })}>⏳</button>}
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
