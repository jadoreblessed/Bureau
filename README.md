# BUREAU

Static single-page site (React + esbuild). `npm i && npm run build` → `dist/index.html` (one self-contained file — deploy anywhere: Vercel, Netlify, any static host).

- Contract address: `SITE.ca` in `src/lib/data.ts` (empty = "soon")
- X link: `SITE.x`, `SITE.xHandle`
- All texts and mock data: `src/lib/data.ts`
- Phantom: `src/lib/wallet.ts`. Launch currently signs a message and saves the agent in the browser; on-chain creation needs the backend.
