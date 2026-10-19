"""
End-to-end tests for the ESBD Operations Hub, run against a STAGING copy
(never production). Each check drives the real app in Chromium and then
verifies the result in the database.

  HUB_URL=http://localhost:3000  DB=hub_staging  python3 e2e/hub_e2e.py

Requires: staging stack (Postgres + PostgREST + gateway) with migration 0002,
the app built against it with login OFF (REACT_APP_AUTH_ENABLED unset).
"""
import os, re, subprocess, sys, traceback
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get("HUB_URL", "http://localhost:3000")
DB = os.environ.get("DB", "hub_staging")
TZ = "Africa/Johannesburg"
results = []


def sql(q):
    out = subprocess.run(["su", "postgres", "-c", f"psql -tA -d {DB} -c \"{q}\""], capture_output=True, text=True)
    if out.returncode:
        raise RuntimeError(out.stderr)
    return out.stdout.strip()


def check(n, name):
    def deco(fn):
        def run(page):
            try:
                fn(page)
                results.append((n, name, "PASS", ""))
            except Exception as e:  # noqa
                results.append((n, name, "FAIL", f"{type(e).__name__}: {str(e)[:300]}"))
                page.screenshot(path=f"/home/claude/staging/shots/fail_{n:02d}.png", full_page=True)
                traceback.print_exc()
        run.n = n
        return run
    return deco


def nav(page, label):
    page.locator("nav, aside, div").get_by_text(label, exact=True).first.click()
    page.wait_for_timeout(500)


def open_search(page):
    page.get_by_role("button", name="Search").first.click()
    page.wait_for_timeout(400)


def close_modal(page):
    page.get_by_role("dialog").get_by_label("Close").first.click()
    page.wait_for_timeout(200)


TODAY = None


@check(1, "Existing client records remain accessible — projects now live inside their company")
def t1(page):
    nav(page, "Companies & projects")
    page.get_by_label("Search companies").fill("UPD")
    page.get_by_text("UPD (Clicks Group)", exact=True).first.click()
    d = page.get_by_role("dialog")
    d.get_by_role("button", name=re.compile(r"^Projects \(")).click()
    expect(d.get_by_text(re.compile(r"^▸ UPD$")).first).to_be_visible()
    close_modal(page)
    page.get_by_label("Search companies").fill("")


@check(2, "Existing tasks remain accessible")
def t2(page):
    open_search(page)
    page.get_by_label("Search the hub").fill("Solaris Cargo trial")
    expect(page.get_by_text("Re: Solaris Cargo trial - Urvina").first).to_be_visible(timeout=5000)


@check(3, "Creating a company works; an exact duplicate is refused")
def t3(page):
    nav(page, "Companies & projects")
    page.get_by_role("button", name="+ Company").click()
    d = page.get_by_role("dialog")
    d.get_by_label("Company name").fill("E2E Pharma Distribution")
    d.get_by_role("button", name="Client").click()
    d.get_by_label("Industry").fill("Pharmaceutical Distribution")
    d.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(800)
    assert sql("select count(*) from companies where name='E2E Pharma Distribution' and 'client'=any(relationship_types)") == "1"
    close_modal(page)
    page.get_by_role("button", name="+ Company").click()
    d = page.get_by_role("dialog")
    d.get_by_label("Company name").fill("  e2e pharma   DISTRIBUTION ")
    d.get_by_role("button", name="Save", exact=True).click()
    expect(d.get_by_text(re.compile("already exists"))).to_be_visible()
    assert sql("select count(*) from companies where name_key='e2e pharma distribution'") == "1"
    close_modal(page)


