import { CATEGORIES, CATEGORY_NAMES, isPrivateCategory, normaliseCategory, STATE_STYLE, isDelegated, ownerLabel } from "./categories";
import { isDueNowTask, isDueNowLead, ago, addDays, todayISO } from "./hub";
import { summariseContacts } from "./data";

jest.mock("../supabase", () => ({ supabase: {} }));

test("Outlook categories: personal ones are private, work ones are not", () => {
  ["Medical", "Family Time", "Personal $", "Personal Time", "OoO"].forEach((c) => expect(isPrivateCategory(c)).toBe(true));
  ["Finance", "HR", "Operations", "Sales", "Client relations"].forEach((c) => expect(isPrivateCategory(c)).toBe(false));
});
test("Outlook spellings map onto hub categories; unknown ones don't invent a category", () => {
  expect(normaliseCategory("sales")).toBe("Sales");
  expect(normaliseCategory("Sales&Marketing")).toBe("Sales & Marketing");
  expect(normaliseCategory("Finance")).toBe("Finance");
  expect(normaliseCategory("Made up")).toBeNull();
  expect(normaliseCategory(null)).toBeNull();
});
test("every category and action state has a fill and a readable ink colour", () => {
  for (const c of CATEGORY_NAMES) { expect(CATEGORIES[c].fill).toMatch(/^#[0-9a-f]{6}$/i); expect(CATEGORIES[c].ink).toMatch(/^#[0-9a-f]{6}$/i); }
  expect(STATE_STYLE["Our action"].tag).toBe("FYA");
  expect(STATE_STYLE["Awaiting response"].tag).toBe("FlwUP");
  expect(STATE_STYLE["Monitoring"].tag).toBe("FYI");
});
test("Andrea and Jason show as delegated; Sean and Vanya don't", () => {
  expect(isDelegated("Andrea")).toBe(true);
  expect(isDelegated("Jason")).toBe(true);
  expect(isDelegated("Sean")).toBe(false);
  expect(isDelegated("Vanya")).toBe(false);
  expect(ownerLabel("Andrea")).toBe("Andrea · delegated");
});

const T = todayISO();
test("Today = overdue + due today, using the follow-up date for items waiting on a reply", () => {
  expect(isDueNowTask({ action_state: "Our action", expected_date: addDays(T, -3) })).toBe(true);
  expect(isDueNowTask({ action_state: "Our action", expected_date: T })).toBe(true);
  expect(isDueNowTask({ action_state: "Our action", expected_date: addDays(T, 2) })).toBe(false);
  // waiting: due date is irrelevant, the follow-up date decides
  expect(isDueNowTask({ action_state: "Awaiting response", expected_date: addDays(T, -10), follow_up_date: addDays(T, 3) })).toBe(false);
  expect(isDueNowTask({ action_state: "Awaiting response", follow_up_date: T })).toBe(true);
  // completed and archived never show
  expect(isDueNowTask({ action_state: "Completed", expected_date: addDays(T, -3) })).toBe(false);
  expect(isDueNowTask({ action_state: "Our action", expected_date: T, archived_at: "2026-10-01" })).toBe(false);
  // opportunity follow-ups too
  expect(isDueNowLead({ pipeline_stage: "Proposal / Quotation", follow_up_date: T })).toBe(true);
  expect(isDueNowLead({ pipeline_stage: "Won", follow_up_date: T })).toBe(false);
});
test("contact summary: last contact, direction, and number of chases per task", () => {
  const s = summariseContacts([
    { task_id: 1, occurred_at: "2026-10-12T09:00:00Z", type: "Follow-up", direction: "Outbound" },
    { task_id: 1, occurred_at: "2026-10-08T09:00:00Z", type: "Follow-up", direction: "Outbound" },
    { task_id: 1, occurred_at: "2026-10-05T09:00:00Z", type: "Email", direction: "Outbound" },
    { task_id: 2, occurred_at: "2026-10-11T09:00:00Z", type: "Email", direction: "Inbound" },
  ]);
  expect(s[1]).toEqual({ last: "2026-10-12T09:00:00Z", lastDir: "Outbound", chases: 2 });
  expect(s[2]).toEqual({ last: "2026-10-11T09:00:00Z", lastDir: "Inbound", chases: 0 });
});
test("'ago' reads naturally", () => {
  expect(ago(T)).toBe("today");
  expect(ago(addDays(T, -1))).toBe("yesterday");
  expect(ago(addDays(T, -3))).toBe("3 days ago");
});
