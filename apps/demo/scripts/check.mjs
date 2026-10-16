// Builds the demo twice and checks the widget wiring: absent without FEEDBACK_KEY, present and
// well-formed with it, and every page's blocks are direct children of <main> with data-section.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pages = ["index", "pricing/index", "about/index", "contact/index"];
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
const build = (env) => {
  rmSync(join(root, "dist"), { recursive: true, force: true });
  const clean = { ...process.env, FEEDBACK_KEY: "", FEEDBACK_OFF: "", ...env };
  execFileSync("pnpm", ["exec", "astro", "build"], { cwd: root, env: clean, stdio: "ignore" });
  return Object.fromEntries(pages.map((p) => [p, readFileSync(join(root, "dist", `${p}.html`), "utf8")]));
};

const plain = build({});
for (const [p, html] of Object.entries(plain)) {
  check(!/preview-feedback|widget\.js/.test(html), `${p}: no trace of the widget without FEEDBACK_KEY`);
}

const on = build({ FEEDBACK_KEY: "k_test", FEEDBACK_ENDPOINT: "https://fb.example.com/", BUILD_ID: "b1" });
for (const [p, html] of Object.entries(on)) {
  check((html.match(/<preview-feedback /g) ?? []).length === 1, `${p}: exactly one <preview-feedback>`);
  check(html.includes('endpoint="https://fb.example.com"') && html.includes('slug="acme-demo"') && html.includes('site-key="k_test"') && html.includes('build="b1"'), `${p}: attributes set`);
  check(html.includes('src="https://fb.example.com/v1/widget.js"'), `${p}: script points at the endpoint`);
  check(html.includes("pages=") && html.includes("/pricing"), `${p}: pages attribute lists the nav`);
  const main = html.match(/<main id="main">([\s\S]*)<\/main>/)?.[1] ?? "";
  const sections = main.match(/<section data-section="[a-z-]+"/g) ?? [];
  check(sections.length >= 2 && sections.length === (main.match(/<section[ >]/g) ?? []).length, `${p}: ${sections.length} sections, all with data-section`);
}
const names = Object.values(on).flatMap((h) => [...h.matchAll(/<section data-section="([a-z-]+)"/g)].map((m) => m[1]));
check(new Set(names).size === names.length, "data-section names are unique across the site");
rmSync(join(root, "dist"), { recursive: true, force: true });
process.exit(failed ? 1 : 0);
