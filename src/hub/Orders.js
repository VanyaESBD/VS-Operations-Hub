import { useState } from "react";
import { MILESTONE_STATUSES, CURRENCIES, OWNERS, validateMilestone, formatMoney, dueBucket } from "../lib/hub";
import { saveMilestone, saveOrder, archive } from "../lib/data";
import { C, inp, btn, Modal, ModalHeader, Field, Grid, Pill, Banner, SectionTitle, Empty, Card, Picker, fmtDate, useHubUser } from "./ui";
import { HistoryList } from "./Pipeline";

const MS_COLOR = { "Done": C.green, "In progress": C.accent, "Awaiting": C.amber, "Target only": C.violet, "Not confirmed": C.dim, "Not started": C.faint, "Blocked": C.red, "Unclear": C.amber };

export default function Orders({ orders, companies, opportunities, onChanged }) {
  const [open, setOpen] = useState(null);
  const [edit, setEdit] = useState(null);
  const name = (id) => companies.find((c) => c.id === id)?.name;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.dim }}>Orders, contracts and fulfilment — separate from the sales pipeline. A target date stays a target until delivery is confirmed.</div>
        <button style={btn("primary")} onClick={() => setEdit({ kind: "Customer order", customer_confirmed: true })}>+ Order</button>
      </div>
      {orders.length === 0 ? <Empty icon="📦">No orders yet</Empty> : orders.map((o) => {
        const ms = [...(o.order_milestones || [])].sort((a, b) => a.sort - b.sort || a.id - b.id);
        const done = ms.filter((m) => m.status === "Done").length;
        const late = o.target_date && !o.actual_date && dueBucket(o.target_date) === "overdue";
        return (
          <Card key={o.id} onClick={() => setOpen(o)} accent={late ? C.red : C.amber}>
            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{o.name} {o.ref && <span style={{ color: C.dim, fontWeight: 400 }}>· {o.ref}</span>}</div>
                <div style={{ fontSize: 12, color: C.dim }}>{o.kind} · {o.customer_company_id ? name(o.customer_company_id) : <span style={{ color: "#fde68a" }}>customer unconfirmed</span>}{o.supplier_company_id ? ` · supplier ${name(o.supplier_company_id)}` : ""}</div>
                {o.next_action && <div style={{ fontSize: 12, color: C.accent, marginTop: 3 }}>→ {o.next_action}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: C.muted }}>{o.status || "—"}</div>
                {o.target_date && <div style={{ fontSize: 12, color: late ? "#fca5a5" : C.dim }}>{o.actual_date ? `Delivered ${fmtDate(o.actual_date)}` : `Target ${fmtDate(o.target_date)}${late ? " — passed, not confirmed" : ""}`}</div>}
                {ms.length > 0 && <div style={{ fontSize: 11, color: C.faint }}>{done}/{ms.length} milestones confirmed</div>}
              </div>
            </div>
          </Card>
        );
      })}
      {open && <OrderDetail order={orders.find((x) => x.id === open.id) || open} companies={companies} opportunities={opportunities} onClose={() => setOpen(null)} onEdit={() => { setEdit(open); setOpen(null); }} onChanged={onChanged} />}
      {edit && <OrderForm order={edit} companies={companies} opportunities={opportunities} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); }} />}
    </div>
  );
}

