// Builds the dashboard into the Worker's static assets: apps/api/public/studio/{index.html,studio.js}.
//   node build.mjs
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../api/public/studio");
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(here, "src/studio.ts")],
  outfile: join(out, "studio.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
});
copyFileSync(join(here, "src/index.html"), join(out, "index.html"));
console.log(`studio.js ${(statSync(join(out, "studio.js")).size / 1024).toFixed(1)} KB -> ${out}`);
