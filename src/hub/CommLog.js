import { useState } from "react";
import { COMM_TYPES, OWNERS, PIPELINE_STAGES, stageOf, addDays, todayISO } from "../lib/hub";
import { logCommunication, saveTask, moveOpportunity } from "../lib/data";
import { C, inp, btn, Modal, ModalHeader, Field, Grid, Banner, Picker, useHubUser } from "./ui";

// Record an email / call / meeting / WhatsApp against the business records.
// The communication is its own record: removing it later never touches the
// company, opportunity, task or their history.
export default function CommLog({ initial = {}, companies, contacts, opportunities, tasks, onClose, onSaved }) {
  const { name: me } = useHubUser();
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [form, setForm] = useState({ type: "Email", direction: "Outbound", occurred_at: local, owner: me, ...initial });
  const [followUp, setFollowUp] = useState(form.direction === "Outbound");
  const [fu, setFu] = useState({ subject: "", owner: me, date: addDays(todayISO(), 3), waiting_on: "" });
  const [newStage, setNewStage] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const opp = opportunities.find((o) => o.id === form.opportunity_id);
  const contactsHere = contacts.filter((c) => !form.company_id || (c.company_contacts || []).some((cc) => cc.company_id === form.company_id));

  const save = async () => {
    if (!(form.subject || "").trim() && !(form.notes || "").trim()) { setError("Add a subject or a short summary."); return; }
    if (followUp && !fu.date) { setError("Set a follow-up date (or untick the follow-up)."); return; }
    setSaving(true); setError(null);
    const company = companies.find((c) => c.id === form.company_id);
    const contact = contacts.find((c) => c.id === form.contact_id);
    const { data: comm, error: e1 } = await logCommunication({ ...form, company_name: company?.name, contact_name: contact?.full_name }, me);
    if (e1) { setSaving(false); setError(e1); return; }
    if (newStage && opp && newStage !== stageOf(opp)) {
      const { error: e2 } = await moveOpportunity(opp.id, newStage, me);
      if (e2) { setSaving(false); setError("Communication saved, but the stage didn't update: " + e2); return; }
    }
    if (followUp) {
      const { error: e3 } = await saveTask({
        subject: fu.subject || `Follow up: ${form.subject || form.type}`,
        owner: fu.owner, action_state: "Awaiting response", waiting_on: fu.waiting_on || contact?.full_name || company?.name || null,
        follow_up_date: fu.date, company_id: form.company_id || null, contact_id: form.contact_id || null,
        opportunity_id: form.opportunity_id || null, company: company?.name || null, client: contact?.full_name || null,
        next_action: "Follow up if no reply", date_received: todayISO(), priority: "Medium", task_type: "Follow-up",
        notes: `From ${form.type.toLowerCase()} on ${form.occurred_at?.slice(0, 10)}${comm?.id ? ` (communication #${comm.id})` : ""}`,
      }, me);
      if (e3) { setSaving(false); setError("Communication saved, but the follow-up task wasn't created: " + e3); return; }
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Log communication" onClose={onClose} />
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <Grid>
        <Field label="Type"><select style={inp} value={form.type} onChange={(e) => set("type", e.target.value)}>{COMM_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Direction"><select style={inp} value={form.direction} onChange={(e) => { set("direction", e.target.value); setFollowUp(e.target.value === "Outbound"); }}>{["Outbound", "Inbound", "Internal"].map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="When"><input type="datetime-local" style={inp} value={form.occurred_at} onChange={(e) => set("occurred_at", e.target.value)} /></Field>
        <Field label="Logged by / owner"><select style={inp} value={form.owner} onChange={(e) => set("owner", e.target.value)}>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Company"><Picker value={form.company_id} onChange={(v) => set("company_id", v)} options={companies.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Contact"><Picker value={form.contact_id} onChange={(v) => set("contact_id", v)} options={contactsHere.map((c) => ({ value: c.id, label: c.full_name }))} /></Field>
        <Field label="Opportunity"><Picker value={form.opportunity_id} onChange={(v) => set("opportunity_id", v)} options={opportunities.filter((o) => !form.company_id || o.company_id === form.company_id).map((o) => ({ value: o.id, label: o.name || o.company }))} /></Field>
        <Field label="Task"><Picker value={form.task_id} onChange={(v) => set("task_id", v)} options={tasks.filter((t) => !t.archived_at && (!form.company_id || t.company_id === form.company_id)).slice(0, 200).map((t) => ({ value: t.id, label: t.subject }))} /></Field>
        <Field label="Subject" span><input style={inp} value={form.subject || ""} onChange={(e) => set("subject", e.target.value)} placeholder="e.g. Quotation Q-1042 sent" /></Field>
        <Field label="Summary" span><textarea style={{ ...inp, minHeight: 80 }} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="What was said, decided or committed?" /></Field>
        <Field label="Outcome"><input style={inp} value={form.outcome || ""} onChange={(e) => set("outcome", e.target.value)} /></Field>
        <Field label="Link to original (optional)" hint="Outlook web link or document link"><input style={inp} value={form.external_link || ""} onChange={(e) => set("external_link", e.target.value)} /></Field>
        {opp && <Field label="Move opportunity to" hint={`Currently: ${stageOf(opp)}`}><select style={inp} value={newStage} onChange={(e) => setNewStage(e.target.value)}><option value="">— leave stage</option>{PIPELINE_STAGES.filter((s) => s !== "Lost").map((s) => <option key={s}>{s}</option>)}</select></Field>}
      </Grid>
      <div style={{ marginTop: 16, padding: 12, border: `1px solid ${C.line}`, borderRadius: 10 }}>
        <label style={{ fontSize: 13, color: C.text, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} /> Create an "Awaiting response" follow-up
        </label>
        <div style={{ fontSize: 11, color: C.dim, margin: "4px 0 10px" }}>Sending something doesn't complete the work — this keeps it visible until the matter is resolved.</div>
        {followUp && (
          <Grid>
            <Field label="Follow-up date" required><input type="date" style={inp} value={fu.date} onChange={(e) => setFu({ ...fu, date: e.target.value })} /></Field>
            <Field label="Who follows up"><select style={inp} value={fu.owner} onChange={(e) => setFu({ ...fu, owner: e.target.value })}>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="Waiting on"><input style={inp} value={fu.waiting_on} onChange={(e) => setFu({ ...fu, waiting_on: e.target.value })} placeholder="Defaults to the contact" /></Field>
            <Field label="Task title"><input style={inp} value={fu.subject} onChange={(e) => setFu({ ...fu, subject: e.target.value })} placeholder={`Follow up: ${form.subject || form.type}`} /></Field>
          </Grid>
        )}
      </div>
      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={{ ...btn("primary"), opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}
