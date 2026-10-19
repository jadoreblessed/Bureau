import type { SVGProps } from "react";
import type { ProviderId } from "../lib/data";

type P = SVGProps<SVGSVGElement>;
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };

export const ArrowUR = (p: P) => (<svg {...base} {...p}><path d="M7 17 17 7M9 7h8v8" /></svg>);
export const ArrowR = (p: P) => (<svg {...base} {...p}><path d="M4 12h15M13 6l6 6-6 6" /></svg>);
export const ArrowL = (p: P) => (<svg {...base} {...p}><path d="M20 12H5M11 6l-6 6 6 6" /></svg>);
export const Copy = (p: P) => (<svg {...base} {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>);
export const Check = (p: P) => (<svg {...base} strokeWidth={2.2} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>);
export const Search = (p: P) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const Grid = (p: P) => (<svg {...base} {...p}><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg>);
export const Rows = (p: P) => (<svg {...base} {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>);
export const Bolt = (p: P) => (<svg {...base} {...p}><path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" /></svg>);
export const Plus = (p: P) => (<svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>);
export const Upload = (p: P) => (<svg {...base} {...p}><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>);
export const Pause = (p: P) => (<svg {...base} {...p}><path d="M9 5v14M15 5v14" /></svg>);
export const Play = (p: P) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5v14l11-7z" /></svg>);
export const Shield = (p: P) => (<svg {...base} {...p}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>);
export const Globe = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z" /></svg>);
export const Send = (p: P) => (<svg {...base} {...p}><path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" /><path d="m10 13 4-4" /></svg>);
export const Wallet = (p: P) => (<svg {...base} {...p}><path d="M4 7a2 2 0 0 1 2-2h12v4" /><path d="M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2Z" /><circle cx="16" cy="14" r="1.2" fill="currentColor" /></svg>);
export const Logout = (p: P) => (<svg {...base} {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" /></svg>);
export const XLogo = (p: P) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.2h1.7L7.42 4.73H5.6l11.07 14.47Z" /></svg>);
export const Phantom = (p: P) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M4.5 18.6c2.4 0 4.2-2.1 5.3-3.8-.1.4-.2.8-.2 1.1 0 1 .6 1.8 1.7 1.8 1.6 0 3.2-1.4 4.1-2.9-.1.2-.1.4-.1.6 0 .8.5 1.3 1.1 1.3 2.1 0 4.2-3.7 4.2-7 0-2.6-1.3-4.9-4.6-4.9C10 4.8 3 11.4 3 16.3c0 1.4.6 2.3 1.5 2.3Zm11.4-9.9c0-.7.5-1.1 1-1.1s1 .4 1 1.1-.4 1.2-1 1.2-1-.5-1-1.2Zm-3 0c0-.7.4-1.1 1-1.1.5 0 1 .4 1 1.1s-.5 1.2-1 1.2c-.6 0-1-.5-1-1.2Z" /></svg>);

/** BUREAU mark: the wire globe from the hero, as a flat logo. */
export const Mark = (p: P) => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" {...p}>
    <circle cx="16" cy="16" r="13.5" strokeWidth="2" />
    <ellipse cx="16" cy="16" rx="5.5" ry="13.5" strokeWidth="1.6" />
    <ellipse cx="16" cy="16" rx="10.5" ry="13.5" strokeWidth="1.1" opacity=".55" />
    <path d="M3.4 11h25.2M3.4 21h25.2" strokeWidth="1.4" />
    <path d="M2.5 16h27" strokeWidth="1.1" opacity=".55" />
    <circle cx="22.6" cy="8.6" r="2.4" fill="currentColor" stroke="none" />
  </svg>
);
/** Isometric cube (marquee separator). */
export const IsoCube = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" {...p}>
    <path d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9Z" /><path d="M3 7.5 12 12.5 21 7.5M12 12.5v9" />
  </svg>
);
export const Star4 = (p: P) => (<svg viewBox="0 0 100 100" fill="currentColor" {...p}><path d="M50 0C50 35 65 50 100 50C65 50 50 65 50 100C50 65 35 50 0 50C35 50 50 35 50 0Z" /></svg>);

/** Abstract provider glyphs (not brand logos). */
export function ProviderIcon({ id, ...p }: { id: ProviderId } & P) {
  const s = { ...base, strokeWidth: 1.5, ...p };
  switch (id) {
    case "anthropic": return (<svg {...s}><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" /></svg>);
    case "openai": return (<svg {...s}><circle cx="12" cy="12" r="8" /><path d="M12 4v16M5 8l14 8M19 8 5 16" opacity=".55" /></svg>);
    case "google": return (<svg {...s}><path d="M12 2c0 5.5 4.5 10 10 10-5.5 0-10 4.5-10 10 0-5.5-4.5-10-10-10 5.5 0 10-4.5 10-10Z" fill="currentColor" stroke="none" /></svg>);
    case "xai": return (<svg {...s}><path d="m5 4 14 16M19 4l-6.5 7.5M11.5 12.5 5 20" /></svg>);
    case "deepseek": return (<svg {...s}><path d="M3 13c3-5 9-7 14-4 2 1 3 3 4 5-3 0-4 2-7 3-5 1-9-1-11-4Z" /><circle cx="15" cy="12" r="1" fill="currentColor" /></svg>);
    case "qwen": return (<svg {...s}><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="M12 8v8M8.5 10l7 4" /></svg>);
    case "mistral": return (<svg {...s}><path d="M4 5h4v4h8V5h4v14h-4v-6H8v6H4z" /></svg>);
    case "moonshot": return (<svg {...s}><path d="M15 4a8 8 0 1 0 5 11 6 6 0 0 1-5-11Z" /></svg>);
    case "minimax": return (<svg {...s}><path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4M21 12h0" /></svg>);
    case "zai": return (<svg {...s}><circle cx="12" cy="12" r="2" /><circle cx="12" cy="12" r="6" strokeDasharray="2 3" /><circle cx="12" cy="12" r="9.5" strokeDasharray="1 4" /></svg>);
  }
}
