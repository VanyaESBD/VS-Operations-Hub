import {
  legacyToPipeline, pipelineToLegacy, statusToState, stateToStatus, stateOf, stageOf,
  dueBucket, actionDate, taskBucket, needsChasing, isQuiet, isActiveLead, leadFollowUp,
  formatMoney, pipelineTotals, possibleDuplicates, similarity,
  validateOpportunity, validateTask, validateCompany, validateMilestone, friendlyError, addDays,
} from "./hub";

const T = "2026-10-12";

describe("stage and status mappings mirror the database", () => {
  test("legacy lead stages map to the 9-stage pipeline", () => {
    expect(legacyToPipeline("Cold")).toBe("New Lead");
    expect(legacyToPipeline("Warm")).toBe("Qualified");
    expect(legacyToPipeline("Hot")).toBe("Proposal / Quotation");
    expect(legacyToPipeline("Negotiating")).toBe("Negotiation");
    expect(pipelineToLegacy("On Hold / Nurture")).toBe("Cold");
    expect(stageOf({ stage: "Hot" })).toBe("Proposal / Quotation");
    expect(stageOf({ stage: "Hot", pipeline_stage: "Won" })).toBe("Won");
  });
  test("legacy task statuses map to action states and back", () => {
    expect(statusToState("FYA")).toBe("Our action");
    expect(statusToState("Follow Up")).toBe("Awaiting response");
    expect(statusToState("FYI")).toBe("Monitoring");
    expect(statusToState("Done")).toBe("Completed");
    expect(stateToStatus("Our action", "FYA")).toBe("FYA");
    expect(stateToStatus("Our action", "Follow Up")).toBe("To Do");
    expect(stateToStatus("On hold", "Follow Up")).toBe("Follow Up");
    expect(stateOf({ status: "Follow Up" })).toBe("Awaiting response");
  });
});

describe("due buckets", () => {
  test("overdue / today / week / later / none", () => {
    expect(dueBucket("2026-10-11", T)).toBe("overdue");
    expect(dueBucket(T, T)).toBe("today");
    expect(dueBucket("2026-10-19", T)).toBe("week");
    expect(dueBucket("2026-10-20", T)).toBe("later");
    expect(dueBucket(null, T)).toBe("none");
  });
  test("awaiting tasks are timed by follow-up date, action tasks by due date", () => {
    expect(actionDate({ action_state: "Awaiting response", follow_up_date: "2026-10-16", expected_date: "2026-10-01" })).toBe("2026-10-16");
    expect(actionDate({ action_state: "Our action", follow_up_date: "2026-10-16", expected_date: "2026-10-01" })).toBe("2026-10-01");
  });
  test("completed and archived tasks are never overdue", () => {
    expect(taskBucket({ action_state: "Completed", expected_date: "2026-01-01" }, T)).toBe("closed");
    expect(taskBucket({ action_state: "Our action", expected_date: "2026-01-01", archived_at: "2026-10-01" }, T)).toBe("closed");
  });
});

describe("business scenarios", () => {
  test("F: waiting on a supplier becomes due for action when the follow-up date arrives", () => {
    const t = { action_state: "Awaiting response", waiting_on: "Supplier", follow_up_date: "2026-10-16" };
    expect(needsChasing(t, "2026-10-15")).toBe(false);
    expect(needsChasing(t, "2026-10-16")).toBe(true);
    expect(needsChasing(t, "2026-10-20")).toBe(true);
  });
  test("C: a quotation with no reply stays open and shows as gone quiet", () => {
    const l = { pipeline_stage: "Proposal / Quotation", created_at: "2026-09-01T10:00:00Z", last_interaction_at: "2026-09-10T10:00:00Z" };
    expect(isActiveLead(l)).toBe(true);
    expect(isQuiet(l, 21, T)).toBe(true);
  });
  test("D: on-hold opportunities are not 'quiet', not abandoned, and use their review date", () => {
    const l = { pipeline_stage: "On Hold / Nurture", review_date: "2026-11-01", follow_up_date: "2026-10-01", created_at: "2026-01-01" };
    expect(isActiveLead(l)).toBe(true);
    expect(isQuiet(l, 21, T)).toBe(false);
    expect(leadFollowUp(l)).toBe("2026-11-01");
  });
  test("G: won opportunities are kept but are no longer active pipeline", () => {
    expect(isActiveLead({ pipeline_stage: "Won" })).toBe(false);
  });
  test("E: approval for Sean is 'Our action' owned by Sean, not completed", () => {
    const t = { subject: "Approve quotation", owner: "Sean", action_state: "Our action", next_action: "Approve", expected_date: T };
    expect(validateTask(t).ok).toBe(true);
    expect(stateOf(t)).toBe("Our action");
  });
});

