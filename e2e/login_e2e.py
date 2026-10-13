"""
Login flow in a real browser — STAGING ONLY, app built with REACT_APP_AUTH_ENABLED=true,
staging DB has migration 0003 and test accounts (@test.local). Production keeps login OFF.
  HUB_URL=http://localhost:3002 python3 e2e/login_e2e.py
"""
import os, re, sys
from playwright.sync_api import sync_playwright, expect
URL = os.environ.get("HUB_URL", "http://localhost:3002")
PW = "Test-pass-123"
res = []
def ok(name, cond, why=""): res.append((name, bool(cond), why))

with sync_playwright() as p:
    b = p.chromium.launch()
    def fresh():
        ctx = b.new_context(viewport={"width": 1280, "height": 860}, timezone_id="Africa/Johannesburg")
        return ctx, ctx.new_page()

    # 1. Signed out: login form only, no data requests succeed
    ctx, pg = fresh()
    data_calls = []
    pg.on("response", lambda r: data_calls.append(r.status) if "/rest/v1/tasks" in r.url else None)
    for path in ("/", "/sean", "/team"):
        pg.goto(URL + path, wait_until="networkidle")
        ok(f"Signed out on {path}: only the sign-in form is shown", pg.get_by_text("Sign in to continue").is_visible() and not pg.get_by_text("Dashboard").count())
    ok("Signed out: no task data is loaded", all(s != 200 for s in data_calls) or not data_calls)
    # 2. Wrong password
    pg.get_by_label("Email").fill("vanya@test.local"); pg.get_by_label("Password").fill("wrong-one")
    pg.get_by_role("button", name="Sign in").click()
    ok("Wrong password shows a clear error", pg.get_by_text("Email or password is incorrect.").is_visible() or expect(pg.get_by_text("Email or password is incorrect.")).to_be_visible() is None)
    ctx.close()

    # 3. Signed in, no active profile
    for email, label in (("noprofile@test.local", "no profile"), ("inactive@test.local", "inactive profile")):
        ctx, pg = fresh(); pg.goto(URL, wait_until="networkidle")
        pg.get_by_label("Email").fill(email); pg.get_by_label("Password").fill(PW); pg.get_by_role("button", name="Sign in").click()
        try:
            expect(pg.get_by_text("No access yet")).to_be_visible(timeout=8000); shown = True
        except Exception: shown = False
        ok(f"Signed in with {label}: 'No access yet', no data", shown and not pg.get_by_text("Dashboard").count())
        ctx.close()

    # 4. Admin (Vanya) signs in and sees the hub incl. private items; can sign out
    ctx, pg = fresh(); pg.goto(URL, wait_until="networkidle")
    pg.get_by_label("Email").fill("vanya@test.local"); pg.get_by_label("Password").fill(PW); pg.get_by_role("button", name="Sign in").click()
    try:
        expect(pg.get_by_text("A · Today", exact=False).first).to_be_visible(timeout=10000); hub = True
    except Exception: hub = False
    ok("Approved admin signs in and the hub loads with data", hub)
    pg.get_by_text("Search", exact=True).first.click(); pg.get_by_label("Search the hub").fill("Elgin")
    try: expect(pg.get_by_text(re.compile("Cael - Birthday in Elgin")).first).to_be_visible(timeout=6000); priv = True
    except Exception: priv = False
    ok("Admin can find a private (personal) item", priv)
    ctx.close()

    # 5. Staff (Andrea) signs in on /team; private items are not visible
    ctx, pg = fresh(); pg.goto(URL + "/", wait_until="networkidle")
    pg.get_by_label("Email").fill("andrea@test.local"); pg.get_by_label("Password").fill(PW); pg.get_by_role("button", name="Sign in").click()
    try: expect(pg.get_by_text("A · Today", exact=False).first).to_be_visible(timeout=10000); hub = True
    except Exception: hub = False
    ok("Staff signs in and the hub loads", hub)
    pg.get_by_text("Search", exact=True).first.click(); pg.get_by_label("Search the hub").fill("Elgin")
    try: expect(pg.get_by_text(re.compile("Nothing matches", re.I)).first).to_be_visible(timeout=6000); hidden = True
    except Exception: hidden = False
    ok("Staff cannot see private (personal/finance) items", hidden)
    ctx.close()
    b.close()

w = max(len(n) for n, _, _ in res)
for n, good, why in res: print(("PASS  " if good else "FAIL  ") + n + (f"  ({why})" if why else ""))
print(f"\n{sum(g for _, g, _ in res)} passed, {sum(not g for _, g, _ in res)} failed")
sys.exit(0 if all(g for _, g, _ in res) else 1)
