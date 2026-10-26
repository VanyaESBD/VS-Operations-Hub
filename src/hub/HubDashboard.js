import { useEffect, useState } from "react";
import {
  ACTIVE_STAGES, STAGE_COLOR, stageOf, isActiveLead, leadFollowUp, dueBucket,
  isOpenTask, stateOf, actionDate, needsChasing, todayISO, addDays,
} from "../lib/hub";
import { loadRecentActivity, loadDataQuality } from "../lib/data";
import TodaysFive from "./TodaysFive";
import { C, SectionTitle, Card, Pill, Empty, fmtDate, fmtDateTime } from "./ui";

function Tile({ label, value, color, onClick, hint }) {
  return (
    <div onClick={onClick} title={hint} style={{ background: C.card, border: `1px solid ${C.line}`, borderTop: `3px solid ${color}`, borderRadius: 12, padding: "14px 16px", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.dim, marginTop: 2, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function Row({ title, sub, right, color, onClick }) {
  return (
    <Card onClick={onClick} accent={color} style={{ padding: "9px 12px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
        </div>
        {right && <div style={{ fontSize: 11, color: C.muted, flexShrink: 0, textAlign: "right" }}>{right}</div>}
      </div>
    </Card>
  );
}

export default function HubDashboard({ tasks, opportunities, orders, go, openTask, openOrder, onChanged = () => {} }) {
  const [activity, setActivity] = useState([]);
  const [quality, setQuality] = useState([]);
  const [showActivity, setShowActivity] = useState(false);
  const today = todayISO();
  useEffect(() => {
    loadRecentActivity(25).then(({ data }) => setActivity(data || []));
    loadDataQuality().then(({ data }) => setQuality(data || []));
  }, [tasks.length, opportunities.length]);

  // Everything sorted by when it is due — earliest (most overdue) first, undated last.
  const byDue = (a, z) => (actionDate(a) || "9999-12-31").localeCompare(actionDate(z) || "9999-12-31");
  const openTasks = tasks.filter(isOpenTask).sort(byDue);
  const b = (t) => dueBucket(actionDate(t), today);
  const overdue = openTasks.filter((t) => b(t) === "overdue");
  const dueToday = openTasks.filter((t) => b(t) === "today");
  const highPri = openTasks.filter((t) => ["Urgent", "High"].includes(t.priority) && stateOf(t) === "Our action" && ["overdue", "today", "week"].includes(b(t)));
  const chase = openTasks.filter((t) => needsChasing(t, today));

  const active = opportunities.filter(isActiveLead).sort((a, z) => (leadFollowUp(a) || "9999-12-31").localeCompare(leadFollowUp(z) || "9999-12-31"));
  const byStage = ACTIVE_STAGES.map((s) => [s, active.filter((o) => stageOf(o) === s)]);

  const openOrders = orders.filter((o) => !o.actual_date);
  const byTarget = (a, z) => String(a.target_date || "9999").localeCompare(String(z.target_date || "9999"));
  const lateOrders = openOrders.filter((o) => o.target_date && o.target_date < today).sort(byTarget);
  const upcomingOrders = openOrders.filter((o) => o.target_date && o.target_date >= today && o.target_date <= addDays(today, 21)).sort(byTarget);

  const tRow = (t) => <Row key={"t" + t.id} title={t.subject} sub={[t.owner, stateOf(t), t.company].filter(Boolean).join(" · ")} right={actionDate(t) ? fmtDate(actionDate(t)) : ""} color={b(t) === "overdue" ? C.red : b(t) === "today" ? C.amber : C.accent} onClick={() => openTask(t)} />;

  // Kept short on purpose (Vanya, 26 Oct 2026): today's numbers, what's due, pipeline at a glance, orders. Activity on request.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ maxWidth: 560 }}><TodaysFive tasks={tasks} onChanged={onChanged} /></div>
      <section>
        <SectionTitle color={C.red}>Today — {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
          <Tile label="Overdue" value={overdue.length} color={C.red} onClick={() => go("followups", "overdue")} />
          <Tile label="Due today" value={dueToday.length} color={C.amber} onClick={() => go("followups", "today")} />
          <Tile label="Sean to decide" value={openTasks.filter((t) => (t.needs_review || "").startsWith("Sean to decide:")).length} color="#f97316" onClick={() => go("followups", "decide")} hint="Open questions only Sean can answer" />
          <Tile label="Chase now" value={chase.length} color={C.green} onClick={() => go("followups", "awaiting")} hint="Waiting on someone and the follow-up date has arrived" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <div><SectionTitle>Overdue & due today</SectionTitle>{[...overdue, ...dueToday].slice(0, 6).map(tRow)}{overdue.length + dueToday.length === 0 && <Empty icon="✅">Nothing due</Empty>}
            {overdue.length + dueToday.length > 6 && <button onClick={() => go("followups", "today")} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12, padding: 0 }}>See all {overdue.length + dueToday.length} →</button>}</div>
          <div><SectionTitle>High priority this week</SectionTitle>{highPri.slice(0, 6).map(tRow)}{highPri.length === 0 && <Empty icon="✅">None</Empty>}</div>
        </div>
      </section>

      <section>
        <SectionTitle color={C.green} right={<button onClick={() => go("pipeline")} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12 }}>Open pipeline →</button>}>Sales pipeline — {active.length} active</SectionTitle>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {byStage.filter(([, list]) => list.length).map(([s, list]) => (
            <button key={s} onClick={() => go("pipeline")} style={{ cursor: "pointer", background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, color: C.muted }}>
              <b style={{ color: STAGE_COLOR[s], marginRight: 5 }}>{list.length}</b>{s}
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle color={C.amber} right={<button onClick={() => go("orders")} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12 }}>All orders →</button>}>Orders — {openOrders.length} open</SectionTitle>
        {[...lateOrders.map((o) => [o, C.red, "target passed " + fmtDate(o.target_date)]), ...upcomingOrders.map((o) => [o, C.amber, "target " + fmtDate(o.target_date)])].map(([o, col, r]) =>
          <Row key={o.id} title={o.name} sub={o.status} right={r} color={col} onClick={() => openOrder(o)} />)}
        {lateOrders.length + upcomingOrders.length === 0 && <Empty>No order targets in the next 3 weeks</Empty>}
      </section>

      <section>
        <button onClick={() => setShowActivity((v) => !v)} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12, padding: 0 }}>{showActivity ? "Hide recent activity ▴" : "Show recent activity ▸"}</button>
        {quality.length > 0 && <span onClick={() => go("quality")} style={{ cursor: "pointer", fontSize: 12, color: "#fde68a", marginLeft: 14 }}>⚠ {quality.length} records need tidying →</span>}
        {showActivity && <div style={{ marginTop: 8 }}>{activity.length === 0 ? <Empty icon="🕘">No recorded changes yet</Empty> : activity.map((a) => (
          <div key={a.id} style={{ display: "flex", gap: 10, fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
            <span style={{ color: C.faint, width: 105, flexShrink: 0 }}>{fmtDateTime(a.created_at)}</span>
            <span style={{ color: C.muted, width: 60, flexShrink: 0 }}>{a.actor || "system"}</span>
            <Pill>{a.entity_type}</Pill>
            <span style={{ color: C.text }}>{a.action === "changed" ? `${(a.field || "").replace(/_/g, " ")} → ${a.new_value ?? "—"}` : a.action === "note" ? a.note : a.action} <span style={{ color: C.faint }}>#{a.entity_id}</span></span>
          </div>
        ))}</div>}
      </section>
    </div>
  );
}
