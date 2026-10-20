import { useEffect, useState, type FormEvent } from "react";
import { Mark } from "../components/icons";
import { setSite, type SiteSettings } from "../lib/site";

// /admin: edit the contract address and the X account. Reached by URL only
// (not linked anywhere); every request carries the admin token as a Bearer header.

const TOKEN_KEY = "bureau.admin";
const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
const saveToken = (t: string) => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };

async function call(method: "GET" | "PUT", token: string, body?: SiteSettings): Promise<SiteSettings> {
  const r = await fetch("/api/admin/site", {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
  return j as SiteSettings;
}

export default function Admin() {
  const [token, setToken] = useState(readToken);
  const [authed, setAuthed] = useState(false);
  const [form, setForm] = useState<SiteSettings>({ ca: "", x: "", xHandle: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    document.title = "BUREAU · admin";
    const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex, nofollow";
    document.head.appendChild(m);
    if (token) login(token);
    return () => m.remove();
  }, []);

  async function login(t: string) {
    setBusy(true); setMsg(null);
    try {
      setForm(await call("GET", t));
      setAuthed(true); saveToken(t);
    } catch (e) {
      setAuthed(false); saveToken("");
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const s = await call("PUT", token, form);
      setForm(s); setSite(s);
      setMsg({ ok: true, text: "Saved. The site shows the new values on its next load." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally { setBusy(false); }
  }

  const set = (k: keyof SiteSettings, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <main className="page">
      <div className="wrap page-top" style={{ maxWidth: 560 }}>
        <a href="/" className="row-wrap" style={{ gap: 10, alignItems: "center", marginBottom: 28 }}><Mark width={22} height={22} /><span className="label">BUREAU · admin</span></a>
        <h1 className="h-page" style={{ fontSize: "clamp(36px, 6vw, 56px)" }}>Site settings</h1>

        {!authed ? (
          <form className="panel corners mt-24" style={{ padding: 24, display: "grid", gap: 16 }} onSubmit={(e) => { e.preventDefault(); login(token); }}>
            <div className="field">
              <label htmlFor="tok">Admin token</label>
              <input id="tok" className="inp" type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value.trim())} />
            </div>
            <button className="btn btn-solid" disabled={busy || !token}>{busy ? "Checking…" : "Sign in"}</button>
          </form>
        ) : (
          <form className="panel corners mt-24" style={{ padding: 24, display: "grid", gap: 18 }} onSubmit={save}>
            <div className="field">
              <label htmlFor="ca">Contract address <span className="dim">empty = “soon”</span></label>
              <input id="ca" className="inp" spellCheck={false} value={form.ca} onChange={(e) => set("ca", e.target.value.trim())} placeholder="Solana mint address" />
            </div>
            <div className="field">
              <label htmlFor="x">X link</label>
              <input id="x" className="inp" spellCheck={false} value={form.x} onChange={(e) => set("x", e.target.value.trim())} placeholder="https://x.com/bureau_sol" />
            </div>
            <div className="field">
              <label htmlFor="xh">X handle</label>
              <input id="xh" className="inp" spellCheck={false} value={form.xHandle} onChange={(e) => set("xHandle", e.target.value.trim())} placeholder="@bureau_sol" />
            </div>
            <div className="row-wrap" style={{ gap: 10 }}>
              <button className="btn btn-solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" className="btn" onClick={() => { saveToken(""); setAuthed(false); setToken(""); }}>Sign out</button>
            </div>
          </form>
        )}
        {msg && <p className="lede mt-24" style={{ color: msg.ok ? "var(--ice)" : "#ff8a7a", fontSize: 15 }}>{msg.text}</p>}
      </div>
    </main>
  );
}
