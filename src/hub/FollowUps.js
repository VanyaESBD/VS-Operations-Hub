import { useState, useMemo, useEffect, useCallback } from "react";
import { ACTION_STATES, PRIORITIES, stateOf, isOpenTask, actionDate, dueBucket, needsChasing, isActiveLead, leadFollowUp, stageOf, todayISO, addDays, ago } from "../lib/hub";
import { CATEGORIES, CATEGORY_NAMES, STATE_STYLE, normaliseCategory, ownerLabel, PEOPLE, rag, RAG } from "../lib/categories";
import { setTaskState, scheduleFollowUp, replyReceived, loadTaskContacts, summariseContacts } from "../lib/data";
import { C, inp, btn, Banner, Empty, Card, fmtDate, useHubUser } from "./ui";
import { CategoryTag, StateTag, UrgentTag, DelegatedTag } from "./tags";

// Order matters: the first tabs are the ones used every day.
// Row 1 — when / what. Row 2 — who. Row 3 — tags (Outlook action tags + area categories).
// Waiting (FlwUP) and FYI are tag chips (row 3), not tabs — one control per idea.
const VIEWS = [["all", "All open"], ["today", "Today"], ["upcoming", "Upcoming"], ["onhold", "On hold"], ["completed", "Done"]];
const ACTION_TAGS = [["Our action", "FYA"], ["Awaiting response", "FlwUP"], ["Monitoring", "FYI"]];
// Old links (dashboard tiles, bookmarks) → new view + person
const LEGACY = { overdue: ["today"], week: ["upcoming"], later: ["upcoming"], sean: ["all", "Sean"], vanya: ["all", "Vanya"], team: ["all"], mine: ["all", "ME"],
  awaiting: ["all", null, "Awaiting response"], monitoring: ["all", null, "Monitoring"] };
const GLOW_CSS = `@keyframes hubGlow{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.0),0 0 6px 1px rgba(239,68,68,.35)}50%{box-shadow:0 0 0 1px rgba(239,68,68,.55),0 0 16px 4px rgba(239,68,68,.45)}}.hub-glow{animation:hubGlow 2.2s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.hub-glow{animation:none;box-shadow:0 0 0 2px rgba(239,68,68,.6)}}@media (max-width:819px){.hub-chiprow{flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none}.hub-chiprow>*{flex-shrink:0}}`;
const CHASE_IN = [["2d", 2], ["3d", 3], ["1 wk", 7], ["2 wks", 14]];