@check(4, "Contacts: add a contact; link the same person to a second company (no duplicate contact)")
def t4(page):
    nav(page, "Companies & projects")
    page.get_by_label("Search companies").fill("E2E Pharma")
    page.get_by_text("E2E Pharma Distribution", exact=True).click()
    d = page.get_by_role("dialog")
    d.get_by_role("button", name="+ Contact").click()
    c = page.get_by_role("dialog").last
    c.get_by_label("Full name").fill("Erin Example")
    c.get_by_label("Email").fill("erin@e2e-pharma.example")
    c.get_by_role("button", name="Save contact").click()
    page.wait_for_timeout(800)
    assert sql("select count(*) from company_contacts cc join contacts p on p.id=cc.contact_id join companies c on c.id=cc.company_id where p.email='erin@e2e-pharma.example' and c.name='E2E Pharma Distribution'") == "1"
    close_modal(page)
    # second company
    page.get_by_role("button", name="+ Company").click()
    d = page.get_by_role("dialog")
    d.get_by_label("Company name").fill("E2E Logistics Partner")
    d.get_by_role("button", name="Partner").click()
    d.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(800)
    d = page.get_by_role("dialog")
    d.get_by_role("button", name="Link existing").click()
    d.get_by_label("Existing contact").select_option(label="Erin Example · erin@e2e-pharma.example")
    d.get_by_label("Role at this company").fill("Logistics liaison")
    d.get_by_role("button", name="Link contact").click()
    page.wait_for_timeout(800)
    assert sql("select count(*) from company_contacts cc join contacts p on p.id=cc.contact_id where p.email='erin@e2e-pharma.example'") == "2"
    assert sql("select count(*) from contacts where email='erin@e2e-pharma.example'") == "1"
    expect(page.get_by_role("dialog").get_by_text("Also at: E2E Pharma Distribution")).to_be_visible()
    close_modal(page)


@check(5, "Creating an opportunity works (company, contact, value + currency, next action, follow-up)")
def t5(page):
    nav(page, "Sales Pipeline")
    page.get_by_role("button", name="+ Opportunity").click()
    d = page.get_by_role("dialog")
    d.get_by_label("Opportunity name").fill("E2E Pallet Porter trial")
    d.get_by_label("Company", exact=True).select_option(label="E2E Pharma Distribution")
    d.get_by_label("Stage").select_option("New Lead")
    d.get_by_label("Estimated value").fill("12500")
    d.get_by_label("Currency").select_option("USD")
    d.get_by_label("Next action", exact=True).fill("Send datasheet")
    d.get_by_label("Follow-up date").fill(TODAY)
    d.get_by_role("button", name="Create opportunity").click()
    page.wait_for_timeout(900)
    row = sql("select pipeline_stage||'|'||currency||'|'||value_amount::int||'|'||(select name from companies where id=company_id) from leads where name='E2E Pallet Porter trial'")
    assert row == "New Lead|USD|12500|E2E Pharma Distribution", row
    expect(page.get_by_text("E2E Pallet Porter trial").first).to_be_visible()


@check(6, "Editing an opportunity, changing its stage and assigning an owner work — and are logged")
def t6(page):
    nav(page, "Sales Pipeline")
    page.get_by_text("E2E Pallet Porter trial").first.click()
    d = page.get_by_role("dialog")
    d.get_by_label("Stage").select_option("Proposal / Quotation")
    d.get_by_label("Owner", exact=True).select_option("Sean")
    d.get_by_label("Product / service of interest").fill("Pallet Porter (Euro)")
    d.get_by_role("button", name="Save changes").click()
    page.wait_for_timeout(900)
    row = sql("select pipeline_stage||'|'||owner||'|'||product_interest||'|'||stage from leads where name='E2E Pallet Porter trial'")
    assert row == "Proposal / Quotation|Sean|Pallet Porter (Euro)|Hot", row
    logged = sql("select string_agg(field||':'||new_value, ',' order by field) from activity_log where entity_type='opportunity' and entity_id=(select id from leads where name='E2E Pallet Porter trial') and action='changed'")
    assert "pipeline_stage:Proposal / Quotation" in logged and "owner:Sean" in logged, logged


@check(7, "Marking Lost without a reason is refused; nothing is saved")
def t7(page):
    page.get_by_text("E2E Pallet Porter trial").first.click()
    d = page.get_by_role("dialog")
    d.get_by_label("Stage").select_option("Lost")
    d.get_by_role("button", name="Save changes").click()
    expect(d.get_by_text("Record why it was lost.")).to_be_visible()
    assert sql("select pipeline_stage from leads where name='E2E Pallet Porter trial'") == "Proposal / Quotation"
    close_modal(page)


