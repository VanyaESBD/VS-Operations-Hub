// Colour system — matched to ESBD's brand and to Vanya's Outlook categories,
// so a task looks the same colour in the hub as the email it came from.
// Colours were sampled from Outlook's own tag icons: `fill` is the tag's body,
// `ink` its outline (the readable colour on the dark background).

// ---- ESBD brand (from the ESBD site) ----
export const BRAND = {
  bg: "#0a2432",      // deep teal-navy page background
  panel: "#0b2735",   // sidebar / panels
  card: "#0e2d3e",    // cards
  input: "#10364a",   // inputs
  line: "#1b4a60",    // borders
  lineSoft: "#143a4d",
  cyan: "#18b9dc",    // ESBD accent (headings, links, active)
  cyanSoft: "#5ccee8",// highlight / glow
  button: "#118fb5",  // solid buttons + accent text (readable both ways)
};

// ---- Area categories (one per task — "what is it about") ----
export const CATEGORIES = {
  "Client relations": { fill: "#00373a", ink: "#58ccd3" },
  "Finance":          { fill: "#063004", ink: "#5fc15a" },
  "HR":               { fill: "#002039", ink: "#8fb1cc" },
  "IT":               { fill: "#444241", ink: "#aca8a7" },
  "Marketing":        { fill: "#3a2f00", ink: "#ba990a" },
  "Operations":       { fill: "#43002b", ink: "#d091ba" },
  "Sales":            { fill: "#22330b", ink: "#a4cc6c" },
  "Sales & Marketing":{ fill: "#463100", ink: "#eaa300" },
  "Medical":          { fill: "#80215d", ink: "#f08ccb", private: true },
  "Family Time":      { fill: "#420610", ink: "#d098a0", private: true },
  "Personal $":       { fill: "#22330b", ink: "#a1c76c", private: true },
  "Personal Time":    { fill: "#7a2101", ink: "#f08a62", private: true },
  "OoO":              { fill: "#3f3682", ink: "#a59aeb", private: true },
};
export const CATEGORY_NAMES = Object.keys(CATEGORIES);
export const isPrivateCategory = (c) => !!CATEGORIES[c]?.private;
const ALIASES = { sales: "Sales", "Sales&Marketing": "Sales & Marketing", Personal: "Personal $" };
export const normaliseCategory = (c) => (c ? ALIASES[c] || (CATEGORIES[c] ? c : null) : null);

// ---- Action tags → what kind of item it is (drives where it shows) ----
// Outlook FYA / FlwUP / FYI / ! map onto the hub's action states and priority.
export const STATE_STYLE = {
  "Our action":        { tag: "FYA",   fill: "#5e2405", ink: "#c57f58", label: "Our action (FYA)" },
  "Awaiting response": { tag: "FlwUP", fill: "#3a3a3a", ink: "#a8a8a8", label: "Waiting for reply (FlwUP)" },
  "Monitoring":        { tag: "FYI",   fill: "#240f3c", ink: "#b39ecc", label: "For information (FYI)" },
  "On hold":           { tag: "Hold",  fill: "#3f3682", ink: "#a59aeb", label: "On hold" },
  "Completed":         { tag: "Done",  fill: "#0b3d4f", ink: "#5ccee8", label: "Completed" },
  "Cancelled":         { tag: "—",     fill: "#2e2e2e", ink: "#8a8a8a", label: "Cancelled" },
};
export const URGENT = { tag: "!", fill: "#420610", ink: "#d098a0" };

// ---- People tags ----
// Andrea (Dre) and Jason (J) no longer use the hub: their items show as Delegated.
export const ACTIVE_USERS = ["Vanya", "Sean"];
// They don't log in, but work is still assigned to and tracked for them.
export const DELEGATES = ["Andrea", "Jason"];
export const ASSIGNABLE = [...ACTIVE_USERS, ...DELEGATES, "Unassigned"];
export const isDelegated = (owner) => !!owner && !["Vanya", "Sean", "Unassigned", "You"].includes(owner);
export const ownerLabel = (owner) => (isDelegated(owner) ? `${owner} · delegated` : owner || "Unassigned");
