# Proposed access control — FOR APPROVAL (not active)

**Status (13 Oct 2026):** built, and tested on a staging copy of the live data (27 database access tests, rollback test, 11 browser login tests — all passing; see `docs/ROLLOUT.md`). **Nothing is switched on in production.** No accounts have been created, no invitations sent, no permissions granted. Test accounts existed only in the throwaway staging database (`@test.local`).

Today the live hub has **no login**: anyone who has the link can read, change and remove every record. This proposal replaces that with "signed-in, approved people only".

## Roles

| Role | Can see | Can change | Can remove | Manage people |
|---|---|---|---|---|
| **Admin** | Everything, incl. *private* items | Everything | Low-value items only (quick notes, flags, Sean's Week, inbox triage, communication entries, contact links). Business records are archived, never deleted. | Yes |
| **Manager** | Everything, incl. *private* items | Everything | Nothing (archive only) | No |
| **Staff** | Team items only — *not* items marked private (finance / personal) | Team items | Nothing (archive only) | No |
| **Viewer** | Team items only | Nothing | Nothing | No |

"Private" is a per-item switch on tasks, communications and reminders (e.g. Sean's personal and finance items). Companies, opportunities and orders are visible to all members.

## Proposed people — **decision needed for every row**

| Person | Email | Proposed role | Hub login? | Your decision |
|---|---|---|---|---|
| Vanya Labuschagne | vanya@esbd.co.za | Admin | Yes | ☐ |
| Sean Petzer | sean@esbd.co.za | Manager | Yes | ☐ |
| Andrea Wright | andrea@esbd.co.za | Staff — *to confirm* | *To confirm (Q10)* | ☐ |
| Jason Low | jason@esbd.co.za | Staff — *to confirm* | *To confirm (Q10)* | ☐ |

Task ownership is separate from access: Andrea and Jason keep the tasks they own whether or not they get a login.

**Important consequence:** today Jason and Andrea use the `/team` page without signing in. Once login is switched on, anyone without an account can no longer open the hub at all — including `/team`. So decide on their access *before* activation.

## How sign-in works

- Email + password, or an emailed one-time link. Supabase Auth handles passwords; the hub never sees or stores them.
- A link can never create an account by itself (`shouldCreateUser: false`) — only an admin can add people.
- A signed-in person with no **active** profile sees "No access yet" and no data.
- Turning someone off = set their profile to inactive. Their history and authorship are kept.

## Activation steps (only after approval)

1. Approve the table above.
2. In Supabase → Authentication → Users: add each approved person (Vanya can do this, or I prepare it for her to click).
3. Insert their `profiles` row with role and `active = true` (I prepare the exact SQL for review).
4. In Vercel → Settings → Environment Variables: set `REACT_APP_AUTH_ENABLED=true`, redeploy.
5. Each person signs in once to confirm it works.
6. Only then apply `supabase/migrations/20261012000003_access_control.sql` to production — this is the step that closes the open access.
7. Check: signed-out browser shows only the login page; staff can't see private items.

**Order matters:** applying step 6 before steps 2–5 would lock everyone out.

## Rollback

If anything goes wrong after activation: set `REACT_APP_AUTH_ENABLED` back to unset and redeploy, and re-apply the previous open policies (kept in `supabase/rollback/restore_open_access.sql`). No data is touched by either step.
