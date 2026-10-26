import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { makeSupabaseMock } from "../testUtils/supabaseMock";
import { todayISO, addDays } from "../lib/hub";

const T = todayISO();
const mock = makeSupabaseMock({});
jest.mock("../supabase", () => ({ get supabase() { return mock.client; } }));
// Login flag is read through the config module; tests switch it via global.__HUB_AUTH.
jest.mock("../lib/config", () => ({ __esModule: true, get AUTH_ENABLED() { return global.__HUB_AUTH === true; }, DEFAULT_USER: "Vanya" }));

const companies = [{ id: 1, name: "UPD (Clicks Group)", relationship_types: ["client"], status: "Active", aliases: ["Upd"] }];
const leads = [
  { id: 10, name: "UPD March 2027 renewal", company: "UPD (Clicks Group)", company_id: 1, pipeline_stage: "Proposal / Quotation", owner: "Sean", next_action: "Prepare proposal", follow_up_date: T, value_amount: 100000, currency: "ZAR", created_at: "2026-10-01" },
  { id: 11, name: "Acino quote", pipeline_stage: "Proposal / Quotation", owner: "Sean", currency: "EUR", value_amount: 5000, next_action: "Await reply", follow_up_date: addDays(T, 20), created_at: "2026-10-01" },
  { id: 12, name: "Discovery DMS-JHB-5", pipeline_stage: "Won", value_amount: 51720, currency: "ZAR", value_basis: "per month", created_at: "2026-08-01" },
  { id: 13, name: "Avio", pipeline_stage: "On Hold / Nurture", review_date: addDays(T, 3), hold_reason: "Their project", next_action: "They'll contact us", created_at: "2026-03-01" },
];
const tasks = [
  { id: 1, subject: "Approve UPD quotation", owner: "Sean", action_state: "Our action", status: "FYA", expected_date: addDays(T, -2), priority: "High", next_action: "Approve" },
  { id: 2, subject: "Supplier delivery update", owner: "Vanya", action_state: "Awaiting response", status: "Follow Up", waiting_on: "CIMC", follow_up_date: T },
  { id: 3, subject: "Vanya prepared the quote", owner: "Vanya", action_state: "Completed", status: "Done", completed_at: "2026-10-10T08:00:00Z", expected_date: addDays(T, -10) },
  { id: 4, subject: "Monitor supplier confirmation", owner: "Sean", action_state: "Monitoring", status: "FYI", follow_up_date: addDays(T, 5) },
  { id: 5, subject: "Andrea Medipost email", owner: "Andrea", action_state: "Our action", status: "To Do", expected_date: addDays(T, 4) },
];

describe("login is off by default", () => {
  test("AuthGate renders the app untouched when REACT_APP_AUTH_ENABLED is not 'true'", () => {
    const AuthGate = require("../AuthGate").default;
    render(<AuthGate><div>the hub</div></AuthGate>);
    expect(screen.getByText("the hub")).toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
  });
  test("with the flag on, a signed-out visitor sees only the login form — no data", async () => {
    // Flip the flag through the config module (one React instance; no module isolation).
    global.__HUB_AUTH = true;
    const Gate = require("../AuthGate").default;
    render(<Gate><div>secret data</div></Gate>);
    expect(await screen.findByText("Sign in to continue")).toBeInTheDocument();
    expect(screen.queryByText("secret data")).not.toBeInTheDocument();
    global.__HUB_AUTH = false;
  });
});

