import { useEffect, useState } from "react";
import { loadDataQuality } from "../lib/data";
import { C, SectionTitle, Card, Banner, Empty } from "./ui";

// Flags, never blocks: lists records with missing or inconsistent information.
export default function DataQuality({ onOpen }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { loadDataQuality().then(({ data, error: e }) => { if (e) setError(e); setRows(data || []); }); }, []);
  if (error) return <Banner>{error}</Banner>;
  if (!rows) return <div style={{ color: C.dim }}>Loading…</div>;
  if (!rows.length) return <Empty icon="✨">No data-quality issues found</Empty>;
  const groups = rows.reduce((m, r) => { (m[r.issue] = m[r.issue] || []).push(r); return m; }, {});
  return (
    <div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>These records can still be used — this list just makes the gaps visible so they get filled in.</div>
      {Object.entries(groups).map(([issue, list]) => (
        <div key={issue} style={{ marginBottom: 18 }}>
          <SectionTitle color="#fde68a">{issue} · {list.length}</SectionTitle>
          {list.slice(0, 50).map((r) => (
            <Card key={r.entity_type + r.entity_id + issue} onClick={() => onOpen(r.entity_type, r.entity_id)} accent={C.amber} style={{ padding: "8px 12px" }}>
              <span style={{ fontSize: 13, color: C.text }}>{r.title || "(untitled)"}</span> <span style={{ fontSize: 11, color: C.faint }}>· {r.entity_type} #{r.entity_id}</span>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
