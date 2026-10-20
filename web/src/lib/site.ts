// Live site settings (contract address, X account) edited from /admin.
// SITE in data.ts holds the defaults; the API overrides whatever it has set.
import { useSyncExternalStore } from "react";
import { SITE } from "./data";

export type SiteSettings = { ca: string; x: string; xHandle: string };

let current: typeof SITE = { ...SITE };
const subs = new Set<() => void>();

export function setSite(s: Partial<SiteSettings>) {
  const next = { ...current };
  // Empty values from the API mean "not set": keep the default for links, but an empty CA is meaningful ("soon").
  if (s.ca !== undefined) next.ca = s.ca;
  if (s.x) next.x = s.x;
  if (s.xHandle) next.xHandle = s.xHandle;
  current = next;
  Object.assign(SITE, next); // non-React readers (toasts etc.) see the same values
  subs.forEach((f) => f());
}

export function useSite() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current);
}

export function loadSite() {
  fetch("/api/site")
    .then((r) => (r.ok ? r.json() : null))
    .then((s: SiteSettings | null) => { if (s) setSite(s); })
    .catch(() => {});
}
