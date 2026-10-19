import { useState, useMemo } from "react";
import { RELATIONSHIPS, OWNERS, validateCompany, isOpenTask, isActiveLead, stateOf, actionDate, dueBucket } from "../lib/hub";
import { saveCompany, saveContact, linkContact, archive, saveProject, archiveProject } from "../lib/data";
import { PEOPLE } from "../lib/categories";
import { C, inp, btn, Modal, ModalHeader, Field, Grid, Pill, Banner, SectionTitle, Empty, Card, Picker, fmtDate, useHubUser } from "./ui";
import { OpportunityCard, CommsList, HistoryList } from "./Pipeline";

const REL_LABEL = { client: "Client", prospect: "Prospect", supplier: "Supplier", partner: "Partner", bank_finance: "Bank / finance", intermediary: "Intermediary", property: "Property", other: "Other", needs_review: "Needs review" };
const REL_COLOR = { client: C.green, prospect: C.accent, supplier: C.amber, partner: C.violet, bank_finance: "#64748b", intermediary: "#14b8a6", property: "#6366f1", other: C.dim, needs_review: C.red };

export default function Companies({ companies, contacts, opportunities, tasks, orders, projects = [], onChanged, onOpenTask, onOpenOpportunity, onNewTask, onLogComm }) {
  const [q, setQ] = useState("");
  const [rel, setRel] = useState("all");
  const [open, setOpen] = useState(null);
  const [edit, setEdit] = useState(null);

  const counts = useMemo(() => {
    const m = {};
    for (const c of companies) {
      const projIds = new Set(projects.filter((p) => p.company_id === c.id && !p.archived_at).map((p) => p.id));
      const mine = tasks.filter((t) => (t.company_id === c.id || projIds.has(t.project_id)) && isOpenTask(t));
      m[c.id] = {
        opps: opportunities.filter((o) => o.company_id === c.id && isActiveLead(o)).length,
        projects: projIds.size,
        tasks: mine.length,
        overdue: mine.filter((t) => dueBucket(actionDate(t)) === "overdue").length,
      };
    }
    return m;
  }, [companies, opportunities, tasks, projects]);

  const ql = q.trim().toLowerCase();
  const list = companies.filter((c) =>
    (rel === "all" || (c.relationship_types || []).includes(rel)) &&
    (!ql || [c.name, c.legal_name, c.industry, c.email, ...(c.aliases || []), ...projects.filter((p) => p.company_id === c.id && !p.archived_at).map((p) => p.name)].some((f) => (f || "").toLowerCase().includes(ql)) ||
      contacts.some((p) => (p.company_contacts || []).some((cc) => cc.company_id === c.id) && [p.full_name, p.email].some((f) => (f || "").toLowerCase().includes(ql)))));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input style={{ ...inp, maxWidth: 320 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, project, contact or email…" aria-label="Search companies" />
        <select style={{ ...inp, width: "auto" }} value={rel} onChange={(e) => setRel(e.target.value)} aria-label="Relationship filter">
          <option value="all">All relationships</option>
          {RELATIONSHIPS.map((r) => <option key={r} value={r}>{REL_LABEL[r]}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button style={btn("primary")} onClick={() => setEdit({ status: "Active", relationship_types: [] })}>+ Company</button>
      </div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>{list.length} of {companies.length} companies</div>
      {list.length === 0 ? <Empty icon="🏢">{companies.length ? "No companies match — try a contact name or email" : "No companies yet"}</Empty> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {list.map((c) => (
            <Card key={c.id} onClick={() => setOpen(c)} accent={REL_COLOR[(c.relationship_types || [])[0]] || C.line}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{c.name}</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                {(c.relationship_types || []).map((r) => <Pill key={r} color={REL_COLOR[r]}>{REL_LABEL[r] || r}</Pill>)}
                {c.status !== "Active" && <Pill color={C.amber}>{c.status}</Pill>}
                {c.needs_review && <Pill color={C.amber} title={c.needs_review}>check</Pill>}
              </div>
              <div style={{ fontSize: 11, color: C.muted, display: "flex", gap: 10 }}>
                {counts[c.id]?.projects > 0 && <span>{counts[c.id].projects} project{counts[c.id].projects > 1 ? "s" : ""}</span>}
                <span>{counts[c.id]?.opps || 0} active opps</span>
                <span>{counts[c.id]?.tasks || 0} open tasks</span>
                {counts[c.id]?.overdue > 0 && <span style={{ color: "#fca5a5" }}>⚠ {counts[c.id].overdue} overdue</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && !edit && (
        <CompanyOverview company={open} contacts={contacts} companies={companies} opportunities={opportunities} tasks={tasks} orders={orders} projects={projects}
          onClose={() => setOpen(null)} onEdit={() => setEdit(open)} onChanged={onChanged}
          onOpenTask={onOpenTask} onOpenOpportunity={onOpenOpportunity} onNewTask={onNewTask} onLogComm={onLogComm} />
      )}
      {edit && <CompanyForm company={edit} all={companies} onClose={() => setEdit(null)} onSaved={(c) => { setEdit(null); setOpen(c || null); onChanged(); }} />}
    </div>
  );
}

function CompanyOverview({ company: c, contacts, companies = [], opportunities, tasks, orders, projects = [], onClose, onEdit, onChanged, onOpenTask, onOpenOpportunity, onNewTask, onLogComm }) {
  const [tab, setTab] = useState("overview");
  const [addContact, setAddContact] = useState(false);
  const [linking, setLinking] = useState(false);
  const otherCompanies = (p) => (p.company_contacts || []).filter((cc) => cc.company_id !== c.id).map((cc) => companies.find((x) => x.id === cc.company_id)?.name).filter(Boolean);
  const people = contacts.filter((p) => (p.company_contacts || []).some((cc) => cc.company_id === c.id));
  const opps = opportunities.filter((o) => o.company_id === c.id);
  const coProjects = projects.filter((p) => p.company_id === c.id);
  const projIds = new Set(coProjects.map((p) => p.id));
  const openTasks = tasks.filter((t) => (t.company_id === c.id || projIds.has(t.project_id)) && isOpenTask(t));
  const coOrders = orders.filter((o) => o.customer_company_id === c.id || o.supplier_company_id === c.id);
  return (
    <Modal onClose={onClose} wide>
      <ModalHeader title={c.name} onClose={onClose}>
        <button style={btn("small")} onClick={onEdit}>Edit</button>
        <button style={btn("small")} onClick={() => onLogComm({ company_id: c.id, company_name: c.name })}>+ Log communication</button>
        <button style={btn("small")} onClick={() => onNewTask({ company_id: c.id, company: c.name })}>+ Task</button>
      </ModalHeader>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {(c.relationship_types || []).map((r) => <Pill key={r} color={REL_COLOR[r]}>{REL_LABEL[r] || r}</Pill>)}
        <Pill color={c.status === "Active" ? C.green : C.amber}>{c.status}</Pill>
        {c.industry && <Pill>{c.industry}</Pill>}
        {c.account_owner && <Pill color={C.accent}>Owner: {c.account_owner}</Pill>}
      </div>
      {c.needs_review && <Banner kind="warn">Open question: {c.needs_review}</Banner>}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[["overview", "Overview"], ["projects", `Projects (${coProjects.filter((p) => !p.archived_at).length})`], ["comms", "Communications"], ["history", "History"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...btn("small"), background: tab === k ? C.accent + "33" : C.input, color: tab === k ? C.accent : C.muted, borderColor: tab === k ? C.accent : C.line }}>{l}</button>
        ))}
      </div>
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          <div>
            <SectionTitle>Details</SectionTitle>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
              {c.legal_name && <div>Legal name: <span style={{ color: C.text }}>{c.legal_name}</span></div>}
              {c.email && <div>Email: <a href={`mailto:${c.email}`} style={{ color: C.accent }}>{c.email}</a></div>}
              {c.phone && <div>Phone: <a href={`tel:${c.phone}`} style={{ color: C.accent }}>{c.phone}</a></div>}
              {c.website && <div>Web: <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" style={{ color: C.accent }}>{c.website}</a></div>}
              {c.physical_address && <div>Address: <span style={{ color: C.text }}>{c.physical_address}</span></div>}
              <div>Last interaction: <span style={{ color: C.text }}>{fmtDate(c.last_interaction_at)}</span></div>
              {c.next_action && <div>Next: <span style={{ color: C.accent }}>{c.next_action}</span>{c.next_follow_up_date ? ` · ${fmtDate(c.next_follow_up_date)}` : ""}</div>}
              {(c.aliases || []).length > 0 && <div>Also known as: {(c.aliases || []).join(", ")}</div>}
              {c.notes && <div style={{ marginTop: 6, color: C.text, whiteSpace: "pre-wrap" }}>{c.notes}</div>}
            </div>
            <SectionTitle right={<span style={{ display: "flex", gap: 6 }}><button style={btn("small")} onClick={() => setLinking(true)}>Link existing</button><button style={btn("small")} onClick={() => setAddContact(true)}>+ Contact</button></span>}>Contacts ({people.length})</SectionTitle>
            {linking && <LinkContact companyId={c.id} candidates={contacts.filter((p) => !people.includes(p))} onCancel={() => setLinking(false)} onLinked={() => { setLinking(false); onChanged(); }} />}
            {people.length === 0 ? <Empty icon="👤">No contacts yet</Empty> : people.map((p) => (
              <Card key={p.id}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.full_name} {(p.company_contacts || []).find((cc) => cc.company_id === c.id)?.is_primary && <Pill color={C.green}>primary</Pill>}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{[p.title, (p.company_contacts || []).find((cc) => cc.company_id === c.id)?.role].filter(Boolean).join(" · ")}</div>
                <div style={{ fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {p.email && <a href={`mailto:${p.email}`} style={{ color: C.accent }}>{p.email}</a>}
                  {(p.mobile || p.phone) && <a href={`tel:${p.mobile || p.phone}`} style={{ color: C.accent }}>{p.mobile || p.phone}</a>}
                </div>
                {otherCompanies(p).length > 0 && <div style={{ fontSize: 11, color: C.dim }}>Also at: {otherCompanies(p).join(", ")}</div>}
                {p.needs_verification && <div style={{ fontSize: 11, color: "#fde68a" }}>Verify: {p.needs_verification}</div>}
              </Card>
            ))}
          </div>
          <div>
            <SectionTitle>Opportunities ({opps.length})</SectionTitle>
            {opps.length === 0 ? <Empty icon="🎯">No opportunities</Empty> : opps.map((o) => <OpportunityCard key={o.id} o={o} companyName={c.name} onClick={onOpenOpportunity} />)}
            <SectionTitle>Open tasks ({openTasks.length})</SectionTitle>
            {openTasks.length === 0 ? <Empty icon="✅">Nothing open</Empty> : openTasks.map((t) => {
              const b = dueBucket(actionDate(t));
              return (
                <Card key={t.id} onClick={() => onOpenTask(t)} accent={b === "overdue" ? C.red : C.accent}>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{t.subject}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{t.owner} · {stateOf(t)}{actionDate(t) ? ` · ${fmtDate(actionDate(t))}` : ""}</div>
                </Card>
              );
            })}
            {coOrders.length > 0 && <>
              <SectionTitle>Orders ({coOrders.length})</SectionTitle>
              {coOrders.map((o) => (
                <Card key={o.id} accent={C.amber}>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{o.name}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{o.status || "—"}{o.target_date ? ` · target ${fmtDate(o.target_date)}` : ""}{!o.customer_confirmed ? " · customer unconfirmed" : ""}</div>
                </Card>
              ))}
            </>}
          </div>
        </div>
      )}
      {tab === "projects" && <ProjectsTab company={c} projects={coProjects} tasks={tasks} onChanged={onChanged} onOpenTask={onOpenTask} onNewTask={onNewTask} />}
      {tab === "comms" && <CommsList filter={{ companyId: c.id }} />}
      {tab === "history" && <HistoryList entityType="company" id={c.id} />}
      {addContact && <ContactForm companyId={c.id} onClose={() => setAddContact(false)} onSaved={() => { setAddContact(false); onChanged(); }} />}
    </Modal>
  );
}

export function CompanyForm({ company, all, onClose, onSaved }) {
  const { name: me } = useHubUser();
  const [form, setForm] = useState({ relationship_types: [], aliases: [], ...company });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const set = (k, val) => setForm((f) => ({ ...f, [k]: val }));
  const v = validateCompany(form, all);
  const toggleRel = (r) => set("relationship_types", form.relationship_types.includes(r) ? form.relationship_types.filter((x) => x !== r) : [...form.relationship_types, r]);
  const save = async () => {
    setSubmitted(true);
    if (!v.ok) return;
    setSaving(true);
    const { data, error: e } = await saveCompany({ ...form, aliases: (Array.isArray(form.aliases) ? form.aliases : String(form.aliases || "").split(",")).map((s) => s.trim()).filter(Boolean) }, me);
    setSaving(false);
    if (e) setError(e); else onSaved(data);
  };
  const doArchive = async () => {
    if (!window.confirm("Archive this company? Its contacts, opportunities, tasks and history are kept.")) return;
    const { error: e } = await archive("companies", form.id, me);
    if (e) setError(e); else onSaved(null);
  };
  return (
    <Modal onClose={onClose}>
      <ModalHeader title={form.id ? `Edit ${form.name}` : "New company"} onClose={onClose} />
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      {v.warnings.length > 0 && <Banner kind="warn">{v.warnings.join(" · ")} — check before creating a second record.</Banner>}
      <Grid>
        <Field label="Company name" required error={submitted ? v.errors.name : (v.errors.name?.includes("exists") ? v.errors.name : undefined)} span><input style={inp} value={form.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Relationship" span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {RELATIONSHIPS.map((r) => (
              <button key={r} type="button" onClick={() => toggleRel(r)} style={{ ...btn("small"), background: form.relationship_types.includes(r) ? REL_COLOR[r] + "33" : C.input, color: form.relationship_types.includes(r) ? REL_COLOR[r] : C.muted, borderColor: form.relationship_types.includes(r) ? REL_COLOR[r] : C.line }}>{REL_LABEL[r]}</button>
            ))}
          </div>
        </Field>
        <Field label="Status"><select style={inp} value={form.status || "Active"} onChange={(e) => set("status", e.target.value)}>{["Active", "On Hold", "New Lead", "Inactive"].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Industry"><input style={inp} value={form.industry || ""} onChange={(e) => set("industry", e.target.value)} /></Field>
        <Field label="Account owner"><select style={inp} value={form.account_owner || ""} onChange={(e) => set("account_owner", e.target.value)}><option value="">—</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Legal name"><input style={inp} value={form.legal_name || ""} onChange={(e) => set("legal_name", e.target.value)} /></Field>
        <Field label="Email" error={submitted ? v.errors.email : undefined}><input style={inp} value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone"><input style={inp} value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Website"><input style={inp} value={form.website || ""} onChange={(e) => set("website", e.target.value)} /></Field>
        <Field label="Physical address"><input style={inp} value={form.physical_address || ""} onChange={(e) => set("physical_address", e.target.value)} /></Field>
        <Field label="Postal address"><input style={inp} value={form.postal_address || ""} onChange={(e) => set("postal_address", e.target.value)} /></Field>
        <Field label="Next action"><input style={inp} value={form.next_action || ""} onChange={(e) => set("next_action", e.target.value)} /></Field>
        <Field label="Next follow-up"><input type="date" style={inp} value={form.next_follow_up_date || ""} onChange={(e) => set("next_follow_up_date", e.target.value)} /></Field>
        <Field label="Other names (comma-separated)" hint="Old spellings used in tasks, abbreviations" span><input style={inp} value={Array.isArray(form.aliases) ? form.aliases.join(", ") : form.aliases || ""} onChange={(e) => set("aliases", e.target.value)} /></Field>
        <Field label="Notes / links to documents" span><textarea style={{ ...inp, minHeight: 70 }} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </Grid>
      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {form.id && <button style={{ ...btn("danger"), marginRight: "auto" }} onClick={doArchive}>Archive</button>}
        <button style={btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={btn("primary")} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}

// Associate a person who already exists (e.g. at another company) — no duplicate contact is created.
function LinkContact({ companyId, candidates, onCancel, onLinked }) {
  const [contactId, setContactId] = useState(null);
  const [role, setRole] = useState("");
  const [error, setError] = useState(null);
  const save = async () => {
    if (!contactId) { setError("Choose a contact."); return; }
    const { error: e } = await linkContact(companyId, contactId, role.trim());
    if (e) setError(e); else onLinked();
  };
  return (
    <Card style={{ borderColor: C.accent }}>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <Grid>
        <Field label="Existing contact"><Picker value={contactId} onChange={setContactId} noneLabel="— Choose" options={candidates.map((p) => ({ value: p.id, label: p.full_name + (p.email ? ` · ${p.email}` : "") }))} /></Field>
        <Field label="Role at this company"><input style={inp} value={role} onChange={(e) => setRole(e.target.value)} /></Field>
      </Grid>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
        <button style={btn("ghost")} onClick={onCancel}>Cancel</button>
        <button style={btn("primary")} onClick={save}>Link contact</button>
      </div>
    </Card>
  );
}

function ContactForm({ companyId, onClose, onSaved }) {
  const { name: me } = useHubUser();
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const set = (k, val) => setForm((f) => ({ ...f, [k]: val }));
  const save = async () => {
    if (!(form.full_name || "").trim()) { setError("Name is required."); return; }
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) { setError("That email doesn't look right."); return; }
    const { error: e } = await saveContact(form, companyId, me);
    if (e) setError(e); else onSaved();
  };
  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Add contact" onClose={onClose} />
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <Grid>
        <Field label="Full name" required><input style={inp} value={form.full_name || ""} onChange={(e) => set("full_name", e.target.value)} /></Field>
        <Field label="Title"><input style={inp} value={form.title || ""} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Email"><input style={inp} value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone / mobile"><input style={inp} value={form.mobile || ""} onChange={(e) => set("mobile", e.target.value)} /></Field>
        <Field label="Role at this company"><input style={inp} value={form.role || ""} onChange={(e) => set("role", e.target.value)} /></Field>
        <Field label="Primary contact"><label style={{ color: C.muted, fontSize: 13 }}><input type="checkbox" checked={!!form.is_primary} onChange={(e) => set("is_primary", e.target.checked)} /> Yes</label></Field>
      </Grid>
      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={btn("primary")} onClick={save}>Save contact</button>
      </div>
    </Modal>
  );
}

// Projects live inside a company. A project groups that company's tasks; "+ Task" pre-fills company and project.
function ProjectsTab({ company: c, projects, tasks, onChanged, onOpenTask, onNewTask }) {
  const [form, setForm] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const live = projects.filter((p) => showArchived || !p.archived_at).sort((a, b) => a.name.localeCompare(b.name));
  const save = async () => {
    if (!form.name?.trim()) return setError("Give the project a name.");
    setBusy(true); setError(null);
    const { error: e } = await saveProject({ ...form, company_id: c.id, status: form.status || "Active" });
    setBusy(false);
    if (e) setError(e); else { setForm(null); onChanged(); }
  };
  const toggleArchive = async (p) => {
    const { error: e } = await archiveProject(p.id, !p.archived_at);
    if (e) setError(e); else onChanged();
  };
  return (
    <div>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button style={btn("primary")} onClick={() => setForm({ name: "", description: "", owner: "Sean" })}>+ Project</button>
        <label style={{ fontSize: 12, color: C.muted, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>
      {form && (
        <Card>
          <Grid>
            <Field label="Project name" required><input style={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cold-chain pilot 2027" autoFocus /></Field>
            <Field label="Owner"><select style={inp} value={form.owner || ""} onChange={(e) => setForm({ ...form, owner: e.target.value })}>{PEOPLE.map((o) => <option key={o}>{o}</option>)}</select></Field>
          </Grid>
          <Field label="What is it?"><input style={inp} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="One line" /></Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btn("ghost")} onClick={() => setForm(null)}>Cancel</button>
            <button style={btn("primary")} disabled={busy} onClick={save}>{busy ? "Saving…" : form.id ? "Save" : "Add project"}</button>
          </div>
        </Card>
      )}
      {live.length === 0 && !form && <Empty icon="📋">No projects for {c.name} yet</Empty>}
      {live.map((p) => {
        const pt = tasks.filter((t) => t.project_id === p.id && !t.archived_at);
        const openT = pt.filter(isOpenTask);
        const overdue = openT.filter((t) => dueBucket(actionDate(t)) === "overdue").length;
        const expanded = openId === p.id;
        return (
          <Card key={p.id} accent={p.archived_at ? C.line : C.accent}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", cursor: "pointer" }} onClick={() => setOpenId(expanded ? null : p.id)}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: p.archived_at ? C.faint : C.text }}>{expanded ? "▾" : "▸"} {p.name}{p.archived_at ? " (archived)" : ""}</div>
                <div style={{ fontSize: 12, color: C.dim }}>{[p.owner, p.description].filter(Boolean).join(" · ")}</div>
                {p.needs_review && <div style={{ fontSize: 11, color: "#fde68a" }}>Check: {p.needs_review}</div>}
              </div>
              <div style={{ fontSize: 12, color: C.muted, display: "flex", gap: 10, alignItems: "center" }}>
                <span>{openT.length} open</span>
                {overdue > 0 && <span style={{ color: "#fca5a5" }}>⚠ {overdue} overdue</span>}
                <span>{pt.length - openT.length} done</span>
              </div>
            </div>
            {expanded && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 10 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  {!p.archived_at && <button style={btn("small")} onClick={() => onNewTask({ company_id: c.id, company: c.name, project_id: p.id, project: p.name })}>+ Task</button>}
                  {!p.archived_at && <button style={btn("small")} onClick={() => setForm({ id: p.id, name: p.name, description: p.description || "", owner: p.owner || "Sean" })}>Edit</button>}
                  <button style={btn("small")} onClick={() => toggleArchive(p)}>{p.archived_at ? "Restore" : "Archive"}</button>
                </div>
                {openT.length === 0 ? <div style={{ fontSize: 12, color: C.faint }}>No open tasks.</div> : openT.map((t) => (
                  <div key={t.id} onClick={() => onOpenTask(t)} style={{ display: "flex", gap: 8, padding: "6px 4px", borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer", fontSize: 13 }}>
                    <span style={{ flex: 1, color: C.text }}>{t.subject}</span>
                    <span style={{ color: dueBucket(actionDate(t)) === "overdue" ? "#fca5a5" : C.dim, fontSize: 12 }}>{t.owner} · {actionDate(t) ? fmtDate(actionDate(t)) : "no date"}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