describe("follow-up views", () => {
  const FollowUps = require("../hub/FollowUps").default;
  const renderView = (view) => render(<FollowUps initialView={view} tasks={tasks} opportunities={leads} companies={companies} onOpenTask={() => {}} onOpenOpportunity={() => {}} onChanged={() => {}} />);

  test("Sean's view lists only Sean's open items — not work Vanya prepared or completed", () => {
    renderView("sean");
    expect(screen.getByText("Approve UPD quotation")).toBeInTheDocument();
    expect(screen.queryByText("Vanya prepared the quote")).not.toBeInTheDocument();
    expect(screen.queryByText("Supplier delivery update")).not.toBeInTheDocument();
    expect(screen.queryByText("Andrea Medipost email")).not.toBeInTheDocument();
  });
  test("Overdue shows the overdue approval; completed work never appears as overdue", () => {
    renderView("overdue");
    expect(screen.getByText("Approve UPD quotation")).toBeInTheDocument();
    expect(screen.queryByText("Vanya prepared the quote")).not.toBeInTheDocument();
  });
  test("Awaiting response: supplier item whose follow-up date has arrived is marked 'chase now'", () => {
    renderView("awaiting");
    const card = screen.getByText("Supplier delivery update").closest("div[style]").parentElement.parentElement;
    expect(within(card).getByText("chase now")).toBeInTheDocument();
  });
  test("Team view shows delegated work; Completed view keeps history", () => {
    renderView("team");
    expect(screen.getByText("Andrea Medipost email")).toBeInTheDocument();
  });
  test("Completed view", () => {
    renderView("completed");
    expect(screen.getByText("Vanya prepared the quote")).toBeInTheDocument();
  });
  test("Opportunity follow-ups appear next to tasks", () => {
    renderView("today");
    // The opportunity's name may appear twice (title + link); it must be there at least once.
    expect(screen.getAllByText("UPD March 2027 renewal").length).toBeGreaterThan(0);
    expect(screen.getByText("Supplier delivery update")).toBeInTheDocument();
  });
});

describe("pipeline", () => {
  const Pipeline = require("../hub/Pipeline").default;
  test("active stages shown; Won/Lost hidden until asked; totals per currency, never mixed", () => {
    render(<Pipeline opportunities={leads} companies={companies} contacts={[]} tasks={tasks} onChanged={() => {}} onOpenTask={() => {}} onNewTask={() => {}} />);
    expect(screen.getByText("On Hold / Nurture")).toBeInTheDocument();
    expect(screen.queryByText("Discovery DMS-JHB-5")).not.toBeInTheDocument();
    expect(screen.getByText("Avio")).toBeInTheDocument(); // on hold is kept, not dropped
    // Totals: one figure per currency, never converted or added together.
    const totals = screen.getByTestId("pipeline-totals");
    const figures = within(totals).getAllByText(/^(ZAR|EUR) /).map((el) => el.textContent.replace(/\s+/g, " ").trim());
    expect(figures).toEqual(expect.arrayContaining(["ZAR 100 000", "EUR 5 000"]));
    expect(figures).toHaveLength(2);
    expect(totals.textContent).not.toMatch(/105 000/);
    fireEvent.click(screen.getByLabelText(/Show Won/));
    expect(screen.getByText("Discovery DMS-JHB-5")).toBeInTheDocument();
  });
  test("marking an opportunity Lost requires a reason before anything is saved", async () => {
    const { OpportunityModal } = require("../hub/Pipeline");
    mock.calls.length = 0;
    render(<OpportunityModal opp={{ ...leads[0], pipeline_stage: "Lost" }} companies={companies} contacts={[]} tasks={tasks} onClose={() => {}} onSaved={() => {}} onOpenTask={() => {}} onNewTask={() => {}} />);
    fireEvent.click(screen.getByText("Save changes"));
    expect(await screen.findByText("Record why it was lost.")).toBeInTheDocument();
    expect(mock.calls.filter((c) => c.table === "leads")).toHaveLength(0);
  });
  test("a value without a currency is refused", async () => {
    const { OpportunityModal } = require("../hub/Pipeline");
    mock.calls.length = 0;
    render(<OpportunityModal opp={{ name: "New", pipeline_stage: "New Lead", value_amount: "1000" }} companies={companies} contacts={[]} tasks={[]} onClose={() => {}} onSaved={() => {}} onOpenTask={() => {}} onNewTask={() => {}} />);
    fireEvent.click(screen.getByText("Create opportunity"));
    expect(await screen.findByText("Choose a currency for this value.")).toBeInTheDocument();
    expect(mock.calls).toHaveLength(0);
  });
  test("saving a valid opportunity writes the 9-stage value and the matching legacy stage", async () => {
    const { OpportunityModal } = require("../hub/Pipeline");
    mock.calls.length = 0;
    const onSaved = jest.fn();
    render(<OpportunityModal opp={{ name: "Thrutainers", pipeline_stage: "Discussion / Discovery", owner: "Sean", next_action: "Send doc" }} companies={companies} contacts={[]} tasks={[]} onClose={() => {}} onSaved={onSaved} onOpenTask={() => {}} onNewTask={() => {}} />);
    fireEvent.click(screen.getByText("Create opportunity"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const ins = mock.calls.find((c) => c.table === "leads" && c.op === "insert");
    expect(ins.payload[0]).toMatchObject({ name: "Thrutainers", pipeline_stage: "Discussion / Discovery", stage: "Warm", updated_by: "Vanya" });
  });
});

describe("companies", () => {
  const { CompanyForm } = require("../hub/Companies");
  test("an exact duplicate company name is blocked; nothing is written", async () => {
    mock.calls.length = 0;
    render(<CompanyForm company={{ name: "upd (clicks group)", relationship_types: [] }} all={companies} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(mock.calls).toHaveLength(0);
  });
});

describe("dashboard", () => {
  const HubDashboard = require("../hub/HubDashboard").default;
  test("slim dashboard: 4 tiles with correct counts; a late order says 'target passed', never delivered; activity hidden until asked", () => {
    render(<HubDashboard tasks={tasks} opportunities={leads} companies={companies} orders={[{ id: 1, name: "PO29364", target_date: addDays(T, -1), customer_confirmed: true }]} go={() => {}} openTask={() => {}} openOpp={() => {}} openOrder={() => {}} />);
    expect(within(screen.getByText("Overdue").parentElement).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByText("Due today").parentElement).getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/target passed/)).toBeInTheDocument();
    expect(screen.queryByText("Sean to action")).not.toBeInTheDocument();
    expect(screen.queryByText(/Commercial value/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show recent activity/ })).toBeInTheDocument();
  });
});

