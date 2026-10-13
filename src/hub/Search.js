import { useState, useEffect } from "react";
import { searchHub } from "../lib/data";
import { C, inp, Pill, Banner, Empty, Card } from "./ui";

const KIND = { company: ["🏢", "Company", C.accent], contact: ["👤", "Contact", C.violet], opportunity: ["🎯", "Opportunity", C.green], task: ["📋", "Task", C.amber], order: ["📦", "Order", "#14b8a6"], communication: ["✉️", "Communication", C.muted] };

// Server-side search (search_hub) — returns at most 40 matches; never loads whole tables.
export default function Search({ onPick, autoFocus }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); return; }
    let live = true;
    setBusy(true);
    const t = setTimeout(() => {
      searchHub(term).then(({ data, error: e }) => {
        if (!live) return;
        setBusy(false);
        if (e) setError(e); else { setError(null); setResults(data || []); }
      });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  return (
    <div>
      <input autoFocus={autoFocus} style={{ ...inp, fontSize: 16, padding: "12px 14px" }} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search companies, contacts, emails, opportunities, products, tasks, notes…" aria-label="Search the hub" />
      <div style={{ fontSize: 11, color: C.faint, margin: "6px 0 14px" }}>{busy ? "Searching…" : q.trim().length < 2 ? "Type at least 2 characters" : results ? `${results.length}${results.length >= 40 ? "+" : ""} result${results.length === 1 ? "" : "s"}` : ""}</div>
      {error && <Banner>{error}</Banner>}
      {results && results.length === 0 && <Empty icon="🔍">Nothing matches "{q.trim()}". Try a contact's surname, an email domain or a PO number.</Empty>}
      {results && results.map((r) => {
        const [icon, label, color] = KIND[r.kind] || ["•", r.kind, C.dim];
        return (
          <Card key={r.kind + r.id} onClick={() => onPick(r.kind, r.id)} accent={color} style={{ opacity: r.archived ? 0.55 : 1 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span>{icon}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || "(untitled)"}</span>
              <Pill color={color}>{label}</Pill>
              {r.archived && <Pill>archived</Pill>}
            </div>
            {r.subtitle && <div style={{ fontSize: 12, color: C.dim, marginTop: 3, marginLeft: 26 }}>{r.subtitle}</div>}
          </Card>
        );
      })}
    </div>
  );
}
