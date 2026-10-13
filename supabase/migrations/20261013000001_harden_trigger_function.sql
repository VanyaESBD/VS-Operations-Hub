-- 0002a — security tidy-up flagged by the Supabase security advisor after 0002.
-- hub_log_changes() is a SECURITY DEFINER trigger function; it should not be callable
-- through the API (/rest/v1/rpc/hub_log_changes). Triggers keep firing: Postgres checks
-- EXECUTE on a trigger function only when the trigger is created, not when it fires.
revoke execute on function public.hub_log_changes() from public, anon, authenticated;
