# BUREAU — motion videos (Remotion)

Four 1920×1080 / 30fps videos in the site's ice-blue style.

| id | length | what it is |
|---|---|---|
| `FeeSplit` | 9s | stat card: "85% of creator fees to the agent" with a rolling counter and 3D bars |
| `Teaser` | 8s | blurred product screens drift behind one line, then "SOON · mainnet" |
| `Registry` | 18s | a grid draws itself, agent covers flicker on cell by cell, the camera dives into the centre cell for four decoded lines, then pulls back to the logo |
| `Launch` | 19s | ring of agents around a counter → "live on Solana" → four beats → logo |

`Launch` is built from three scenes (`Ring`, `Words`, `End`) that are also registered on their own.

```bash
npm i
npx remotion studio            # preview and edit
npx remotion render Launch out/bureau-Launch.mp4
```

Assets: `public/agents/*.webp` (agent covers, same as the site) and `public/shots/*.png` (screenshots of the live site).
On Windows the config points Remotion at the installed Chrome, because the bundled headless shell does not unpack under very long paths.
