import { useEffect, useState } from "react";
import {
  ACTIVE_STAGES, STAGE_COLOR, stageOf, isActiveLead, leadFollowUp, dueBucket, isQuiet, pipelineTotals,
  isOpenTask, stateOf, actionDate, needsChasing, todayISO, addDays,
} from "../lib/hub";
import { loadRecentActivity, loadDataQuality } from "../lib/data";
import { C, SectionTitle, Card, Pill, Empty, fmtDate, fmtDateTime, useHubUser } from "./ui";

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

export default function HubDashboard({ tasks, opportunities, companies, orders, go, openTask, openOpp, openOrder }) {
  const { name: me } = useHubUser();
  const [activity, setActivity] = useState([]);
  const [quality, setQuality] = useState([]);
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
  const forSean = openTasks.filter((t) => t.owner === "Sean" && stateOf(t) === "Our action");
  const highPri = openTasks.filter((t) => ["Urgent", "High"].includes(t.priority) && stateOf(t) === "Our action" && ["overdue", "today", "week"].includes(b(t)));
  const chase = openTasks.filter((t) => needsChasing(t, today));
  const awaiting = openTasks.filter((t) => stateOf(t) === "Awaiting response");
  const noNext = openTasks.filter((t) => stateOf(t) === "Our action" && !(t.next_action || "").trim());

  const active = opportunities.filter(isActiveLead).sort((a, z) => (leadFollowUp(a) || "9999-12-31").localeCompare(leadFollowUp(z) || "9999-12-31"));
  const byStage = ACTIVE_STAGES.map((s) => [s, active.filter((o) => stageOf(o) === s)]);
  const newLeads = active.filter((o) => stageOf(o) === "New Lead");
  const closingSoon = active.filter((o) => o.expected_close_date && o.expected_close_date <= addDays(today, 30) && stageOf(o) !== "On Hold / Nurture");
  const holdDue = active.filter((o) => stageOf(o) === "On Hold / Nurture" && leadFollowUp(o) && leadFollowUp(o) <= addDays(today, 7));
  const quiet = active.filter((o) => isQuiet(o, 21, today));
  const oppFollowDue = active.filter((o) => stageOf(o) !== "On Hold / Nurture" && ["overdue", "today"].includes(dueBucket(leadFollowUp(o), today)));
  const totals = pipelineTotals(opportunities);

  const openOrders = orders.filter((o) => !o.actual_date);
  const byTarget = (a, z) => String(a.target_date || "9999").localeCompare(String(z.target_date || "9999"));
  const lateOrders = openOrders.filter((o) => o.target_date && o.target_date < today).sort(byTarget);
  const upcomingOrders = openOrders.filter((o) => o.target_date && o.target_date >= today && o.target_date <= addDays(today, 21)).sort(byTarget);
  const unconfirmed = orders.filter((o) => !o.customer_confirmed);
  const coName = (id) => companies.find((c) => c.id === id)?.name;

  const tRow = (t) => <Row key={"t" + t.id} title={t.subject} sub={[t.owner, stateOf(t), t.company].filter(Boolean).join(" · ")} right={actionDate(t) ? fmtDate(actionDate(t)) : ""} color={b(t) === "overdue" ? C.red : b(t) === "today" ? C.amber : C.accent} onClick={() => openTask(t)} />;
  const oRow = (o) => <Row key={"o" + o.id} title={o.name || o.company} sub={[stageOf(o), coName(o.company_id) || o.company, o.next_action].filter(Boolean).join(" · ")} right={leadFollowUp(o) ? fmtDate(leadFollowUp(o)) : ""} color={STAGE_COLOR[stageOf(o)]} onClick={() => openOpp(o)} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <section>
        <SectionTitle color={C.red}>A · Today — {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
          <Tile label="Overdue" value={overdue.length} color={C.red} onClick={() => go("followups", "overdue")} />
          <Tile label="Due today" value={dueToday.length} color={C.amber} onClick={() => go("followups", "today")} />
          <Tile label="Sean to action" value={forSean.length} color="#f97316" onClick={() => go("followups", "sean")} hint="Only items needing Sean's action, decision or approval" />
          <Tile label="My items" value={openTasks.filter((t) => t.owner === me).length} color={C.accent} onClick={() => go("followups", "mine")} />
          <Tile label="Chase now" value={chase.length} color={C.green} onClick={() => go("followups", "awaiting")} hint="Waiting on someone and the follow-up date has arrived" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <div><SectionTitle>Overdue & due today</SectionTitle>{[...overdue, ...dueToday].slice(0, 8).map(tRow)}{overdue.length + dueToday.length === 0 && <Empty icon="✅">Nothing due</Empty>}</div>
          <div><SectionTitle>High priority this week</SectionTitle>{highPri.slice(0, 8).map(tRow)}{highPri.length === 0 && <Empty icon="✅">None</Empty>}</div>
        </div>
      </section>

      <section>
        <SectionTitle color={C.green} right={<button onClick={() => go("pipeline")} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12 }}>Open pipeline →</button>}>B · Sales pipeline — {active.length} active</SectionTitle>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {byStage.map(([s, list]) => (
            <div key={s} onClick={() => go("pipeline")} style={{ cursor: "pointer", background: C.card, border: `1px solid ${C.line}`, borderTop: `3px solid ${STAGE_COLOR[s]}`, borderRadius: 10, padding: "8px 12px", minWidth: 110 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: STAGE_COLOR[s] }}>{list.length}</div>
              <div style={{ fontSize: 10, color: C.dim }}>{s}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <div><SectionTitle>Proposals & negotiations</SectionTitle>{active.filter((o) => ["Proposal / Quotation", "Negotiation"].includes(stageOf(o))).slice(0, 8).map(oRow)}</div>
          <div>
            <SectionTitle>Closing within 30 days</SectionTitle>{closingSoon.slice(0, 5).map(oRow)}{closingSoon.length === 0 && <Empty>None with a close date</Empty>}
            <SectionTitle>On hold — due for review</SectionTitle>{holdDue.slice(0, 5).map(oRow)}{holdDue.length === 0 && <Empty>None due</Empty>}
            {newLeads.length > 0 && <><SectionTitle>New leads</SectionTitle>{newLeads.slice(0, 5).map(oRow)}</>}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle color={C.accent}>C · Follow-ups</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
          <Tile label="This week" value={openTasks.filter((t) => ["today", "week"].includes(b(t))).length} color={C.accent} onClick={() => go("followups", "week")} />
          <Tile label="Awaiting response" value={awaiting.length} color={C.green} onClick={() => go("followups", "awaiting")} />
          <Tile label="No next action" value={noNext.length + active.filter((o) => !(o.next_action || "").trim()).length} color={C.amber} onClick={() => go("quality")} />
          <Tile label="Gone quiet" value={quiet.length} color={C.violet} hint="Active opportunities with no interaction for 3 weeks" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <div><SectionTitle>Opportunity follow-ups due</SectionTitle>{oppFollowDue.slice(0, 8).map(oRow)}{oppFollowDue.length === 0 && <Empty>None due</Empty>}</div>
          <div><SectionTitle>Gone quiet (3+ weeks)</SectionTitle>{quiet.slice(0, 8).map(oRow)}{quiet.length === 0 && <Empty>None</Empty>}</div>
        </div>
      </section>

      <section>
        <SectionTitle color={C.amber} right={<button onClick={() => go("orders")} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12 }}>All orders →</button>}>D · Operations — {openOrders.length} open orders</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <div><SectionTitle>Target dates in the next 3 weeks</SectionTitle>{upcomingOrders.map((o) => <Row key={o.id} title={o.name} sub={o.status} right={`target ${fmtDate(o.target_date)}`} color={C.amber} onClick={() => openOrder(o)} />)}{upcomingOrders.length === 0 && <Empty>None</Empty>}</div>
          <div>
            <SectionTitle>Target passed — not confirmed</SectionTitle>{lateOrders.map((o) => <Row key={o.id} title={o.name} sub={o.status} right={`target ${fmtDate(o.target_date)}`} color={C.red} onClick={() => openOrder(o)} />)}{lateOrders.length === 0 && <Empty>None</Empty>}
            {unconfirmed.length > 0 && <><SectionTitle>Customer unconfirmed</SectionTitle>{unconfirmed.map((o) => <Row key={o.id} title={o.name} sub={o.needs_review} color={C.amber} onClick={() => openOrder(o)} />)}</>}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle color={C.green}>E · Commercial value (estimates)</SectionTitle>
        <Card>
          {Object.keys(totals).length === 0 ? <div style={{ fontSize: 13, color: C.dim }}>No priced active opportunities yet.</div> : Object.entries(totals).map(([k, v]) => (
            <div key={k} style={{ fontSize: 14, color: C.text }}><b style={{ color: C.green }}>{k}</b> {Number(v).toLocaleString("en-ZA")}</div>
          ))}
          <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Estimated value of active opportunities, per currency — not converted, not booked revenue. Invoices, balances and payments aren't held in the hub, so none are shown.</div>
        </Card>
      </section>

      <section>
        <SectionTitle>F · Recent activity</SectionTitle>
        {quality.length > 0 && <div onClick={() => go("quality")} style={{ cursor: "pointer", fontSize: 12, color: "#fde68a", marginBottom: 8 }}>⚠ {quality.length} records have missing or inconsistent information — review →</div>}
        {activity.length === 0 ? <Empty icon="🕘">No recorded changes yet</Empty> : activity.map((a) => (
          <div key={a.id} style={{ display: "flex", gap: 10, fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
            <span style={{ color: C.faint, width: 105, flexShrink: 0 }}>{fmtDateTime(a.created_at)}</span>
            <span style={{ color: C.muted, width: 60, flexShrink: 0 }}>{a.actor || "system"}</span>
            <Pill>{a.entity_type}</Pill>
            <span style={{ color: C.text }}>{a.action === "changed" ? `${(a.field || "").replace(/_/g, " ")} → ${a.new_value ?? "—"}` : a.action === "note" ? a.note : a.action} <span style={{ color: C.faint }}>#{a.entity_id}</span></span>
          </div>
        ))}
      </section>
    </div>
  );
}