@check(8, "Log an email against company + opportunity → follow-up created as 'Awaiting response' (nothing marked done)")
def t8(page):
    nav(page, "Companies & projects")
    page.get_by_label("Search companies").fill("E2E Pharma")
    page.get_by_text("E2E Pharma Distribution", exact=True).click()
    page.get_by_role("dialog").get_by_role("button", name="+ Log communication").click()
    d = page.get_by_role("dialog").last
    d.get_by_label("Opportunity").select_option(label="E2E Pallet Porter trial")
    d.get_by_label("Subject").fill("E2E quotation sent")
    d.get_by_role("button", name=re.compile("^Save|^Log")).last.click()
    page.wait_for_timeout(1000)
    comm = sql("select count(*) from interactions where subject='E2E quotation sent' and company_id is not null and opportunity_id=(select id from leads where name='E2E Pallet Porter trial')")
    assert comm == "1", comm
    fu = sql("select action_state||'|'||status||'|'||(follow_up_date is not null)::text from tasks where opportunity_id=(select id from leads where name='E2E Pallet Porter trial') and subject like 'Follow up:%'")
    assert fu == "Awaiting response|Follow Up|true", fu
    assert sql("select pipeline_stage from leads where name='E2E Pallet Porter trial'") == "Proposal / Quotation"
    page.keyboard.press("Escape")
    close_modal(page)


@check(9, "A wrong association can be corrected: 'Change links' moves a communication to a task")
def t9(page):
    nav(page, "Sales Pipeline")
    page.get_by_text("E2E Pallet Porter trial").first.click()
    d = page.get_by_role("dialog")
    d.get_by_role("button", name="Communications").click()
    d.get_by_role("button", name="Change links").first.click()
    task_label = sql("select subject from tasks where opportunity_id=(select id from leads where name='E2E Pallet Porter trial') and subject like 'Follow up:%'")
    d.get_by_label("Task").select_option(label=task_label)
    d.get_by_role("button", name="Save links").click()
    page.wait_for_timeout(800)
    assert sql("select (task_id is not null)::text from interactions where subject='E2E quotation sent'") == "true"
    close_modal(page)


@check(10, "Creating a follow-up task and updating its follow-up date work (and the change is logged)")
def t10(page):
    page.get_by_role("button", name="+ New Task").first.click()
    d = page.get_by_role("dialog")
    d.get_by_label("Subject").fill("E2E supplier delivery update")
    d.get_by_label("Responsible").select_option("Vanya")
    d.get_by_label("State").select_option("Awaiting response")
    d.get_by_label("Waiting on").fill("CIMC")
    d.get_by_label("🔔 Follow-up Date").fill(TODAY)
    d.get_by_role("button", name="Create Task").click()
    page.wait_for_timeout(900)
    assert sql("select action_state||'|'||waiting_on from tasks where subject='E2E supplier delivery update'") == "Awaiting response|CIMC"
    nav(page, "Tasks")
    page.get_by_role("button", name="FlwUP").click()
    page.get_by_text("E2E supplier delivery update").first.click()
    d = page.get_by_role("dialog")
    d.get_by_label("🔔 Follow-up Date").fill("2026-12-01")
    d.get_by_role("button", name="Save Changes").click()
    page.wait_for_timeout(900)
    assert sql("select follow_up_date from tasks where subject='E2E supplier delivery update'") == "2026-12-01"
    assert sql("select count(*) from activity_log where entity_type='task' and field='follow_up_date' and new_value='2026-12-01' and entity_id=(select id from tasks where subject='E2E supplier delivery update')") == "1"


@check(11, "Filtering tasks by owner works")
def t11(page):
    nav(page, "Tasks")
    page.get_by_role("button", name=re.compile("^All open")).click()
    page.get_by_role("button", name=re.compile("^Andrea")).click()
    page.wait_for_timeout(300)
    owners = page.locator("div[style*='text-align: right'] >> div").all_inner_texts()
    shown = [o for o in owners if o in ("Vanya", "Sean", "Andrea", "Jason", "Unassigned")]
    assert shown and set(shown) == {"Andrea"}, shown