describe("logging a communication", () => {
  const CommLog = require("../hub/CommLog").default;
  test("an outbound email creates an 'Awaiting response' follow-up — it does not complete anything", async () => {
    mock.calls.length = 0;
    const onSaved = jest.fn();
    render(<CommLog initial={{ company_id: 1, opportunity_id: 10, subject: "Quotation sent" }} companies={companies} contacts={[]} opportunities={leads} tasks={tasks} onClose={() => {}} onSaved={onSaved} />);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const comm = mock.calls.find((c) => c.table === "interactions" && c.op === "insert");
    expect(comm.payload[0]).toMatchObject({ type: "Email", direction: "Outbound", company_id: 1, opportunity_id: 10, subject: "Quotation sent" });
    const task = mock.calls.find((c) => c.table === "tasks" && c.op === "insert");
    expect(task.payload[0]).toMatchObject({ action_state: "Awaiting response", status: "Follow Up", opportunity_id: 10 });
    expect(task.payload[0].follow_up_date).toBeTruthy();
    expect(mock.calls.some((c) => c.table === "tasks" && c.op === "update")).toBe(false);
  });
});

describe("search", () => {
  const Search = require("../hub/Search").default;
  test("searches on the server, at least 2 characters, and shows an empty state", async () => {
    mock.calls.length = 0;
    render(<Search onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText("Search the hub"), { target: { value: "x" } });
    expect(screen.getByText("Type at least 2 characters")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search the hub"), { target: { value: "Kerr" } });
    expect(await screen.findByText(/Nothing matches "Kerr"/)).toBeInTheDocument();
    expect(mock.calls.find((c) => c.rpc === "search_hub").args).toMatchObject({ q: "Kerr" });
  });
});

describe("Today view (Vanya's follow-up workflow)", () => {
  const FollowUps = require("../hub/FollowUps").default;
  const dated = [
    { id: 21, subject: "Later this week", owner: "Vanya", action_state: "Our action", status: "To Do", expected_date: addDays(T, 3), category: "Finance" },
    { id: 22, subject: "Chase Emily", owner: "Vanya", action_state: "Awaiting response", status: "Follow Up", follow_up_date: T, waiting_on: "Emily", category: "Operations" },
    { id: 23, subject: "Very overdue", owner: "Sean", action_state: "Our action", status: "FYA", expected_date: addDays(T, -9), category: "Finance" },
    { id: 24, subject: "Slightly overdue", owner: "Vanya", action_state: "Our action", status: "To Do", expected_date: addDays(T, -1), category: "HR" },
    { id: 25, subject: "Not chased yet", owner: "Vanya", action_state: "Awaiting response", status: "Follow Up", expected_date: addDays(T, -20), follow_up_date: addDays(T, 5) },
  ];
  const renderToday = () => render(<FollowUps tasks={dated} opportunities={[]} companies={[]} onOpenTask={() => {}} onOpenOpportunity={() => {}} onChanged={() => {}} />);

  test("opens on Today: overdue + due today, earliest first, follow-ups mixed in with tasks", () => {
    renderToday();
    const titles = ["Very overdue", "Slightly overdue", "Chase Emily"];
    const pos = titles.map((t) => screen.getByText(t).compareDocumentPosition.bind(screen.getByText(t)));
    // order on screen matches date order
    expect(screen.getByText("Very overdue").compareDocumentPosition(screen.getByText("Slightly overdue")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Slightly overdue").compareDocumentPosition(screen.getByText("Chase Emily")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pos).toHaveLength(3);
    // not due yet → not in Today (even if its old due date has passed, the follow-up date decides)
    expect(screen.queryByText("Later this week")).not.toBeInTheDocument();
    expect(screen.queryByText("Not chased yet")).not.toBeInTheDocument();
  });
  test("'Everyone / Vanya / Sean' switch and category chips filter the list", () => {
    renderToday();
    fireEvent.click(screen.getByRole("button", { name: /^Sean/ }));
    expect(screen.getByText("Very overdue")).toBeInTheDocument();
    expect(screen.queryByText("Chase Emily")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Everyone" }));
    fireEvent.change(screen.getByLabelText("Area"), { target: { value: "HR" } });
    expect(screen.getByText("Slightly overdue")).toBeInTheDocument();
    expect(screen.queryByText("Very overdue")).not.toBeInTheDocument();
  });
  test("'Sent — follow up in 3d' logs the email and moves the task to waiting with the new date", async () => {
    mock.calls.length = 0;
    renderToday();
    const card = screen.getByText("Slightly overdue").closest("div[style]").parentElement.parentElement;
    fireEvent.click(within(card).getByRole("button", { name: /Sent — follow up/ }));
    fireEvent.click(within(card).getByRole("button", { name: "3d" }));
    await waitFor(() => expect(mock.calls.some((c) => c.table === "tasks" && c.op === "update")).toBe(true));
    const comm = mock.calls.find((c) => c.table === "interactions" && c.op === "insert");
    expect(comm.payload[0]).toMatchObject({ type: "Email", direction: "Outbound", task_id: 24 });
    const upd = mock.calls.find((c) => c.table === "tasks" && c.op === "update");
    expect(upd.payload).toMatchObject({ action_state: "Awaiting response", follow_up_date: addDays(T, 3) });
  });
  test("'No reply — chased' counts as a chase; 'Replied' makes it our move again (not done)", async () => {
    mock.calls.length = 0;
    renderToday();
    const card = screen.getByText("Chase Emily").closest("div[style]").parentElement.parentElement;
    fireEvent.click(within(card).getByRole("button", { name: /No reply — chased/ }));
    fireEvent.click(within(card).getByRole("button", { name: "1 wk" }));
    await waitFor(() => expect(mock.calls.some((c) => c.table === "tasks" && c.op === "update")).toBe(true));
    expect(mock.calls.find((c) => c.table === "interactions").payload[0].type).toBe("Follow-up");
    expect(mock.calls.find((c) => c.table === "tasks").payload.follow_up_date).toBe(addDays(T, 7));
    mock.calls.length = 0;
    fireEvent.click(within(card).getByRole("button", { name: /Replied/ }));
    await waitFor(() => expect(mock.calls.some((c) => c.table === "tasks" && c.op === "update")).toBe(true));
    const upd = mock.calls.find((c) => c.table === "tasks");
    expect(upd.payload).toMatchObject({ action_state: "Our action" });
    expect(upd.payload.action_state).not.toBe("Completed");
  });
});

describe("Tasks page — people tabs, Outlook tags, traffic lights", () => {
  const FollowUps = require("../hub/FollowUps").default;
  const rows = [
    { id: 31, subject: "Andrea: send Medipost pack", owner: "Andrea", action_state: "Our action", status: "To Do", expected_date: addDays(T, 1) },
    { id: 32, subject: "Siya: file invoices", owner: "Siya", action_state: "Our action", status: "To Do", expected_date: addDays(T, 6) },
    { id: 33, subject: "Waiting on CIMC price", owner: "Vanya", action_state: "Awaiting response", status: "Follow Up", follow_up_date: addDays(T, 2) },
    { id: 34, subject: "Untouched overdue", owner: "Sean", action_state: "Our action", status: "FYA", expected_date: addDays(T, -3), updated_by: "Import (Vanya-approved)", updated_at: addDays(T, -30) + "T08:00:00Z" },
    { id: 35, subject: "Touched overdue", owner: "Sean", action_state: "Our action", status: "FYA", expected_date: addDays(T, -3), updated_by: "Vanya", updated_at: addDays(T, -1) + "T08:00:00Z" },
  ];
  const renderAll = () => render(<FollowUps initialView="all" tasks={rows} opportunities={[]} companies={[]} onOpenTask={() => {}} onOpenOpportunity={() => {}} onChanged={() => {}} />);

  test("Andrea / Jason / Siya tabs show only their delegated work", () => {
    renderAll();
    fireEvent.click(screen.getByRole("button", { name: /^Andrea/ }));
    expect(screen.getByText("Andrea: send Medipost pack")).toBeInTheDocument();
    expect(screen.queryByText("Siya: file invoices")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Siya/ }));
    expect(screen.getByText("Siya: file invoices")).toBeInTheDocument();
    expect(screen.queryByText("Andrea: send Medipost pack")).not.toBeInTheDocument();
  });
  test("FlwUP tag filters to waiting items; 'FYI' replaces 'For information'", () => {
    renderAll();
    fireEvent.click(screen.getByRole("button", { name: "FlwUP" }));
    expect(screen.getByText("Waiting on CIMC price")).toBeInTheDocument();
    expect(screen.queryByText("Siya: file invoices")).not.toBeInTheDocument();
    expect(screen.queryByText(/For information/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^FYI/ })).toBeInTheDocument();
  });
  test("overdue and untouched glows; overdue but edited since does not", () => {
    renderAll();
    const glowing = document.querySelectorAll(".hub-glow");
    expect(glowing).toHaveLength(1);
    expect(within(glowing[0]).getByText("Untouched overdue")).toBeInTheDocument();
  });
});

describe("Quick list (under-5-minute tasks)", () => {
  const QuickList = require("../hub/QuickList").default;
  const qt = [
    { id: 41, subject: "Message Rajinder", owner: "Vanya", task_type: "Quick task", action_state: "Our action", status: "To Do", priority: "Medium", expected_date: T },
    { id: 42, subject: "Book flight to JHB", owner: "Sean", task_type: "Quick task", action_state: "Our action", status: "To Do", priority: "Urgent", expected_date: T },
    { id: 43, subject: "A normal big task", owner: "Vanya", task_type: "Quote", action_state: "Our action", status: "To Do", expected_date: T },
  ];
  const rem = [{ id: 1, title: "Renew licence", remind_date: T, owner: "Vanya", completed: false }];
  const renderQL = () => render(<QuickList tasks={qt} reminders={rem} onChanged={() => {}} onReminders={() => {}} onOpenTask={() => {}} goTasks={() => {}} />);

  test("shows only quick tasks, urgent first, plus diary reminders", () => {
    renderQL();
    expect(screen.queryByText("A normal big task")).not.toBeInTheDocument();
    expect(screen.getByText("Book flight to JHB").compareDocumentPosition(screen.getByText("Message Rajinder")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Renew licence")).toBeInTheDocument();
  });
  test("typing + Enter adds a quick task due today; ticking completes it", async () => {
    mock.calls.length = 0;
    renderQL();
    fireEvent.change(screen.getByLabelText("Quick task"), { target: { value: "Call Emily" } });
    fireEvent.submit(screen.getByLabelText("Quick task").closest("form"));
    await waitFor(() => expect(mock.calls.some((c) => c.table === "tasks" && c.op === "insert")).toBe(true));
    expect(mock.calls.find((c) => c.table === "tasks" && c.op === "insert").payload[0]).toMatchObject({ subject: "Call Emily", task_type: "Quick task", action_state: "Our action", expected_date: T, owner: "Vanya" });
    mock.calls.length = 0;
    fireEvent.click(screen.getByLabelText("Done: Message Rajinder"));
    await waitFor(() => expect(mock.calls.some((c) => c.table === "tasks" && c.op === "update")).toBe(true));
    expect(mock.calls.find((c) => c.table === "tasks" && c.op === "update").payload).toMatchObject({ action_state: "Completed" });
  });
});

describe("Projects live inside companies", () => {
  const Companies = require("../hub/Companies").default;
  const projects = [{ id: 7, name: "UPD", company_id: 1, owner: "Sean" }, { id: 8, name: "Old pilot", company_id: 1, archived_at: "2026-01-01T00:00:00Z" }];
  const ptasks = [{ id: 51, subject: "UPD project task (no company link)", owner: "Sean", action_state: "Our action", status: "To Do", project_id: 7, expected_date: addDays(T, 2) }];
  test("company shows its projects; a project's tasks count toward the company; + Project saves with company_id", async () => {
    mock.calls.length = 0;
    render(<Companies companies={companies} contacts={[]} opportunities={[]} tasks={ptasks} orders={[]} projects={projects} onChanged={() => {}} onOpenTask={() => {}} onOpenOpportunity={() => {}} onNewTask={() => {}} onLogComm={() => {}} />);
    expect(screen.getByText("1 project")).toBeInTheDocument();
    expect(screen.getByText("1 open tasks")).toBeInTheDocument();
    fireEvent.click(screen.getByText("UPD (Clicks Group)"));
    fireEvent.click(screen.getByRole("button", { name: "Projects (1)" }));
    expect(screen.queryByText(/Old pilot/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Project" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Cold-chain pilot 2027"), { target: { value: "Vaccine fridges" } });
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    await waitFor(() => expect(mock.calls.some((c) => c.table === "projects" && c.op === "insert")).toBe(true));
    expect(mock.calls.find((c) => c.table === "projects").payload[0]).toMatchObject({ name: "Vaccine fridges", company_id: 1, status: "Active" });
  });
});

describe("Done list is compact", () => {
  const FollowUps = require("../hub/FollowUps").default;
  test("completed items render as one-line rows, 30 at a time", () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ id: 600 + i, subject: `Finished ${i}`, owner: "Vanya", action_state: "Completed", status: "Done", completed_at: "2026-10-01T08:00:00Z" }));
    render(<FollowUps initialView="completed" tasks={many} opportunities={[]} companies={[]} onOpenTask={() => {}} onOpenOpportunity={() => {}} onChanged={() => {}} />);
    expect(screen.getAllByText(/^Finished \d+$/)).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: /Show 50 more/ }));
    expect(screen.getAllByText(/^Finished \d+$/)).toHaveLength(45);
    expect(screen.queryByRole("button", { name: "✓ Done" })).toBeNull();
  });
});

