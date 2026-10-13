#!/bin/bash
# Access-control tests for migration 0003, run against a STAGING stack only
# (gateway on :54321 -> PostgREST + Supabase Auth). Uses real sign-ins.
# Usage: ANON_KEY=... DB=hub_staging ./0003_access_test.sh
set -u
GW=${GW:-http://localhost:54321}
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 (expected $3, got $2)"; fail=$((fail+1)); fi; }
token() { curl -s "$GW/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H "content-type: application/json" \
  -d "{\"email\":\"$1\",\"password\":\"Test-pass-123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))"; }
count() { # $1 token  $2 path
  curl -s -o /tmp/acc_body -w "%{http_code}" "$GW/rest/v1/$2" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H "Prefer: count=exact" -H "Range: 0-0" -D /tmp/acc_hdr >/dev/null
  grep -i '^content-range' /tmp/acc_hdr | sed 's/.*\///' | tr -d '\r\n'; }
status() { # $1 token $2 method $3 path $4 body
  curl -s -o /dev/null -w "%{http_code}" -X "$2" "$GW/rest/v1/$3" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" \
    -H "content-type: application/json" -H "Prefer: return=minimal" ${4:+-d "$4"}; }
affected() { # PATCH and report affected row count
  curl -s -X PATCH "$GW/rest/v1/$2" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H "content-type: application/json" \
    -H "Prefer: return=representation" -d "$3" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else 'err')"; }

ADMIN=$(token vanya@test.local); MANAGER=$(token sean@test.local); STAFF=$(token andrea@test.local)
VIEWER=$(token viewer@test.local); INACTIVE=$(token inactive@test.local); NOPROF=$(token noprofile@test.local)
TOTAL=$(psql -tA -d "$DB" -c "select count(*) from tasks")
PRIVATE=$(psql -tA -d "$DB" -c "select count(*) from tasks where visibility='private'")

check "Sign-in works for an approved user (password)" "$([ -n "$ADMIN" ] && echo yes)" "yes"
check "Wrong password is refused" "$(curl -s -o /dev/null -w '%{http_code}' "$GW/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'content-type: application/json' -d '{"email":"vanya@test.local","password":"wrong"}')" "400"
check "Sign-up is disabled (nobody can create their own account)" "$(curl -s -o /dev/null -w '%{http_code}' "$GW/auth/v1/signup" -H "apikey: $ANON_KEY" -H 'content-type: application/json' -d '{"email":"stranger@test.local","password":"Test-pass-123"}')" "422"

check "Signed-out visitor sees no tasks" "$(status "$ANON_KEY" GET 'tasks?select=id&limit=1')" "401"
check "Signed-out visitor sees no companies" "$(status "$ANON_KEY" GET 'companies?select=id&limit=1')" "401"
check "Signed-out visitor cannot search" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$GW/rest/v1/rpc/search_hub" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H 'content-type: application/json' -d '{"q":"aspen"}')" "401"

check "Signed in but no profile: sees 0 tasks" "$(count "$NOPROF" 'tasks?select=id')" "0"
check "Inactive profile: sees 0 tasks" "$(count "$INACTIVE" 'tasks?select=id')" "0"
check "Inactive profile: cannot add a task" "$(status "$INACTIVE" POST tasks '{"subject":"x"}')" "403"

check "Admin sees every task incl. private" "$(count "$ADMIN" 'tasks?select=id')" "$TOTAL"
check "Manager (Sean) sees every task incl. private" "$(count "$MANAGER" 'tasks?select=id')" "$TOTAL"
check "Staff sees team tasks only (private hidden)" "$(count "$STAFF" 'tasks?select=id')" "$((TOTAL-PRIVATE))"
check "Viewer sees team tasks only" "$(count "$VIEWER" 'tasks?select=id')" "$((TOTAL-PRIVATE))"

check "Staff can add a task" "$(status "$STAFF" POST tasks '{"subject":"staff test task","owner":"Andrea"}')" "201"
check "Staff cannot add a private task" "$(status "$STAFF" POST tasks '{"subject":"sneaky","visibility":"private"}')" "403"
check "Viewer cannot add a task" "$(status "$VIEWER" POST tasks '{"subject":"viewer task"}')" "403"
check "Viewer cannot edit a task (0 rows changed)" "$(affected "$VIEWER" 'tasks?id=eq.33' '{"priority":"Low"}')" "0"
check "Staff can edit a team task" "$(affected "$STAFF" 'tasks?id=eq.33' '{"priority":"High"}')" "1"

# No delete policy on tasks: the request matches 0 rows (RLS) and the trigger is a second guard.
check "Nobody can hard-delete a task — not even admin (0 rows removed)" "$(curl -s -X DELETE "$GW/rest/v1/tasks?id=eq.33" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ADMIN" -H 'Prefer: return=representation' | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')" "0"
check "…and the task is still there" "$(psql -tA -d "$DB" -c 'select count(*) from tasks where id=33')" "1"
NOTE_ID=$(curl -s -X POST "$GW/rest/v1/notes" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $STAFF" -H 'content-type: application/json' -H 'Prefer: return=representation' -d '{"content":"access test note","author":"Andrea"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])')
check "Manager cannot delete a quick note (archive-only role)" "$(curl -s -X DELETE "$GW/rest/v1/notes?id=eq.$NOTE_ID" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $MANAGER" -H 'Prefer: return=representation' | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')" "0"
check "Admin can delete a quick note" "$(curl -s -X DELETE "$GW/rest/v1/notes?id=eq.$NOTE_ID" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ADMIN" -H 'Prefer: return=representation' | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')" "1"

check "Member reads own profile" "$(count "$STAFF" 'profiles?select=id')" "1"
check "Admin reads all profiles" "$(count "$ADMIN" 'profiles?select=id')" "$(psql -tA -d "$DB" -c 'select count(*) from profiles')"
check "Staff cannot make themselves admin" "$(affected "$STAFF" 'profiles?display_name=eq.Andrea' '{"role":"admin"}')" "0"
check "Clients cannot forge audit entries (only notes)" "$(status "$ADMIN" POST activity_log '{"entity_type":"task","entity_id":33,"action":"changed","field":"owner"}')" "403"
check "Audit trail records the signed-in user's name" "$(psql -tA -d "$DB" -c "select actor from activity_log where entity_type='task' and entity_id=33 and field='priority' order by id desc limit 1")" "Andrea"

echo "----"; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