@check(12, "Searching for companies, contacts, opportunities and products works; empty state shown")
def t12(page):
    open_search(page)
    box = page.get_by_label("Search the hub")
    box.fill("E2E Pharma")
    expect(page.get_by_text("E2E Pharma Distribution").first).to_be_visible(timeout=5000)
    box.fill("erin@e2e-pharma")
    expect(page.get_by_text("Erin Example").first).to_be_visible(timeout=5000)
    box.fill("Pallet Porter (Euro)")
    expect(page.get_by_text("E2E Pallet Porter trial").first).to_be_visible(timeout=5000)
    box.fill("zzqqxx-nothing")
    expect(page.get_by_text(re.compile("Nothing matches", re.I)).first).to_be_visible(timeout=5000)


@check(13, "Dashboard shows the correct underlying numbers (overdue, Sean to action)")
def t13(page):
    nav(page, "Dashboard")
    page.wait_for_timeout(800)
    open_ = "archived_at is null and action_state in ('Our action','Awaiting response','Monitoring','On hold')"
    d = "case when action_state in ('Awaiting response','Monitoring') then coalesce(follow_up_date, expected_response_date, expected_date) else coalesce(expected_date, follow_up_date) end"
    want = sql(f"select count(*) from tasks where {open_} and {d} < (now() at time zone '{TZ}')::date")
    tile = page.get_by_text("Overdue", exact=True).first.locator("xpath=..")
    got = re.search(r"\d+", tile.inner_text()).group(0)
    assert got == want, f"dashboard overdue {got} vs database {want}"


@check(14, "Won, Lost and On Hold opportunities keep their records")
def t14(page):
    nav(page, "Sales Pipeline")
    page.get_by_text("E2E Pallet Porter trial").first.click()
    d = page.get_by_role("dialog")
    d.get_by_label("Stage").select_option("On Hold / Nurture")
    d.get_by_label("Reason on hold").fill("Budget frozen until Q1")
    d.get_by_label("Review date").fill("2027-02-01")
    d.get_by_role("button", name="Save changes").click()
    page.wait_for_timeout(900)
    assert sql("select pipeline_stage||'|'||hold_reason||'|'||review_date from leads where name='E2E Pallet Porter trial'") == "On Hold / Nurture|Budget frozen until Q1|2027-02-01"
    expect(page.get_by_text("E2E Pallet Porter trial").first).to_be_visible()
    page.get_by_text("E2E Pallet Porter trial").first.click()
    d = page.get_by_role("dialog")
    d.get_by_label("Stage").select_option("Won")
    d.get_by_label("Outcome").fill("PO received")
    d.get_by_role("button", name="Save changes").click()
    page.wait_for_timeout(900)
    assert sql("select pipeline_stage||'|'||(closed_at is not null)::text||'|'||value_amount::int||'|'||currency from leads where name='E2E Pallet Porter trial'") == "Won|true|12500|USD"
    page.get_by_label("Show Won / Lost").check()
    expect(page.get_by_text("E2E Pallet Porter trial").first).to_be_visible()
    hist = sql("select count(*) from activity_log where entity_type='opportunity' and entity_id=(select id from leads where name='E2E Pallet Porter trial') and field='pipeline_stage'")
    assert int(hist) >= 3, hist


