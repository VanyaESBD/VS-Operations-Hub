// Shared UI for the CRM screens — matches the existing hub's dark theme.
import { createContext, useContext, useId, isValidElement, cloneElement, Children } from "react";
import { DEFAULT_USER } from "../lib/config";

export const UserContext = createContext({ name: DEFAULT_USER, role: null, signOut: null });
export const useHubUser = () => useContext(UserContext);

export const C = {
  bg: "#0a2432", panel: "#0b2735", card: "#0e2d3e", input: "#10364a", line: "#1b4a60", lineSoft: "#10364a",
  text: "#e2e8f0", muted: "#9ca3af", dim: "#7f93a1", faint: "#6a8090", accent: "#118fb5",
  red: "#ef4444", redBg: "#7f1d1d", amber: "#f59e0b", green: "#10b981", violet: "#8b5cf6",
};
export const inp = { background: C.input, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };
export const btn = (kind = "primary") => ({
  primary: { padding: "9px 18px", background: C.accent, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 },
  ghost: { padding: "9px 16px", background: "none", border: `1px solid ${C.line}`, borderRadius: 8, color: C.dim, cursor: "pointer", fontSize: 13 },
  danger: { padding: "7px 14px", background: "none", border: `1px solid ${C.redBg}`, borderRadius: 8, color: C.red, cursor: "pointer", fontSize: 12 },
  small: { padding: "5px 10px", background: C.input, border: `1px solid ${C.line}`, borderRadius: 7, color: C.muted, cursor: "pointer", fontSize: 12 },
}[kind]);

export function Modal({ children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,20,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 24, maxWidth: wide ? 980 : 740, width: "95vw", maxHeight: "92vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, onClose, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text, flex: 1, minWidth: 0 }}>{title}</h2>
      {children}
      <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 20 }}>✕</button>
    </div>
  );
}

export function Field({ label, required, error, hint, children, span }) {
  // Link the visible label to its control (screen readers, and tests can find fields by label).
  // The first element child is the control (later children are error/hint lines).
  const autoId = useId();
  const kids = Children.toArray(children);
  const idx = kids.findIndex((k) => isValidElement(k));
  const first = idx >= 0 ? kids[idx] : null;
  const id = first ? first.props.id || autoId : undefined;
  const control = first && !first.props.id ? kids.map((k, i) => (i === idx ? cloneElement(k, { id }) : k)) : children;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: span ? "1/-1" : undefined }}>
      <label htmlFor={id} style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: C.dim, textTransform: "uppercase" }}>
        {label}{required && <span aria-hidden="true" style={{ color: C.red, marginLeft: 3 }}>*</span>}
      </label>
      {control}
      {error && <div style={{ fontSize: 11, color: "#fca5a5" }}>{error}</div>}
      {!error && hint && <div style={{ fontSize: 11, color: C.faint }}>{hint}</div>}
    </div>
  );
}

export const Grid = ({ children, cols = 2 }) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${cols === 3 ? 180 : 240}px, 1fr))`, gap: 14 }}>{children}</div>
);

export function Pill({ children, color = C.dim, solid, title }) {
  return <span title={title} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: solid ? color : color + "26", color: solid ? "#fff" : color, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
}

export function Banner({ kind = "error", children, onClose }) {
  const col = kind === "error" ? C.red : kind === "warn" ? C.amber : C.green;
  return (
    <div role={kind === "error" ? "alert" : "status"} style={{ background: col + "1a", border: `1px solid ${col}66`, color: kind === "error" ? "#fca5a5" : kind === "warn" ? "#fde68a" : "#a7f3d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>{children}</div>
      {onClose && <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>}
    </div>
  );
}

export function SectionTitle({ children, right, color = C.dim }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 10px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.08em", textTransform: "uppercase", flex: 1 }}>{children}</div>
      {right}
    </div>
  );
}

export function Empty({ icon = "◌", children }) {
  return <div style={{ textAlign: "center", padding: "28px 0", color: "#557080", fontSize: 13 }}><div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>{children}</div>;
}

export function Card({ children, onClick, accent, style }) {
  return (
    <div onClick={onClick} style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: accent ? `3px solid ${accent}` : undefined, borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: onClick ? "pointer" : "default", ...style }}>
      {children}
    </div>
  );
}

export const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

// Searchable picker for companies / opportunities / contacts.
export function Picker({ id, value, options, onChange, placeholder = "Search…", allowNone = true, noneLabel = "— None" }) {
  const selected = options.find((o) => String(o.value) === String(value));
  return (
    <select id={id} style={inp} value={selected ? String(selected.value) : ""} onChange={(e) => onChange(e.target.value ? options.find((o) => String(o.value) === e.target.value)?.value ?? null : null)} aria-label={id ? undefined : placeholder}>
      {allowNone && <option value="">{noneLabel}</option>}
      {options.map((o) => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
    </select>
  );
}

export function useIsMobile() {
  return typeof window !== "undefined" && window.innerWidth < 760;
}

// Outlook-style tag: dark fill, light outline + text — same look as Vanya's email categories.
export function Tag({ fill, ink, children, title, small }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: small ? 10 : 11, padding: small ? "1px 7px" : "2px 8px", borderRadius: 99,
      background: fill, color: ink, border: `1px solid ${ink}`, fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1.5 }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 2, background: ink, transform: "rotate(45deg)" }} />{children}
    </span>
  );
}
