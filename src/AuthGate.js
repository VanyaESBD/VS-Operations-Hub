import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { AUTH_ENABLED, DEFAULT_USER } from "./lib/config";
import { UserContext, C, inp, btn, Banner } from "./hub/ui";

// Wraps the whole app.
//  • Login OFF (default): renders the app exactly as before; "me" = Vanya on /, Sean on /sean.
//  • Login ON: email + password (or emailed magic link) via Supabase Auth. A signed-in
//    person sees nothing until an admin has created an *active* profile for them.
export default function AuthGate({ children }) {
  if (!AUTH_ENABLED) {
    return <UserContext.Provider value={{ name: DEFAULT_USER, role: null, signOut: null }}>{children}</UserContext.Provider>;
  }
  return <SignedIn>{children}</SignedIn>;
}

function SignedIn({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (uid) => {
    const { data, error: e } = await supabase.from("profiles").select("display_name, role, active").eq("id", uid).maybeSingle();
    if (e) setError("Couldn't check your access: " + e.message);
    setProfile(data || null);
  }, []);

  useEffect(() => {
    if (session?.user?.id) loadProfile(session.user.id);
    else if (session === null) setProfile(null);
  }, [session, loadProfile]);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  if (session === undefined || (session && profile === undefined)) return <Shell><div style={{ color: C.dim }}>Loading…</div></Shell>;
  if (!session) return <LoginForm />;
  if (!profile || !profile.active) {
    return (
      <Shell>
        <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>No access yet</h2>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.5 }}>
          You're signed in as <b>{session.user.email}</b>, but your Operations Hub access hasn't been switched on.
          Ask Vanya to enable your account.
        </p>
        {error && <Banner>{error}</Banner>}
        <button style={btn("ghost")} onClick={signOut}>Sign out</button>
      </Shell>
    );
  }
  return (
    <UserContext.Provider value={{ name: profile.display_name, role: profile.role, email: session.user.email, signOut }}>
      {children}
    </UserContext.Provider>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("password");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr("Enter a valid email address."); return; }
    setBusy(true);
    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message);
    } else {
      // shouldCreateUser:false — a magic link never creates an account; accounts are created by an admin only.
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname } });
      if (error) setErr(error.message); else setMsg("Check your email for a sign-in link.");
    }
    setBusy(false);
  };

  return (
    <Shell>
      <img src="https://esbd.co.za/wp-content/uploads/2024/07/4.png" alt="ESBD" style={{ width: 120, marginBottom: 12 }} />
      <h1 style={{ margin: "0 0 4px", fontSize: 20 }}>Operations Hub</h1>
      <div style={{ color: C.dim, fontSize: 13, marginBottom: 20 }}>Sign in to continue</div>
      {err && <Banner>{err}</Banner>}
      {msg && <Banner kind="ok">{msg}</Banner>}
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={inp} type="email" autoComplete="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        {mode === "password" && <input style={inp} type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />}
        <button type="submit" disabled={busy} style={{ ...btn("primary"), padding: "12px", fontSize: 15, opacity: busy ? 0.6 : 1 }}>{busy ? "Please wait…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}</button>
      </form>
      <button onClick={() => { setMode(mode === "password" ? "link" : "password"); setErr(null); setMsg(null); }} style={{ ...btn("ghost"), border: "none", marginTop: 10, fontSize: 12 }}>
        {mode === "password" ? "Use an emailed link instead" : "Use a password instead"}
      </button>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 28 }}>{children}</div>
    </div>
  );
}
