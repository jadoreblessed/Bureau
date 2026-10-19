import { useEffect, useState, type AnchorHTMLAttributes } from "react";

// Hash router: works on any static host (and inside a single-file artifact).
export interface Route { path: string; parts: string[]; query: URLSearchParams }

function read(): Route {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [p, q = ""] = raw.split("?");
  const path = p.startsWith("/") ? p : "/" + p;
  return { path, parts: path.split("/").filter(Boolean), query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}

export function go(to: string) {
  const h = to.startsWith("#") ? to : "#" + to;
  if (window.location.hash === h) return;
  window.location.hash = h;
}

export function setQuery(params: Record<string, string | undefined>) {
  const r = read();
  const q = new URLSearchParams(r.query);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === "all") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  history.replaceState(null, "", "#" + r.path + (s ? "?" + s : ""));
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function Link({ to, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a href={"#" + to} {...rest}>
      {children}
    </a>
  );
}
