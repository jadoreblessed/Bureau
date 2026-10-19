// Builds BUREAU into one self-contained dist/index.html (JS, CSS and images inlined).
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const dev = process.argv.includes("--dev");
const r = await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  minify: !dev,
  format: "iife",
  target: ["es2020", "safari15"],
  jsx: "automatic",
  loader: { ".webp": "dataurl", ".png": "dataurl", ".svg": "dataurl" },
  define: { "process.env.NODE_ENV": dev ? '"development"' : '"production"' },
  write: false,
  outdir: "dist",
  logLevel: "warning",
});
let js = "", css = "";
for (const f of r.outputFiles) {
  if (f.path.endsWith(".js")) js = f.text;
  if (f.path.endsWith(".css")) css = f.text;
}
const html = readFileSync("index.html", "utf8")
  .replace("<!--CSS-->", () => `<style>${css}</style>`)
  .replace("<!--JS-->", () => `<script>${js.replace(/<\/script/g, "<\\/script")}</script>`);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
// Artifact variant: no doctype/html/head/body (the host adds the skeleton).
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, "").replace(/<meta name="viewport"[^>]*>\s*/, "");
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
writeFileSync("dist/artifact.html", head.trim() + "\n" + body.trim() + "\n");
console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} KB`);