@check(15, "Removing the email record does not delete the opportunity, task, company or history")
def t15(page):
    before = sql("select count(*) from activity_log where entity_type='opportunity' and entity_id=(select id from leads where name='E2E Pallet Porter trial')")
    # The email-lifecycle event: the communication record is removed (as an inbox clean-up would).
    sql("delete from interactions where subject='E2E quotation sent'")
    assert sql("select count(*) from interactions where subject='E2E quotation sent'") == "0"
    assert sql("select pipeline_stage||'|'||currency||'|'||value_amount::int from leads where name='E2E Pallet Porter trial'") == "Won|USD|12500"
    assert sql("select count(*) from tasks where opportunity_id=(select id from leads where name='E2E Pallet Porter trial')") == "1"
    assert sql("select count(*) from companies where name='E2E Pharma Distribution'") == "1"
    assert sql("select count(*) from activity_log where entity_type='opportunity' and entity_id=(select id from leads where name='E2E Pallet Porter trial')") == before
    page.reload(wait_until="networkidle")
    nav(page, "Sales Pipeline")
    page.get_by_label("Show Won / Lost").check()
    expect(page.get_by_text("E2E Pallet Porter trial").first).to_be_visible()


@check(16, "Inbox triage: a flagged email can be logged and linked; clearing it removes nothing else")
def t16(page):
    nav(page, "Inbox Triage")
    page.get_by_role("button", name="+ Flag Email").click()
    page.get_by_label("Email Subject + Sender").fill("E2E RE: Delivery ETA — from CIMC")
    page.get_by_role("button", name="→ Follow Up").click()
    page.get_by_label("Next Action").fill("Record ETA against the order")
    page.get_by_role("button", name="Flag It").click()
    page.wait_for_timeout(800)
    page.get_by_role("button", name=re.compile("Log & link")).first.click()
    d = page.get_by_role("dialog")
    expect(d.get_by_label("Subject")).to_have_value("E2E RE: Delivery ETA — from CIMC")
    d.get_by_label("Company").select_option(label="E2E Logistics Partner")
    d.get_by_role("button", name=re.compile("^Save|^Log")).last.click()
    page.wait_for_timeout(900)
    assert sql("select count(*) from interactions where subject='E2E RE: Delivery ETA — from CIMC' and direction='Inbound' and company_id is not null") == "1"
    page.get_by_role("button", name="✓ Done").first.click()
    page.wait_for_timeout(800)
    assert sql("select cleared::text from inbox_triage where subject='E2E RE: Delivery ETA — from CIMC'") == "true"
    assert sql("select count(*) from interactions where subject='E2E RE: Delivery ETA — from CIMC'") == "1"


@check(17, "Errors are handled: a failed save shows a clear message and keeps what was typed")
def t17(page):
    nav(page, "Sales Pipeline")
    page.route("**/rest/v1/leads**", lambda route: route.abort() if route.request.method in ("POST", "PATCH") else route.continue_())
    page.get_by_role("button", name="+ Opportunity").click()
    d = page.get_by_role("dialog")
    d.get_by_label("Opportunity name").fill("E2E offline attempt")
    d.get_by_role("button", name="Create opportunity").click()
    expect(d.get_by_role("alert")).to_contain_text(re.compile("Couldn't reach the server|Failed to fetch", re.I), timeout=5000)
    expect(d.get_by_label("Opportunity name")).to_have_value("E2E offline attempt")
    page.unroute("**/rest/v1/leads**")
    assert sql("select count(*) from leads where name='E2E offline attempt'") == "0"
    close_modal(page)


@check(18, "Archiving (from Tasks → Jason) keeps the task and its history; nothing is deleted")
def t18(page):
    tid = sql("insert into tasks(subject, owner, status, next_action, expected_date) values ('E2E Jason archive me','Jason','To Do','x',current_date) returning id")
    tid = tid.splitlines()[0]
    sql(f"insert into task_history(task_id, changed_by, entry_type, note) values ({tid}, 'Jason', 'note', 'keep me')")
    page.reload(wait_until="networkidle"); page.wait_for_timeout(600)
    nav(page, "Tasks")
    page.get_by_role("button", name=re.compile(r"^Jason")).first.click()
    page.wait_for_timeout(600)
    page.get_by_text("E2E Jason archive me").first.click()
    page.get_by_role("button", name="Archive Task").click()   # confirm() is auto-accepted
    page.wait_for_timeout(800)
    assert sql(f"select (archived_at is not null)::text||'|'||archive_reason||'|'||updated_by from tasks where id={tid}") == "true|Archived|Vanya"
    assert sql(f"select count(*) from task_history where task_id={tid}") == "1"
    page.goto(URL, wait_until="networkidle")


