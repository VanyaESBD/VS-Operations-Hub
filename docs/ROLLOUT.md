# Rollout plan — ESBD Operations Hub CRM upgrade

**Status (13 Oct 2026)**

| | Status |
|---|---|
| Built | ✅ Code in this branch |
| Tested | ✅ On a staging copy of the live data (see below) |
| Deployed | ❌ Not yet — waiting for the Claude GitHub App on `VanyaESBD` so the branch can be pushed and Vercel builds a preview. Vercel access confirmed 13 Oct |
| Production database changed | ✅ Migration 0002 applied 13 Oct 09:12 SAST after a verified backup; every original value unchanged (fingerprints match), row counts unchanged |
| 0002a security tidy-up | Tested on staging; awaiting approval for production |
| Login activated | ❌ No — built, switched off (`REACT_APP_AUTH_ENABLED` unset) |
| Data import applied | ❌ No — preview v4 only |

## What was tested, and how

Staging = local Postgres 16 + Supabase's own PostgREST (v12.2.3) and Auth (v2.164.0) servers, with Supabase's roles/grants recreated,
loaded with a full copy of the live data. Fingerprints of every original column matched production before testing.

| Suite | File | Result |
|---|---|---|
| Unit + UI (Jest) | `src/lib/hub.test.js`, `src/__tests__/ui.test.js` | 38 / 38 |
| Migration keeps every original value | fingerprint before/after 0002 | identical |
| Database behaviour (0002) | `supabase/tests/0002_behaviour_test.sql` | 13 / 13 |
| Access control (0003) | `supabase/tests/0003_access_test.sh` | 27 / 27 |
| Rollback of 0003 restores today's access | `supabase/rollback/restore_open_access.sql` | pass |
| Browser, login OFF (production config) | `e2e/hub_e2e.py` | 19 / 19 |
| Browser, login ON (test build only) | `e2e/login_e2e.py` | 11 / 11 |
| Production build | `npm run build` (CI mode: warnings fail) | compiles |

Not testable here: Supabase Realtime (live updates between open browsers) — the app falls back to its 30-second refresh; Outlook/Microsoft 365 (not connected).

## Order of steps for production (each needs your go-ahead)

**Order matters: the new app needs migration 0002 first.** Deploying the app before 0002 would break loading.

1. **Approve** this rollout and migration 0002.
2. **Backup** — fresh export of every table (I take it and verify row counts), plus Supabase dashboard backup if on a paid plan.
3. **Apply 0002** to production in one transaction (`supabase/migrations/20261012000002_operations_hub_crm.sql`). Additive only: nothing dropped or renamed.
   Then verify: fingerprints of original columns unchanged; row counts unchanged; app still loads (old version keeps working against the new schema).
   ⚠ Between step 3 and step 4, the *old* screens' "Delete" buttons on tasks/leads will show an error — deletes are now blocked (archive instead). Keep this window short.
4. **Deploy the app** via a branch → Vercel preview URL → you check it → merge to `main` (Vercel deploys).
   Needs: Claude GitHub App installed on `VanyaESBD` (or you push the branch yourself).
5. **Data import** (separate approval, from the import preview) — tested on staging first, then applied with a before/after count report.
6. **Login activation** (separate approval, later) — follow `docs/ACCESS_CONTROL.md` exactly. Do **not** apply 0003 before accounts exist and the app is deployed with the flag on.

## Rollback

- App: redeploy the previous Vercel deployment (one click in Vercel).
- 0002: additive; the old app runs against it. To fully revert, restore from the step-2 backup (not expected to be needed).
- 0003: `supabase/rollback/restore_open_access.sql` + unset the flag (tested).