function OrderDetail({ order: o, companies, opportunities, onClose, onEdit, onChanged }) {
  const { name: me } = useHubUser();
  const [tab, setTab] = useState("milestones");
  const [editing, setEditing] = useState(null);
  const ms = [...(o.order_milestones || [])].sort((a, b) => a.sort - b.sort || a.id - b.id);
  return (
    <Modal onClose={onClose} wide>
      <ModalHeader title={o.name} onClose={onClose}><button style={btn("small")} onClick={onEdit}>Edit order</button></ModalHeader>
      {!o.customer_confirmed && <Banner kind="warn">Customer not confirmed — this order isn't linked to a customer until that's established.</Banner>}
      {o.needs_review && <Banner kind="warn">Open question: {o.needs_review}</Banner>}
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.8, marginBottom: 12 }}>
        {o.ref && <div>Reference: <b style={{ color: C.text }}>{o.ref}</b></div>}
        {o.opportunity_id && <div>Opportunity: <span style={{ color: C.text }}>{opportunities.find((x) => x.id === o.opportunity_id)?.name || "#" + o.opportunity_id}</span></div>}
        {o.quantity_note && <div>Quantity: <span style={{ color: C.text }}>{o.quantity_note}</span></div>}
        {(o.amount != null || o.amount_note) && <div>Amount: <span style={{ color: C.text }}>{formatMoney(o.amount, o.currency) || ""} {o.amount_note}</span></div>}
        {o.notes && <div style={{ color: C.text, whiteSpace: "pre-wrap" }}>{o.notes}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["milestones", "Milestones"], ["history", "History"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...btn("small"), background: tab === k ? C.accent + "33" : C.input, color: tab === k ? C.accent : C.muted, borderColor: tab === k ? C.accent : C.line }}>{l}</button>
        ))}
      </div>
      {tab === "milestones" && <>
        <SectionTitle right={<button style={btn("small")} onClick={() => setEditing({ status: "Not confirmed", sort: ms.length })}>+ Milestone</button>}>Fulfilment milestones</SectionTitle>
        {ms.length === 0 ? <Empty icon="🧭">No milestones yet</Empty> : ms.map((m) => (
          <Card key={m.id} onClick={() => setEditing(m)} accent={MS_COLOR[m.status]}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.name}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {m.target_date && <span style={{ fontSize: 11, color: C.dim }}>target {fmtDate(m.target_date)}</span>}
                {m.actual_date && <span style={{ fontSize: 11, color: C.green }}>actual {fmtDate(m.actual_date)}</span>}
                <Pill color={MS_COLOR[m.status]}>{m.status}</Pill>
              </span>
            </div>
            {(m.owner_label || m.evidence) && <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>{[m.owner_label && `Owner: ${m.owner_label}`, m.evidence && `Source: ${m.evidence}`].filter(Boolean).join(" · ")}</div>}
          </Card>
        ))}
      </>}
      {tab === "history" && <HistoryList entityType="order" id={o.id} />}
      {editing && <MilestoneForm orderId={o.id} m={editing} actor={me} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </Modal>
  );
}

