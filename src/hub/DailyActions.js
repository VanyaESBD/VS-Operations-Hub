import { useState, useMemo } from "react";
import { isOpenTask, stateOf, actionDate, todayISO, isActiveLead, leadFollowUp, stageOf } from "../lib/hub";
import { PEOPLE } from "../lib/categories";
import { C, btn, Modal, ModalHeader } from "./ui";

// Daily action list: everything due today or overdue, grouped by person, FYA and FYI kept apart.
// Built only from what's in the hub — no guessing. Private items are left out of the copy unless ticked.
const daysLate = (d, today) => Math.round((new Date(today + "T00:00:00") - new Date(d + "T00:00:00")) / 86400000);

export function buildDailyActions({ tasks, opportunities = [], reminders = [], today = todayISO(), includePrivate = false }) {
  const due = (d) => d && d <= today;
  const vis = (t) => includePrivate || t.visibility !== "private";
  const open = tasks.filter((t) => isOpenTask(t) && vis(t));
  const line = (t) => ({
    id: t.id, kind: "task", raw: t, owner: t.owner || "Unassigned",
    text: t.subject,   // the task name first; the next step is shown after it
    ctx: t.next_action && t.next_action.trim() && t.next_action.trim() !== t.subject ? "→ " + t.next_action.trim() : null,
    date: actionDate(t), private: t.visibility === "private",
  });
  const groups = {};
  const add = (owner, key, item) => {
    const o = PEOPLE.includes(owner) ? owner : "Unassigned";
    groups[o] = groups[o] || { decide: [], fya: [], chase: [], quick: [], fyi: [], diary: [] };
    groups[o][key].push(item);
  };
  for (const t of open) {
    const st = stateOf(t), d = actionDate(t);
    if ((t.needs_review || "").startsWith("Sean to decide:")) {
      add("Sean", "decide", { ...line(t), text: t.needs_review.slice("Sean to decide:".length).trim(), ctx: t.subject });
      continue;
    }
    if (t.task_type === "Quick task" && st === "Our action") { add(t.owner, "quick", line(t)); continue; }
    if (!due(d)) continue;
    if (st === "Our action") add(t.owner, "fya", line(t));
    else if (st === "Awaiting response") add(t.owner, "chase", { ...line(t), text: `Chase ${t.waiting_on || "reply"} — ${t.subject}`, ctx: null });
    else if (st === "Monitoring") add(t.owner, "fyi", line(t));
  }
  for (const o of opportunities.filter(isActiveLead)) {
    const d = leadFollowUp(o);
    if (!due(d) || stageOf(o) === "On Hold / Nurture") continue;
    add(o.next_action_owner || o.owner, "fya", { id: o.id, kind: "opp", raw: o, owner: o.owner, text: `🎯 ${o.name || o.company}`, ctx: o.next_action ? "→ " + o.next_action : null, date: d });
  }
  for (const r of reminders.filter((r) => !r.completed && r.remind_date <= today && (includePrivate || r.visibility !== "private"))) {
    add(r.owner, "diary", { id: r.id, kind: "reminder", raw: r, owner: r.owner, text: r.title, ctx: r.description || null, date: r.remind_date });
  }
  const byDate = (a, b) => String(a.date || "9").localeCompare(String(b.date || "9"));
  for (const g of Object.values(groups)) for (const k of Object.keys(g)) g[k].sort(byDate);
  const order = [...PEOPLE, "Unassigned"].filter((p) => groups[p]);
  return order.map((p) => ({ person: p, ...groups[p] }));
}

const SECTIONS = [
  ["decide", "❓ Decide", "#f97316"],
  ["fya", "🟠 To do (FYA)", "#c57f58"],
  ["chase", "⏳ Chase (FlwUP)", "#a8a8a8"],
  ["quick", "⚡ Quick jobs", "#18b9dc"],
  ["diary", "📅 Diary", "#60a5fa"],
  ["fyi", "🟣 FYI", "#b39ecc"],
];