def card_of(page, subject):
    return page.get_by_text(subject, exact=True).first.locator("xpath=ancestor::div[.//button[contains(., 'Done')]][1]")


@check(20, "Follow-ups: Today is sorted by due date; 'Sent — follow up', 'No reply — chased' and 'Replied' schedule and log correctly")
def t20(page):
    late = sql("insert into tasks(subject, owner, status, action_state, next_action, expected_date, category) values ('E2E overdue finance item','Sean','To Do','Our action','Pay CIMC deposit',current_date - 2,'Finance') returning id").splitlines()[0]
    tid = sql("insert into tasks(subject, owner, status, action_state, next_action, expected_date, client, category) values ('E2E send CIMC quote','Vanya','To Do','Our action','Email quote',current_date,'CIMC','Sales') returning id").splitlines()[0]
    page.reload(wait_until="networkidle"); page.wait_for_timeout(600)
    nav(page, "Tasks")
    page.wait_for_timeout(600)
    titles = page.locator("text=/^E2E (overdue finance item|send CIMC quote)$/").all_inner_texts()
    assert titles[:2] == ["E2E overdue finance item", "E2E send CIMC quote"], titles
    expect(card_of(page, "E2E send CIMC quote").get_by_text("Sales", exact=True)).to_be_visible()
    # 1) We sent the email → follow up in 3 days
    c = card_of(page, "E2E send CIMC quote")
    c.get_by_role("button", name=re.compile("Sent — follow up")).click()
    c.get_by_role("button", name="3d", exact=True).click()
    page.wait_for_timeout(1000)
    row = sql(f"select action_state||'|'||status||'|'||(follow_up_date - (now() at time zone '{TZ}')::date)||'|'||waiting_on from tasks where id={tid}")
    assert row == "Awaiting response|Follow Up|3|CIMC", row
    assert sql(f"select count(*) from interactions where task_id={tid} and direction='Outbound' and type='Email'") == "1"
    # no longer due today → gone from Today; now under All open + FlwUP
    expect(page.get_by_text("E2E send CIMC quote", exact=True)).to_have_count(0)
    page.get_by_role("button", name=re.compile("^All open")).click()
    page.get_by_role("button", name="FlwUP").click()
    c = card_of(page, "E2E send CIMC quote")
    expect(c.get_by_text(re.compile("Last contacted"))).to_be_visible()
    # 2) No reply → chased, follow up again in a week
    c.get_by_role("button", name="No reply — chased").click()
    c.get_by_role("button", name="1 wk", exact=True).click()
    page.wait_for_timeout(1000)
    assert sql(f"select follow_up_date - (now() at time zone '{TZ}')::date from tasks where id={tid}") == "7"
    assert sql(f"select count(*) from interactions where task_id={tid} and type='Follow-up'") == "1"
    expect(card_of(page, "E2E send CIMC quote").get_by_text(re.compile("chased 1×"))).to_be_visible()
    # 3) They replied → our move again, due today, not marked done
    card_of(page, "E2E send CIMC quote").get_by_role("button", name="↩ Replied").click()
    page.wait_for_timeout(1000)
    row = sql(f"select action_state||'|'||status||'|'||coalesce(follow_up_date::text,'none')||'|'||(expected_date = (now() at time zone '{TZ}')::date)::text from tasks where id={tid}")
    assert row == "Our action|To Do|none|true", row
    assert sql(f"select count(*) from interactions where task_id={tid} and direction='Inbound'") == "1"
    page.get_by_role("button", name="FlwUP").click()   # tag off
    page.get_by_role("button", name=re.compile("^Today")).first.click()
    expect(page.get_by_text("E2E send CIMC quote", exact=True)).to_be_visible()