describe("Open questions — Sean to decide filter", () => {
  const FollowUps = require("../hub/FollowUps").default;
  const qs = [
    { id: 701, subject: "Kiwari via Firoz", owner: "Sean", action_state: "Our action", status: "FYA", needs_review: "Sean to decide: pursue Kiwari?" },
    { id: 702, subject: "CIMC balance check", owner: "Sean", action_state: "Our action", status: "FYA", needs_review: "Check records: has USD 4,187.27 been paid?" },
    { id: 703, subject: "No question here", owner: "Vanya", action_state: "Our action", status: "To Do" },
  ];
  test("dashboard link opens only Sean's decisions, and the question shows on the card", () => {
    render(<FollowUps initialView="decide" tasks={qs} opportunities={[]} companies={[]} onOpenTask={() => {}} onOpenOpportunity={() => {}} onChanged={() => {}} />);
    expect(screen.getByText("Kiwari via Firoz")).toBeInTheDocument();
    expect(screen.getByText(/pursue Kiwari\?/)).toBeInTheDocument();
    expect(screen.queryByText("CIMC balance check")).not.toBeInTheDocument();
    expect(screen.queryByText("No question here")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Questions"), { target: { value: "any" } });
    expect(screen.getByText("CIMC balance check")).toBeInTheDocument();
  });
});

describe("Quick list shows only your own items (except for Vanya, who runs the diary)", () => {
  const QuickList = require("../hub/QuickList").default;
  const { UserContext } = require("../hub/ui");
  const items = [
    { id: 801, subject: "Receive tile delivery", owner: "Vanya", task_type: "Quick task", action_state: "Our action", status: "To Do", expected_date: T },
    { id: 802, subject: "Call Kerr back", owner: "Sean", task_type: "Quick task", action_state: "Our action", status: "FYA", expected_date: T },
  ];
  const rem = [{ id: 9, title: "Vanya dentist", remind_date: T, owner: "Vanya", completed: false }, { id: 10, title: "Sean golf day", remind_date: T, owner: "Sean", completed: false }];
  const renderAs = (name, role) => render(<UserContext.Provider value={{ name, role, signOut: null }}><QuickList tasks={items} reminders={rem} onChanged={() => {}} onReminders={() => {}} onOpenTask={() => {}} goTasks={() => {}} /></UserContext.Provider>);
  test("Sean doesn't see Vanya's quick tasks or reminders", () => {
    renderAs("Sean", "manager");
    expect(screen.getByText("Call Kerr back")).toBeInTheDocument();
    expect(screen.getByText("Sean golf day")).toBeInTheDocument();
    expect(screen.queryByText("Receive tile delivery")).not.toBeInTheDocument();
    expect(screen.queryByText("Vanya dentist")).not.toBeInTheDocument();
  });
  test("Vanya sees everything by default", () => {
    renderAs("Vanya", "admin");
    expect(screen.getByText("Receive tile delivery")).toBeInTheDocument();
    expect(screen.getByText("Call Kerr back")).toBeInTheDocument();
  });
});

describe("Daily action list", () => {
  const { buildDailyActions, actionsToText } = require("../hub/DailyActions");
  const list = [
    { id: 901, subject: "Approve quote", owner: "Sean", action_state: "Our action", status: "FYA", expected_date: addDays(T, -2), next_action: "Approve the UPD quote" },
    { id: 902, subject: "CIMC price", owner: "Vanya", action_state: "Awaiting response", status: "Follow Up", follow_up_date: T, waiting_on: "Emily" },
    { id: 903, subject: "Later thing", owner: "Vanya", action_state: "Our action", status: "To Do", expected_date: addDays(T, 5) },
    { id: 904, subject: "Mandy loan", owner: "Sean", action_state: "Our action", status: "FYA", expected_date: T, visibility: "private" },
    { id: 905, subject: "Kiwari", owner: "Sean", action_state: "Our action", status: "FYA", needs_review: "Sean to decide: Pursue Kiwari?" },
    { id: 906, subject: "Monitor supplier", owner: "Andrea", action_state: "Monitoring", status: "FYI", follow_up_date: T },
  ];
  test("groups by person, splits FYA / chase / FYI / decide, skips future items and private by default", () => {
    const g = buildDailyActions({ tasks: list, today: T });
    const sean = g.find((x) => x.person === "Sean"), vanya = g.find((x) => x.person === "Vanya"), andrea = g.find((x) => x.person === "Andrea");
    expect(sean.fya.map((i) => i.text)).toEqual(["Approve quote"]);
    expect(sean.fya[0].ctx).toBe("→ Approve the UPD quote");
    expect(sean.decide.map((i) => i.text)).toEqual(["Pursue Kiwari?"]);
    expect(vanya.chase[0].text).toMatch(/^Chase Emily/);
    expect(vanya.fya).toHaveLength(0);
    expect(andrea.fyi).toHaveLength(1);
    const txt = actionsToText(g, T);
    expect(txt).toMatch(/2d overdue/);
    expect(txt).not.toMatch(/Mandy loan/);
    const withPrivate = buildDailyActions({ tasks: list, today: T, includePrivate: true });
    expect(withPrivate.find((x) => x.person === "Sean").fya).toHaveLength(2);
  });
});

describe("Today's Five", () => {
  const { pickFive, streakFor } = require("../hub/TodaysFive");
  const day = (n) => addDays(T, n);
  const base = { owner: "Vanya", action_state: "Our action", status: "To Do" };
  test("quick jobs first, then due quick-verb jobs, then other due jobs; nothing future or someone else's", () => {
    const tasks = [
      { ...base, id: 1, subject: "Big report", expected_date: day(-3) },
      { ...base, id: 2, subject: "x", next_action: "Send Eden the VAT amount", expected_date: day(-1) },
      { ...base, id: 3, subject: "Book flight", task_type: "Quick task", expected_date: T },
      { ...base, id: 4, subject: "Later", next_action: "Call Kerr", expected_date: day(3) },
      { ...base, id: 5, owner: "Sean", subject: "Sean's", task_type: "Quick task", expected_date: T },
    ];
    expect(pickFive(tasks, "Vanya", T).map((t) => t.id)).toEqual([3, 2, 1]);
  });
  test("streak counts weekdays in a row with 5+ jobs done", () => {
    const done = (d, n) => Array.from({ length: n }, (_, i) => ({ id: d + i, owner: "Vanya", action_state: "Completed", status: "Done", actual_date: d }));
    let d1 = day(-1); while ([0, 6].includes(new Date(d1 + "T00:00:00").getDay())) d1 = addDays(d1, -1);
    const s = streakFor([...done(d1, 5), ...done(T, 5)], "Vanya", T);
    expect(s.streak).toBe(2);
    expect(s.today).toBe(5);
  });
});
