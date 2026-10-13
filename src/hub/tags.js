import { CATEGORIES, STATE_STYLE, URGENT, normaliseCategory, isDelegated } from "../lib/categories";
import { Tag } from "./ui";

export const CategoryTag = ({ category, small }) => {
  const c = normaliseCategory(category);
  return c ? <Tag small={small} fill={CATEGORIES[c].fill} ink={CATEGORIES[c].ink}>{c}</Tag> : null;
};
export const StateTag = ({ state, small }) => {
  const s = STATE_STYLE[state];
  return s ? <Tag small={small} fill={s.fill} ink={s.ink} title={s.label}>{s.tag === "Done" || s.tag === "Hold" || s.tag === "—" ? state : `${s.tag} · ${state === "Awaiting response" ? "waiting for reply" : state === "Monitoring" ? "info" : "action"}`}</Tag> : null;
};
export const UrgentTag = ({ priority, small }) => (priority === "Urgent" ? <Tag small={small} fill={URGENT.fill} ink={URGENT.ink} title="Urgent">! Urgent</Tag> : null);
export const DelegatedTag = ({ owner, small }) => (isDelegated(owner) ? <Tag small={small} fill="#1b4a60" ink="#9fc4d6" title="Doesn't use the hub — tracked on their behalf">Delegated · {owner}</Tag> : null);