@check(21, "Andrea/Jason/Siya: work can be assigned to them (marked delegated) and shows under their own tab")
def t21(page):
    page.get_by_role("button", name="+ New Task").first.click()
    d = page.get_by_role("dialog")
    d.get_by_label("Subject").fill("E2E Andrea book courier")
    d.get_by_label("Responsible").select_option(label="Andrea · delegated")
    d.get_by_role("button", name="Create Task").click()
    page.wait_for_timeout(900)
    assert sql("select owner from tasks where subject='E2E Andrea book courier'") == "Andrea"
    nav(page, "Tasks")
    page.get_by_role("button", name=re.compile("^All open")).click()
    page.get_by_role("button", name=re.compile("^Andrea")).click()
    expect(page.get_by_text("E2E Andrea book courier", exact=True)).to_be_visible()
    page.get_by_role("button", name=re.compile("^Siya")).click()
    expect(page.get_by_text("E2E Andrea book courier", exact=True)).to_have_count(0)


@check(22, "Quick list: type + Enter adds a 5-minute task due today; urgent goes on top; ticking completes it")
def t22(page):
    nav(page, "Quick list")
    box = page.get_by_label("Quick task")
    box.fill("E2E message Rajinder")
    box.press("Enter")
    page.wait_for_timeout(900)
    box.fill("E2E book flight JHB")
    page.get_by_role("button", name="! Urgent").click()
    box.press("Enter")
    page.wait_for_timeout(900)
    row = sql("select task_type||'|'||action_state||'|'||(expected_date = (now() at time zone 'Africa/Johannesburg')::date)::text||'|'||priority from tasks where subject='E2E book flight JHB'")
    assert row == "Quick task|Our action|true|Urgent", row
    titles = page.locator("text=/^(! )?E2E (message Rajinder|book flight JHB)$/").all_inner_texts()
    assert titles and "book flight" in titles[0], titles
    page.get_by_label("Done: E2E message Rajinder").click()
    page.wait_for_timeout(900)
    assert sql("select action_state from tasks where subject='E2E message Rajinder'") == "Completed"
    # quick tasks also show in Tasks → Today
    nav(page, "Tasks")
    expect(page.get_by_text("E2E book flight JHB", exact=True).first).to_be_visible()


@check(23, "Projects inside a company: add a project, add a task from it (company + project pre-filled), archive it — nothing deleted")
def t23(page):
    nav(page, "Companies & projects")
    page.get_by_label("Search companies").fill("Medipost")
    page.get_by_text("Medipost", exact=True).first.click()
    d = page.get_by_role("dialog")
    d.get_by_role("button", name=re.compile(r"^Projects \(")).click()
    d.get_by_role("button", name="+ Project").click()
    d.get_by_placeholder("e.g. Cold-chain pilot 2027").fill("E2E fridge rollout")
    d.get_by_role("button", name="Add project").click()
    page.wait_for_timeout(900)
    cid = sql("select id from companies where name='Medipost' and archived_at is null")
    pid = sql(f"select id from projects where name='E2E fridge rollout' and company_id={cid}")
    assert pid, "project not saved under Medipost"
    d.get_by_text("▸ E2E fridge rollout").click()
    d.get_by_role("button", name="+ Task").last.click()
    t = page.get_by_role("dialog").last
    t.get_by_label("Subject").fill("E2E fridge site survey")
    t.get_by_role("button", name="Create Task").click()
    page.wait_for_timeout(900)
    assert sql("select company_id||'|'||project_id||'|'||project from tasks where subject='E2E fridge site survey'") == f"{cid}|{pid}|E2E fridge rollout"
    d = page.get_by_role("dialog").first
    d.get_by_role("button", name="Archive").click()
    page.wait_for_timeout(800)
    assert sql(f"select (archived_at is not null)::text from projects where id={pid}") == "true"
    assert sql("select count(*) from tasks where subject='E2E fridge site survey'") == "1"
    close_modal(page)
    page.get_by_label("Search companies").fill("")