describe("money never mixes currencies", () => {
  test("format keeps currency and basis", () => {
    // en-ZA thousands separator varies by ICU build (space, nbsp or comma) — accept any.
    expect(formatMoney(51720, "ZAR", "per month")).toMatch(/^R 51[\s,  ]720 per month$/);
    expect(formatMoney(4187.27, "USD")).toMatch(/^USD 4[\s,  ]187[.,]27$/);
    expect(formatMoney(null, "USD")).toBeNull();
    expect(formatMoney("", "USD")).toBeNull();
  });
  test("totals grouped per currency and basis; won/lost/unpriced excluded", () => {
    const totals = pipelineTotals([
      { pipeline_stage: "Negotiation", value_amount: 100, currency: "ZAR" },
      { pipeline_stage: "Proposal / Quotation", value_amount: 50, currency: "ZAR" },
      { pipeline_stage: "Qualified", value_amount: 10, currency: "USD" },
      { pipeline_stage: "Won", value_amount: 999, currency: "ZAR" },
      { pipeline_stage: "Qualified", value_amount: 7, currency: null },
      { pipeline_stage: "Won", value_amount: 51720, currency: "ZAR", value_basis: "per month" },
      { pipeline_stage: "Qualified", value_amount: 1, currency: "ZAR", value_basis: "per month" },
    ]);
    expect(totals).toEqual({ ZAR: 150, USD: 10, "ZAR (per month)": 1 });
  });
});

describe("duplicates are flagged", () => {
  const companies = [{ id: 1, name: "Adcock Ingram" }, { id: 2, name: "UPD (Clicks Group)", aliases: ["Upd"] }, { id: 3, name: "Biovac" }];
  test("exact, alias and near-matches", () => {
    expect(possibleDuplicates("adcock  ingram", companies).map(c => c.id)).toEqual([1]);
    expect(possibleDuplicates("UPD", companies).map(c => c.id)).toEqual([2]);
    expect(possibleDuplicates("Adcock Ingram Ltd", companies).map(c => c.id)).toEqual([1]);
    expect(possibleDuplicates("Vac Bureau", companies)).toEqual([]);
    expect(similarity("Medipost", "Medilogistics")).toBeLessThan(0.6);
  });
  test("company validation blocks exact duplicates, warns on similar", () => {
    expect(validateCompany({ name: "Adcock Ingram" }, companies).ok).toBe(false);
    const v = validateCompany({ name: "Adcock Ingram Ltd" }, companies);
    expect(v.ok).toBe(true);
    expect(v.warnings.join(" ")).toMatch(/Adcock Ingram/);
    expect(validateCompany({ name: "X", email: "nope" }, []).errors.email).toBeTruthy();
  });
});

describe("validation allows incomplete leads but blocks invalid data", () => {
  test("a bare new lead is allowed, with warnings", () => {
    const v = validateOpportunity({ name: "Woolworths Dash" });
    expect(v.ok).toBe(true);
    expect(v.warnings.length).toBeGreaterThan(0);
  });
  test("value needs a currency and must be numeric", () => {
    expect(validateOpportunity({ name: "x", value_amount: "1000" }).errors.currency).toBeTruthy();
    expect(validateOpportunity({ name: "x", value_amount: "R1000", currency: "ZAR" }).errors.value_amount).toBeTruthy();
    expect(validateOpportunity({ name: "x", value_amount: "-5", currency: "ZAR" }).errors.value_amount).toBeTruthy();
    expect(validateOpportunity({ name: "x", value_amount: "51 720", currency: "ZAR" }).ok).toBe(true);
  });
  test("lost needs a reason; on hold warns without a review date", () => {
    expect(validateOpportunity({ name: "x", pipeline_stage: "Lost" }).ok).toBe(false);
    expect(validateOpportunity({ name: "x", pipeline_stage: "On Hold / Nurture" }).warnings.join()).toMatch(/review date/);
  });
  test("awaiting response needs a follow-up date", () => {
    expect(validateTask({ subject: "x", action_state: "Awaiting response" }).ok).toBe(false);
    expect(validateTask({ subject: "x", action_state: "Awaiting response", follow_up_date: "2026-10-16", waiting_on: "CIMC" }).ok).toBe(true);
  });
  test("invalid dates rejected", () => {
    expect(validateTask({ subject: "x", expected_date: "2026-13-40" }).ok).toBe(false);
  });
  test("a milestone can't be Done without a date or evidence (rule 7)", () => {
    expect(validateMilestone({ name: "Delivered", status: "Done" }).ok).toBe(false);
    expect(validateMilestone({ name: "Delivered", status: "Done", actual_date: "2026-10-30" }).ok).toBe(true);
    expect(validateMilestone({ name: "Delivered", status: "Target only", target_date: "2026-10-30" }).ok).toBe(true);
  });
});

test("friendly errors", () => {
  expect(friendlyError({ message: "Records in tasks are archived, not deleted." })).toMatch(/Archive/);
  expect(friendlyError({ message: 'duplicate key value violates unique constraint "companies_name_key_active_uq"' })).toMatch(/already exists/);
  expect(friendlyError({ message: "new row violates row-level security policy" })).toMatch(/permission/);
  expect(friendlyError(null)).toBeNull();
});

test("addDays crosses month ends", () => {
  expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
});
