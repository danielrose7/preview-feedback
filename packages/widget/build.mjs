// Builds the widget into one classic script, and copies it where the Worker serves it from
// (apps/api/public/v1/widget.js). A classic IIFE needs no CORS headers to load cross-origin.
//   node build.mjs
import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist/widget.js");
await build({
  entryPoints: [join(here, "src/index.ts")],
  outfile: out,
  bundle: true,
  format: "iife",
  globalName: "PreviewFeedback",
  target: "es2022",
  minify: true,
  legalComments: "none",
});
const served = resolve(here, "../../apps/api/public/v1/widget.js");
mkdirSync(dirname(served), { recursive: true });
copyFileSync(out, served);
const gz = gzipSync(readFileSync(out)).length;
console.log(`widget.js ${(statSync(out).size / 1024).toFixed(1)} KB, ${(gz / 1024).toFixed(1)} KB gzipped -> ${served}`);