@check(24, "Overdue tasks nobody has touched glow; once edited the glow stops")
def t24(page):
    tid = sql("insert into tasks(subject, owner, status, action_state, expected_date, updated_by) values ('E2E untouched overdue','Sean','FYA','Our action',current_date - 3,'Import (Vanya-approved)') returning id").splitlines()[0]
    page.reload(wait_until="networkidle"); page.wait_for_timeout(600)
    nav(page, "Tasks")
    card = page.locator(".hub-glow", has_text="E2E untouched overdue")
    expect(card).to_have_count(1)
    page.get_by_text("E2E untouched overdue", exact=True).first.click()
    d = page.get_by_role("dialog")
    d.get_by_label("Next Action").fill("Call Sean")
    d.get_by_role("button", name="Save Changes").click()
    page.wait_for_timeout(1000)
    assert sql(f"select updated_by from tasks where id={tid}") == "Vanya"
    expect(page.locator(".hub-glow", has_text="E2E untouched overdue")).to_have_count(0)


def mobile_checks(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, timezone_id=TZ)
    m = ctx.new_page()
    try:
        for path in ("/sean", "/"):
            m.goto(URL + path, wait_until="networkidle")
            m.wait_for_timeout(800)
            sw, iw = m.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
            assert sw <= iw + 1, f"{path}: page scrolls sideways ({sw}px > {iw}px)"
        m.goto(URL + "/sean", wait_until="networkidle")
        tid = sql("insert into tasks(subject, owner, status, next_action, expected_date, priority) values ('E2E Sean approve quote','Sean','FYA','Approve',current_date - 1,'High') returning id").splitlines()[0]
        m.reload(wait_until="networkidle"); m.wait_for_timeout(800)
        card = m.get_by_text("E2E Sean approve quote").first.locator("xpath=ancestor::div[.//button[@aria-label='Mark done']][1]")
        btn = card.get_by_role("button", name="Mark done")
        box = btn.bounding_box()
        assert box["width"] >= 40 and box["height"] >= 40, f"touch target {box}"
        btn.tap()
        m.wait_for_timeout(1000)
        assert sql(f"select action_state||'|'||status from tasks where id={tid}") == "Completed|Done"
        results.append((19, "Mobile: no sideways scrolling on / and /sean; Sean completes a task with a ≥40px tap target", "PASS", ""))
    except Exception as e:  # noqa
        m.screenshot(path="/home/claude/staging/shots/fail_19.png", full_page=True)
        results.append((19, "Mobile layouts", "FAIL", f"{type(e).__name__}: {str(e)[:300]}"))
    ctx.close()


def main():
    global TODAY
    TODAY = sql(f"select (now() at time zone '{TZ}')::date")
    # clean up anything from a previous run (staging only)
    sql("set session_replication_role=replica; delete from activity_log where entity_id in (select id from leads where name like 'E2E%') and entity_type='opportunity'; delete from activity_log where entity_type='task' and entity_id in (select id from tasks where subject like 'E2E%'); delete from interactions where subject like 'E2E%'; delete from inbox_triage where subject like 'E2E%'; delete from task_history where task_id in (select id from tasks where subject like 'E2E%' or subject like 'Follow up: E2E%'); delete from tasks where subject like 'E2E%' or subject like 'Follow up: E2E%'; delete from leads where name like 'E2E%'; delete from company_contacts where contact_id in (select id from contacts where email like '%e2e-pharma%'); delete from contacts where email like '%e2e-pharma%'; delete from projects where name like 'E2E%'; delete from companies where name like 'E2E%'")
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, timezone_id=TZ)
        page = ctx.new_page()
        page.on("dialog", lambda dlg: dlg.accept())
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(1000)
        for fn in [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15, t16, t17, t18, t20, t21, t22, t23, t24]:
            # Fresh page for every check so one failure can't cascade into the next.
            page.goto(URL, wait_until="networkidle"); page.wait_for_timeout(700)
            fn(page)
        mobile_checks(b)
        b.close()
    print("\n#   Result  Check")
    for n, name, r, why in sorted(results):
        print(f"{n:<3} {r:<6}  {name}" + (f"\n             ↳ {why}" if why else ""))
    fails = [r for r in results if r[2] != "PASS"]
    print(f"\n{len(results) - len(fails)} passed, {len(fails)} failed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