function MilestoneForm({ orderId, m, actor, onClose, onSaved }) {
  const [form, setForm] = useState({ ...m });
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const v = validateMilestone(form);
  const save = async () => {
    setSubmitted(true);
    if (!v.ok) return;
    const { error: e } = await saveMilestone(orderId, form, actor);
    if (e) setError(e); else onSaved();
  };
  return (
    <Modal onClose={onClose}>
      <ModalHeader title={form.id ? "Update milestone" : "New milestone"} onClose={onClose} />
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <Grid>
        <Field label="Milestone" required error={submitted ? v.errors.name : undefined} span><input style={inp} value={form.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Advance payment received" /></Field>
        <Field label="Status"><select style={inp} value={form.status} onChange={(e) => set("status", e.target.value)}>{MILESTONE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Owner (as named)"><input style={inp} value={form.owner_label || ""} onChange={(e) => set("owner_label", e.target.value)} /></Field>
        <Field label="Target date" error={submitted ? v.errors.target_date : undefined}><input type="date" style={inp} value={form.target_date || ""} onChange={(e) => set("target_date", e.target.value)} /></Field>
        <Field label="Actual date" error={submitted ? v.errors.actual_date : undefined} hint="Only when it has actually happened"><input type="date" style={inp} value={form.actual_date || ""} onChange={(e) => set("actual_date", e.target.value)} /></Field>
        <Field label="Evidence / source" error={submitted ? v.errors.evidence : undefined} hint="Email, POP, signed doc… required to mark Done without a date" span><input style={inp} value={form.evidence || ""} onChange={(e) => set("evidence", e.target.value)} /></Field>
      </Grid>
      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={btn("primary")} onClick={save}>Save</button>
      </div>
    </Modal>
  );
}

function OrderForm({ order, companies, opportunities, onClose, onSaved }) {
  const { name: me } = useHubUser();
  const [form, setForm] = useState({ ...order });
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!(form.name || "").trim()) { setError("Give the order a name."); return; }
    if (form.amount !== undefined && form.amount !== null && form.amount !== "" && !(Number(form.amount) >= 0)) { setError("Amount must be a positive number."); return; }
    if (form.amount && !form.currency) { setError("Choose a currency for the amount."); return; }
    const { error: e } = await saveOrder(form, me);
    if (e) setError(e); else onSaved();
  };
  const doArchive = async () => {
    if (!window.confirm("Archive this order? Milestones and history are kept.")) return;
    const { error: e } = await archive("orders", form.id, me);
    if (e) setError(e); else onSaved();
  };
  const co = companies.map((c) => ({ value: c.id, label: c.name }));
  return (
    <Modal onClose={onClose}>
      <ModalHeader title={form.id ? "Edit order" : "New order"} onClose={onClose} />
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <Grid>
        <Field label="Name" required span><input style={inp} value={form.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Reference (PO / order no.)"><input style={inp} value={form.ref || ""} onChange={(e) => set("ref", e.target.value)} /></Field>
        <Field label="Type"><select style={inp} value={form.kind} onChange={(e) => set("kind", e.target.value)}>{["Customer order", "Supplier order", "Rental contract", "Other"].map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Customer" hint="Leave blank if not confirmed"><Picker value={form.customer_company_id} onChange={(v) => { set("customer_company_id", v); set("customer_confirmed", !!v); }} noneLabel="— Unconfirmed" options={co} /></Field>
        <Field label="Supplier"><Picker value={form.supplier_company_id} onChange={(v) => set("supplier_company_id", v)} options={co} /></Field>
        <Field label="Opportunity"><Picker value={form.opportunity_id} onChange={(v) => set("opportunity_id", v)} options={opportunities.map((o) => ({ value: o.id, label: o.name || o.company }))} /></Field>
        <Field label="Owner"><select style={inp} value={form.owner || ""} onChange={(e) => set("owner", e.target.value)}><option value="">—</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Status"><input style={inp} value={form.status || ""} onChange={(e) => set("status", e.target.value)} placeholder="e.g. In production" /></Field>
        <Field label="Quantity"><input style={inp} value={form.quantity_note || ""} onChange={(e) => set("quantity_note", e.target.value)} /></Field>
        <Field label="Amount"><input style={inp} inputMode="decimal" value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value)} /></Field>
        <Field label="Currency"><select style={inp} value={form.currency || ""} onChange={(e) => set("currency", e.target.value)}><option value="">—</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Amount note" hint="e.g. invoice total — not the deal value"><input style={inp} value={form.amount_note || ""} onChange={(e) => set("amount_note", e.target.value)} /></Field>
        <Field label="Target date"><input type="date" style={inp} value={form.target_date || ""} onChange={(e) => set("target_date", e.target.value)} /></Field>
        <Field label="Actual delivery date" hint="Only once delivery is confirmed"><input type="date" style={inp} value={form.actual_date || ""} onChange={(e) => set("actual_date", e.target.value)} /></Field>
        <Field label="Next action" span><input style={inp} value={form.next_action || ""} onChange={(e) => set("next_action", e.target.value)} /></Field>
        <Field label="Notes" span><textarea style={{ ...inp, minHeight: 70 }} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </Grid>
      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {form.id && <button style={{ ...btn("danger"), marginRight: "auto" }} onClick={doArchive}>Archive</button>}
        <button style={btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={btn("primary")} onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
