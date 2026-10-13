import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PIPELINE_STAGES, STAGE_COLOR, CURRENCIES, VALUE_BASES, PRIORITIES, OWNERS, ACTION_STATES,
  stageOf, leadFollowUp, dueBucket, formatMoney, pipelineTotals, isQuiet, validateOpportunity, stateOf, isOpenTask,
} from "../lib/hub";
import { saveOpportunity, moveOpportunity, archive, restore, loadActivityFor, loadCommunications, addActivityNote, relinkCommunication, loadLinkOptions } from "../lib/data";
import { C, inp, btn, Modal, ModalHeader, Field, Grid, Pill, Banner, SectionTitle, Empty, Card, Picker, fmtDate, fmtDateTime, useHubUser } from "./ui";

const BUCKET_COLOR = { overdue: C.red, today: C.amber, week: C.accent, later: C.dim, none: C.faint };

export function OpportunityCard({ o, companyName, onClick, compact }) {
  const st = stageOf(o);
  const fu = leadFollowUp(o);
  const b = dueBucket(fu);
  const money = formatMoney(o.value_amount, o.currency, o.value_basis);
  return (
    <Card onClick={() => onClick(o)} accent={STAGE_COLOR[st]} style={{ padding: compact ? "9px 11px" : "12px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>{o.name || o.company}</div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>{companyName || o.company || <i>No company linked</i>}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {money && <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>{money}</span>}
        {o.owner && <span style={{ fontSize: 11, color: C.muted }}>{o.owner}</span>}
        {fu && <Pill color={BUCKET_COLOR[b]}>{b === "overdue" ? "⚠ " : ""}{st === "On Hold / Nurture" ? "Review " : "Follow up "}{fmtDate(fu)}</Pill>}
        {isQuiet(o) && <Pill color={C.amber} title="No interaction or update for 3 weeks">quiet</Pill>}
        {o.needs_review && <Pill color={C.amber} title={o.needs_review}>check</Pill>}
      </div>
      {!compact && o.next_action && <div style={{ marginTop: 6, fontSize: 12, color: C.accent }}>→ {o.next_action}{o.next_action_owner ? ` (${o.next_action_owner})` : ""}</div>}
    </Card>
  );
}

export default function Pipeline({ opportunities, companies, contacts, tasks, onChanged, onOpenTask, onNewTask }) {
  const { name: me } = useHubUser();
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [showClosed, setShowClosed] = useState(false);
  const [open, setOpen] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [error, setError] = useState(null);
  const companyName = useCallback((id) => companies.find((c) => c.id === id)?.name, [companies]);

  const visible = opportunities.filter((o) => ownerFilter === "All" || o.owner === ownerFilter || o.next_action_owner === ownerFilter);
  const stages = showClosed ? PIPELINE_STAGES : PIPELINE_STAGES.filter((s) => !["Won", "Lost"].includes(s));
  const totals = pipelineTotals(opportunities);

  const move = async (id, stage) => {
    const o = opportunities.find((x) => String(x.id) === String(id));
    if (!o || stageOf(o) === stage) return;
    if (stage === "Lost" || stage === "On Hold / Nurture") { setOpen({ ...o, pipeline_stage: stage }); return; } // needs a reason / review date
    const { error: e } = await moveOpportunity(o.id, stage, me);
    if (e) setError(e); else onChanged();
  };

  return (
    <div>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <select style={{ ...inp, width: "auto" }} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} aria-label="Owner filter">
          <option value="All">All owners</option>
          {OWNERS.map((o) => <option key={o}>{o}</option>)}
        </select>
        <label style={{ fontSize: 12, color: C.muted, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show Won / Lost
        </label>
        <div data-testid="pipeline-totals" style={{ fontSize: 12, color: C.muted, flex: 1 }}>
          {Object.keys(totals).length ? <>Estimated active pipeline: {Object.entries(totals).map(([k, v]) => <b key={k} style={{ color: C.green, marginRight: 10 }}>{k} {Number(v).toLocaleString("en-ZA")}</b>)} <span style={{ color: C.faint }}>(estimates, not booked revenue)</span></> : <span style={{ color: C.faint }}>No priced opportunities yet</span>}
        </div>
        <button style={btn("primary")} onClick={() => setOpen({ pipeline_stage: "New Lead", owner: me, priority: "Medium" })}>+ Opportunity</button>
      </div>

      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
        {stages.map((s) => {
          const items = visible.filter((o) => stageOf(o) === s);
          return (
            <div key={s}
              onDragOver={(e) => { e.preventDefault(); setDragOver(s); }} onDragLeave={() => setDragOver(null)}
              onDrop={(e) => { e.preventDefault(); setDragOver(null); move(e.dataTransfer.getData("oppId"), s); }}
              style={{ minWidth: 230, width: 230, flexShrink: 0, background: dragOver === s ? "#1e1e35" : C.panel, border: `1px solid ${dragOver === s ? STAGE_COLOR[s] : C.line}`, borderTop: `3px solid ${STAGE_COLOR[s]}`, borderRadius: 12, padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1 }}>{s}</span>
                <span style={{ background: C.line, borderRadius: 99, padding: "1px 8px", fontSize: 11, color: C.muted }}>{items.length}</span>
              </div>
              {items.map((o) => (
                <div key={o.id} draggable onDragStart={(e) => e.dataTransfer.setData("oppId", String(o.id))}>
                  <OpportunityCard o={o} companyName={companyName(o.company_id)} onClick={setOpen} compact />
                </div>
              ))}
              {items.length === 0 && <div style={{ textAlign: "center", padding: "18px 0", color: "#374151", fontSize: 11 }}>Drop here</div>}
            </div>
          );
        })}
      </div>

      {open && (
        <OpportunityModal opp={open} companies={companies} contacts={contacts} tasks={tasks}
          onClose={() => setOpen(null)} onSaved={() => { setOpen(null); onChanged(); }}
          onOpenTask={onOpenTask} onNewTask={onNewTask} />
      )}
    </div>
  );
}

export function OpportunityModal({ opp, companies, contacts, tasks, onClose, onSaved, onOpenTask, onNewTask }) {
  const { name: me } = useHubUser();
  const [form, setForm] = useState(() => ({ priority: "Medium", ...opp, pipeline_stage: stageOf(opp) }));
  const [tab, setTab] = useState("details");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const v = validateOpportunity(form);
  const linkedTasks = useMemo(() => (form.id ? tasks.filter((t) => t.opportunity_id === form.id) : []), [tasks, form.id]);
  const companyContacts = useMemo(() => contacts.filter((c) => !form.company_id || (c.company_contacts || []).some((cc) => cc.company_id === form.company_id)), [contacts, form.company_id]);

  const save = async () => {
    setSubmitted(true);
    if (!v.ok) return;
    setSaving(true); setError(null);
    const comp = companies.find((c) => c.id === form.company_id);
    const ct = contacts.find((c) => c.id === form.contact_id);
    const { error: e } = await saveOpportunity({ ...form, company: comp?.name || form.company || form.name, contact: ct?.full_name || form.contact }, me);
    setSaving(false);
    if (e) setError(e); else onSaved();
  };
  const doArchive = async () => {
    if (!window.confirm("Archive this opportunity? It keeps its history and can be restored.")) return;
    const { error: e } = await archive("leads", form.id, me);
    if (e) setError(e); else onSaved();
  };
  const doRestore = async () => { const { error: e } = await restore("leads", form.id, me); if (e) setError(e); else onSaved(); };
  const err = (k) => (submitted ? v.errors[k] : undefined);
  const stage = form.pipeline_stage;

  return (
    <Modal onClose={onClose} wide>
      <ModalHeader title={form.id ? form.name || form.company : "New opportunity"} onClose={onClose}>
        {form.id && <Pill color={STAGE_COLOR[stage]}>{stage}</Pill>}
      </ModalHeader>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      {form.archived_at && <Banner kind="warn">Archived {fmtDate(form.archived_at)}. <button style={btn("small")} onClick={doRestore}>Restore</button></Banner>}
      {form.id && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {[["details", "Details"], ["tasks", `Tasks (${linkedTasks.filter(isOpenTask).length})`], ["comms", "Communications"], ["history", "History"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...btn("small"), background: tab === k ? C.accent + "33" : C.input, color: tab === k ? C.accent : C.muted, borderColor: tab === k ? C.accent : C.line }}>{l}</button>
          ))}
        </div>
      )}

      {tab === "details" && (
        <>
          <Grid>
            <Field label="Opportunity name" required error={err("name")} span><input style={inp} value={form.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. UPD March 2027 renewal" /></Field>
            <Field label="Company" hint={!form.company_id ? "Not linked yet — pick or create the company" : undefined}>
              <Picker value={form.company_id} onChange={(id) => set("company_id", id)} noneLabel="— Not linked" options={companies.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Contact">
              <Picker value={form.contact_id} onChange={(id) => set("contact_id", id)} options={companyContacts.map((c) => ({ value: c.id, label: c.full_name + (c.email ? ` · ${c.email}` : "") }))} />
            </Field>
            <Field label="Stage" required error={err("pipeline_stage")}>
              <select style={inp} value={stage} onChange={(e) => set("pipeline_stage", e.target.value)}>{PIPELINE_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
            </Field>
            <Field label="Owner"><select style={inp} value={form.owner || "Unassigned"} onChange={(e) => set("owner", e.target.value)}>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="Priority"><select style={inp} value={form.priority || "Medium"} onChange={(e) => set("priority", e.target.value)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Product / service of interest"><input style={inp} value={form.product_interest || ""} onChange={(e) => set("product_interest", e.target.value)} /></Field>
            <Field label="Estimated value" error={err("value_amount")} hint="Number only — leave blank if unknown"><input style={inp} inputMode="decimal" value={form.value_amount ?? ""} onChange={(e) => set("value_amount", e.target.value)} placeholder="e.g. 51720" /></Field>
            <Field label="Currency" error={err("currency")}><select style={inp} value={form.currency || ""} onChange={(e) => set("currency", e.target.value)}><option value="">—</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Value basis"><select style={inp} value={form.value_basis || ""} onChange={(e) => set("value_basis", e.target.value)}><option value="">—</option>{VALUE_BASES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Probability %" error={err("probability")}><input style={inp} inputMode="numeric" value={form.probability ?? ""} onChange={(e) => set("probability", e.target.value)} /></Field>
            <Field label="Lead source"><input style={inp} value={form.lead_source || ""} onChange={(e) => set("lead_source", e.target.value)} placeholder="Referral, website, existing client…" /></Field>
            <Field label="Next action" span><input style={inp} value={form.next_action || ""} onChange={(e) => set("next_action", e.target.value)} placeholder="What has to happen next?" /></Field>
            <Field label="Next action owner"><select style={inp} value={form.next_action_owner || ""} onChange={(e) => set("next_action_owner", e.target.value)}><option value="">—</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="Next action state"><select style={inp} value={form.action_state || ""} onChange={(e) => set("action_state", e.target.value)}><option value="">—</option>{ACTION_STATES.filter((s) => s !== "Completed" && s !== "Cancelled").map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Follow-up date" error={err("follow_up_date")}><input type="date" style={inp} value={form.follow_up_date || ""} onChange={(e) => set("follow_up_date", e.target.value)} /></Field>
            <Field label="Expected decision date" error={err("expected_decision_date")}><input type="date" style={inp} value={form.expected_decision_date || ""} onChange={(e) => set("expected_decision_date", e.target.value)} /></Field>
            <Field label="Expected close date" error={err("expected_close_date")}><input type="date" style={inp} value={form.expected_close_date || ""} onChange={(e) => set("expected_close_date", e.target.value)} /></Field>
            {stage === "On Hold / Nurture" && <>
              <Field label="Reason on hold"><input style={inp} value={form.hold_reason || ""} onChange={(e) => set("hold_reason", e.target.value)} /></Field>
              <Field label="Review date" error={err("review_date")} hint="When it should come back up"><input type="date" style={inp} value={form.review_date || ""} onChange={(e) => set("review_date", e.target.value)} /></Field>
            </>}
            {stage === "Lost" && <Field label="Reason lost" required error={err("lost_reason")} span><input style={inp} value={form.lost_reason || ""} onChange={(e) => set("lost_reason", e.target.value)} /></Field>}
            {(stage === "Won" || stage === "Lost") && <>
              <Field label="Outcome"><input style={inp} value={form.outcome || ""} onChange={(e) => set("outcome", e.target.value)} /></Field>
              <Field label="Closed on" error={err("closed_at")}><input type="date" style={inp} value={form.closed_at || ""} onChange={(e) => set("closed_at", e.target.value)} /></Field>
            </>}
            <Field label="Description / notes" span><textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></Field>
            {form.needs_review && <Field label="Open question" span><input style={{ ...inp, borderColor: C.amber }} value={form.needs_review || ""} onChange={(e) => set("needs_review", e.target.value)} /></Field>}
          </Grid>
          {v.warnings.length > 0 && <div style={{ marginTop: 12, fontSize: 12, color: "#fde68a" }}>Missing information (you can still save): {v.warnings.join(" · ")}</div>}
          <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {form.id && !form.archived_at && <button style={{ ...btn("danger"), marginRight: "auto" }} onClick={doArchive}>Archive</button>}
            <button style={btn("ghost")} onClick={onClose}>Cancel</button>
            <button style={{ ...btn("primary"), opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>{saving ? "Saving…" : form.id ? "Save changes" : "Create opportunity"}</button>
          </div>
        </>
      )}

      {tab === "tasks" && (
        <div>
          <SectionTitle right={<button style={btn("small")} onClick={() => onNewTask({ opportunity_id: form.id, company_id: form.company_id, company: form.company })}>+ Task</button>}>Tasks for this opportunity</SectionTitle>
          {linkedTasks.length === 0 ? <Empty icon="📋">No tasks linked yet</Empty> : linkedTasks.map((t) => (
            <Card key={t.id} onClick={() => onOpenTask(t)} accent={isOpenTask(t) ? C.accent : C.faint}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{t.subject}</span>
                <span style={{ fontSize: 11, color: C.dim }}>{t.owner} · {stateOf(t)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === "comms" && <CommsList filter={{ opportunityId: form.id }} />}
      {tab === "history" && <HistoryList entityType="opportunity" id={form.id} />}
    </Modal>
  );
}

export function CommsList({ filter }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reload, setReload] = useState(0);
  const key = JSON.stringify(filter);
  useEffect(() => {
    let live = true;
    loadCommunications(JSON.parse(key)).then(({ data, error: e }) => { if (!live) return; if (e) setError(e); setItems(data || []); });
    return () => { live = false; };
  }, [key, reload]);
  if (error) return <Banner>{error}</Banner>;
  if (!items) return <div style={{ color: C.dim, fontSize: 12 }}>Loading…</div>;
  if (!items.length) return <Empty icon="✉️">No communications logged yet</Empty>;
  return items.map((i) => (
    <Card key={i.id} accent={i.direction === "Inbound" ? C.green : C.accent}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{i.subject || i.type}</span>
        <span style={{ fontSize: 11, color: C.dim }}>{fmtDateTime(i.occurred_at || i.created_at)}</span>
      </div>
      <div style={{ fontSize: 11, color: C.muted }}>{[i.type, i.direction, i.client, i.owner || i.logged_by].filter(Boolean).join(" · ")}</div>
      {i.notes && <div style={{ fontSize: 12, color: C.text, marginTop: 6, whiteSpace: "pre-wrap" }}>{i.notes}</div>}
      {i.outcome && <div style={{ fontSize: 12, color: C.green, marginTop: 4 }}>Outcome: {i.outcome}</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
        {i.external_link && <a href={i.external_link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.accent }}>Open original ↗</a>}
        <button style={{ ...btn("small"), marginLeft: "auto" }} onClick={() => setEditing(editing === i.id ? null : i.id)}>Change links</button>
      </div>
      {editing === i.id && <RelinkComm comm={i} onDone={() => { setEditing(null); setReload((n) => n + 1); }} />}
    </Card>
  ));
}

function RelinkComm({ comm, onDone }) {
  const { name: me } = useHubUser();
  const [opts, setOpts] = useState(null);
  const [form, setForm] = useState({ company_id: comm.company_id, opportunity_id: comm.opportunity_id, task_id: comm.task_id });
  const [error, setError] = useState(null);
  useEffect(() => { loadLinkOptions(form.company_id).then(({ data, error: e }) => { if (e) setError(e); setOpts(data); }); }, [form.company_id]);
  const save = async () => {
    const company = opts?.companies.find((c) => c.id === form.company_id);
    const { error: e } = await relinkCommunication(comm.id, { ...form, company_name: company?.name ?? null }, me);
    if (e) setError(e); else onDone();
  };
  if (!opts) return <div style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>Loading…</div>;
  const oppOpts = opts.opportunities.filter((o) => !form.company_id || o.company_id === form.company_id || o.id === form.opportunity_id);
  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <Grid cols={3}>
        <Field label="Company"><Picker value={form.company_id} onChange={(v) => setForm((f) => ({ ...f, company_id: v, task_id: null }))} options={opts.companies.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Opportunity"><Picker value={form.opportunity_id} onChange={(v) => setForm((f) => ({ ...f, opportunity_id: v }))} options={oppOpts.map((o) => ({ value: o.id, label: o.name || o.company }))} /></Field>
        <Field label="Task"><Picker value={form.task_id} onChange={(v) => setForm((f) => ({ ...f, task_id: v }))} options={opts.tasks.map((t) => ({ value: t.id, label: t.subject }))} /></Field>
      </Grid>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <button style={btn("ghost")} onClick={onDone}>Cancel</button>
        <button style={btn("primary")} onClick={save}>Save links</button>
      </div>
    </div>
  );
}

export function HistoryList({ entityType, id }) {
  const { name: me } = useHubUser();
  const [items, setItems] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const load = useCallback(() => { loadActivityFor(entityType, id).then(({ data, error: e }) => { if (e) setError(e); setItems(data || []); }); }, [entityType, id]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!note.trim()) return;
    const { error: e } = await addActivityNote(entityType, id, note.trim(), me);
    if (e) setError(e); else { setNote(""); load(); }
  };
  const label = (h) => h.action === "note" ? h.note
    : h.action === "created" ? "Created"
    : h.action === "archived" ? "Archived" : h.action === "restored" ? "Restored"
    : `${(h.field || "").replace(/_/g, " ")}: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}`;
  return (
    <div>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input style={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an important note…" onKeyDown={(e) => e.key === "Enter" && add()} />
        <button style={btn("primary")} onClick={add}>Add</button>
      </div>
      {!items ? <div style={{ color: C.dim, fontSize: 12 }}>Loading…</div> : items.length === 0 ? <Empty icon="🕘">No history yet</Empty> : items.map((h) => (
        <div key={h.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12 }}>
          <span style={{ color: C.faint, width: 110, flexShrink: 0 }}>{fmtDateTime(h.created_at)}</span>
          <span style={{ color: C.muted, width: 70, flexShrink: 0 }}>{h.actor || "system"}</span>
          <span style={{ color: h.action === "note" ? C.text : C.muted }}>{label(h)}</span>
        </div>
      ))}
    </div>
  );
}