export function actionsToText(list, today) {
  const dt = new Date(today + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  let s = `✅ *ESBD — actions for ${dt}*\n`;
  for (const g of list) {
    const n = SECTIONS.reduce((a, [k]) => a + g[k].length, 0);
    if (!n) continue;
    s += `\n*${g.person}*\n`;
    for (const [k, label] of SECTIONS) {
      if (!g[k].length) continue;
      s += `${label}\n`;
      for (const it of g[k]) {
        const late = it.date && it.date < today ? ` (${daysLate(it.date, today)}d overdue)` : "";
        s += `☐ ${it.text}${it.ctx && it.ctx.startsWith("→") ? " " + it.ctx : ""}${late}\n`;
      }
    }
  }
  return s.trim() + "\n";
}

export default function DailyActions({ tasks, opportunities, reminders, onClose, onOpenTask }) {
  const today = todayISO();
  const [includePrivate, setIncludePrivate] = useState(false);
  const [person, setPerson] = useState("Everyone");
  const [copied, setCopied] = useState(false);
  const list = useMemo(() => buildDailyActions({ tasks, opportunities, reminders, today, includePrivate }), [tasks, opportunities, reminders, today, includePrivate]);
  const shown = person === "Everyone" ? list : list.filter((g) => g.person === person);
  const total = shown.reduce((a, g) => a + SECTIONS.reduce((b, [k]) => b + g[k].length, 0), 0);
  const text = actionsToText(shown, today);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    w.document.write(`<html><head><title>ESBD daily actions</title><style>body{font-family:Aptos,"Segoe UI",system-ui,sans-serif;padding:24px;white-space:pre-wrap;font-size:13px;line-height:1.6}</style></head><body>${esc(text.replace(/\*/g, ""))}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  return (
    <Modal onClose={onClose} wide>
      <ModalHeader title="✅ Daily action list" onClose={onClose} />
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>
        {new Date(today + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · everything due today or overdue, grouped by person. Built from the hub only.
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {["Everyone", ...list.map((g) => g.person)].map((p) => (
          <button key={p} onClick={() => setPerson(p)} aria-pressed={person === p}
            style={{ ...btn("small"), borderRadius: 99, background: person === p ? C.accent : "none", color: person === p ? "#fff" : C.muted, borderColor: person === p ? C.accent : C.line }}>{p}</button>
        ))}
        <label style={{ marginLeft: "auto", fontSize: 12, color: C.muted, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} /> Include private 🔒
        </label>
      </div>
      {total === 0 && <div style={{ textAlign: "center", color: C.dim, padding: 30 }}>Nothing due today. 🎉</div>}
      {shown.map((g) => {
        const n = SECTIONS.reduce((a, [k]) => a + g[k].length, 0);
        if (!n) return null;
        return (
          <div key={g.person} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text, borderBottom: `1px solid ${C.line}`, paddingBottom: 4, marginBottom: 6 }}>{g.person} <span style={{ fontSize: 12, color: C.dim, fontWeight: 400 }}>· {n}</span></div>
            {SECTIONS.map(([k, label, ink]) => g[k].length > 0 && (
              <div key={k} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: ink, textTransform: "uppercase", letterSpacing: 0.6, margin: "6px 0 2px" }}>{label}</div>
                {g[k].map((it) => (
                  <div key={it.kind + it.id + k} onClick={() => it.kind === "task" && onOpenTask(it.raw)}
                    style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 2px", cursor: it.kind === "task" ? "pointer" : "default", fontSize: 13 }}>
                    <span style={{ color: C.dim }}>☐</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: C.text }}>{it.text}</span>{it.private && " 🔒"}
                      {it.ctx && <span style={{ color: C.dim, fontSize: 11 }}> · {it.ctx}</span>}
                    </span>
                    {it.date && <span style={{ fontSize: 11, color: it.date < today ? C.red : C.amber, flexShrink: 0 }}>{it.date < today ? `${daysLate(it.date, today)}d overdue` : "today"}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
        <button style={btn("ghost")} onClick={print}>🖨 Print</button>
        <button style={btn("primary")} onClick={copy}>{copied ? "✅ Copied" : "📋 Copy for WhatsApp / email"}</button>
      </div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>Actions from emails appear here once the Outlook connection is live. Until then, send emails to Claude to turn them into tasks.</div>
    </Modal>
  );
}
