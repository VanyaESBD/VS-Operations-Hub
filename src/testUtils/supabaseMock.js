// Minimal chainable stand-in for the Supabase client used in UI tests.
// Every query resolves to { data, error } from `tables[name]`; writes are recorded.
export function makeSupabaseMock(tables = {}) {
  const calls = [];
  function builder(table) {
    const state = { table, op: "select", payload: null, filters: [] };
    const result = () => {
      if (state.op !== "select") return { data: Array.isArray(state.payload) ? state.payload[0] : state.payload, error: null };
      return { data: tables[table] || [], error: null };
    };
    const chain = {
      select: () => chain, order: () => chain, limit: () => chain, is: () => chain, eq: (k, v) => { state.filters.push([k, v]); return chain; },
      in: () => chain, maybeSingle: () => chain, single: () => chain, upsert: (p) => { state.op = "upsert"; state.payload = p; calls.push({ table, op: "upsert", payload: p }); return chain; },
      insert: (p) => { state.op = "insert"; state.payload = p; calls.push({ table, op: "insert", payload: p }); return chain; },
      update: (p) => { state.op = "update"; state.payload = p; calls.push({ table, op: "update", payload: p, filters: state.filters }); return chain; },
      delete: () => { state.op = "delete"; calls.push({ table, op: "delete" }); return chain; },
      then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
  }
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    calls,
    client: {
      from: (t) => builder(t),
      rpc: (fn, args) => { calls.push({ rpc: fn, args }); return Promise.resolve({ data: tables[`rpc:${fn}`] || [], error: null }); },
      channel: () => channel,
      removeChannel: () => {},
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: () => Promise.resolve({ error: { message: "Invalid login credentials" } }),
        signInWithOtp: () => Promise.resolve({ error: null }),
        signOut: () => Promise.resolve({}),
      },
    },
  };
}