export default function FollowUps({ tasks, opportunities, companies, initialView = "today", initialWho = "All", onOpenTask, onOpenOpportunity, onChanged }) {
  const { name: me } = useHubUser();
  const legacy = LEGACY[initialView];
  const [view, setView] = useState(legacy ? legacy[0] : initialView);
  const [who, setWho] = useState(legacy && legacy[1] ? (legacy[1] === "ME" ? me : legacy[1]) : initialWho);
  const [tag, setTag] = useState((legacy && legacy[2]) || "All");          // FYA / FlwUP / FYI
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
      all: open(r),
      today: b === "today" || b === "overdue",
      upcoming: open(r) && (b === "week" || b === "later" || b === "none"),
      awaiting: r.state === "Awaiting response", monitoring: r.state === "Monitoring", onhold: r.state === "On hold",
      completed: r.state === "Completed" || r.state === "Cancelled",
    }[v];
  }
  const passes = (r) =>
    (who === "All" || r.owner === who) &&
    (tag === "All" || r.state === tag) &&
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
  const shown = list;
  const [doneLimit, setDoneLimit] = useState(30);

  const run = async (key, fn) => {
    setBusy(key); setError(null);
    const { error: e } = await fn();
    setBusy(null);
    if (e) setError(e); else { onChanged(); loadContacts(); }
  };

  return (
    <div>
      <style>{GLOW_CSS}</style>
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
        <span style={{ fontSize: 11, color: C.dim, marginRight: 2 }}>Who</span>
        {["All", ...PEOPLE].map((w) => {
          const n = w === "All" ? null : rows.filter((r) => r.owner === w && open(r)).length;
          return <button key={w} onClick={() => setWho(w)} aria-pressed={who === w} style={{ ...btn("small"), padding: "3px 10px", borderRadius: 99, background: who === w ? C.accent : "none", color: who === w ? "#fff" : C.muted, borderColor: who === w ? C.accent : C.line }}>{w === "All" ? "Everyone" : w}{n ? ` · ${n}` : ""}{["Siya", "Jason", "Andrea"].includes(w) ? " ↗" : ""}</button>;
        })}
      </div>
      <div className="hub-chiprow" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: C.dim, marginRight: 2 }}>Tags</span>
        {ACTION_TAGS.map(([st, t]) => {
          const S = STATE_STYLE[st];
          return <button key={t} onClick={() => setTag(tag === st ? "All" : st)} aria-pressed={tag === st}
            style={{ ...btn("small"), padding: "3px 10px", borderRadius: 99, fontWeight: 700, background: tag === st ? S.fill : "none", color: S.ink, borderColor: tag === st ? S.ink : S.ink + "66" }}>{t}</button>;
        })}
        <span style={{ width: 1, height: 18, background: C.line, margin: "0 4px" }} />
        <button onClick={() => setCategory("All")} style={{ ...btn("small"), padding: "3px 10px", borderRadius: 99, background: category === "All" ? C.input : "none", color: C.muted }}>All areas</button>
        {CATEGORY_NAMES.map((c) => (
          <button key={c} onClick={() => setCategory(category === c ? "All" : c)} aria-pressed={category === c}
            style={{ ...btn("small"), padding: "3px 10px", borderRadius: 99, background: category === c ? CATEGORIES[c].fill : "none", color: CATEGORIES[c].ink, borderColor: category === c ? CATEGORIES[c].ink : CATEGORIES[c].ink + "66" }}>{c}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: C.dim, marginBottom: 8 }}>
        {["red", "amber", "yellow", "green"].map((l) => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: RAG[l].ink, display: "inline-block" }} />{RAG[l].label}</span>)}
        <span>· glowing = 3+ days overdue and nobody has touched it</span>
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

      {view === "completed" && shown.length > 0 && (
        // Done items are one compact line each — they're history, not work.
        <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 10, overflow: "hidden" }}>
          {shown.slice(0, doneLimit).map((r) => {
            const when = String(r.raw.completed_at || r.raw.actual_date || "").slice(0, 10);
            return (
              <div key={r.kind + r.id} onClick={() => (r.kind === "task" ? onOpenTask(r.raw) : onOpenOpportunity(r.raw))}
                style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 12px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12, cursor: "pointer", color: C.faint }}>
                <span style={{ color: r.state === "Cancelled" ? C.faint : C.green }}>{r.state === "Cancelled" ? "✕" : "✓"}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.muted }}>{r.title}{r.company ? <span style={{ color: C.faint }}> · {r.company}</span> : null}</span>
                <span style={{ flexShrink: 0 }}>{r.owner || "—"}</span>
                <span style={{ flexShrink: 0, width: 82, textAlign: "right" }}>{when ? fmtDate(when) : ""}</span>
              </div>
            );
          })}
          {shown.length > doneLimit && <button onClick={() => setDoneLimit((n) => n + 50)} style={{ ...btn("small"), width: "100%", border: "none", borderRadius: 0 }}>Show 50 more ({shown.length - doneLimit} left)</button>}
        </div>
      )}
      {shown.length === 0 ? <Empty icon="✅">{view === "today" ? "Nothing due today — nice." : "Nothing here"}</Empty> : view === "completed" ? null : shown.map((r) => {
        const light = rag(r.date, today, { done: !open(r), updatedAt: r.raw.updated_at, updatedBy: r.raw.updated_by });
        const chase = r.kind === "task" && needsChasing(r.raw, today);
        const ct = r.kind === "task" ? contacts[r.id] : null;
        const k = r.kind + r.id;
        return (
          <Card key={k} onClick={() => (r.kind === "task" ? onOpenTask(r.raw) : onOpenOpportunity(r.raw))}
            className={light.glow ? "hub-glow" : undefined}
            style={light.level === "red" ? { borderColor: RAG.red.ink + (light.glow ? "" : "88") } : undefined}
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
                {r.date && <div title={RAG[light.level].label + (light.glow ? " — not touched since it went overdue" : "")} style={{ fontSize: 12, color: RAG[light.level].ink, fontWeight: light.level === "red" || light.level === "amber" ? 700 : 400, display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: RAG[light.level].ink, display: "inline-block" }} />{r.state === "Awaiting response" ? "follow up " : ""}{fmtDate(r.date)}</div>}
                {!r.date && open(r) && <div style={{ fontSize: 11, color: C.faint }}>no date</div>}
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
