// Feature flags (set in Vercel → Project → Settings → Environment Variables).
//
// REACT_APP_AUTH_ENABLED — login is OFF unless this is exactly "true".
//   Leave it unset in production until the access list is approved and the
//   access-control migration (0003) has been applied. Turning it on without
//   that migration is harmless (people sign in, data still loads); applying
//   0003 without turning it on locks everyone out — so always: accounts →
//   flag on → deploy → apply 0003.
export const AUTH_ENABLED = process.env.REACT_APP_AUTH_ENABLED === "true";

// Who "me" is when login is off: the main hub is Vanya's, /sean is Sean's.
export const DEFAULT_USER = { "/sean": "Sean" }[typeof window !== "undefined" ? window.location.pathname : ""] || "Vanya";
