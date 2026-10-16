// End-to-end check of the docs against a real Worker (port 8798, throwaway storage), in system Chrome.
//   pnpm --filter @preview-feedback/docs e2e
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { PAGES } from "../lib.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const shots = join(repo, ".work/fb/docs");
mkdirSync(shots, { recursive: true });
const API = "http://localhost:8798";
const results = [];
const check = (cond, msg) => results.push({ ok: !!cond, name: msg });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), "fb-docs-"));
const wrangler = spawn("pnpm", ["exec", "wrangler", "dev", "--port", "8798", "--persist-to", tmp, "--var", "ADMIN_TOKEN:docs-admin"], { cwd: join(repo, "apps/api"), stdio: "ignore", detached: true });
let browser;
const finish = async (code) => {
  await browser?.close().catch(() => {});
  try { process.kill(-wrangler.pid, "SIGKILL"); } catch {}
  process.exit(code);
};
process.on("SIGINT", () => finish(1));

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${API}/x`)).status === 404) break; } catch {}
    await wait(500);
  }
  const get = (p) => fetch(`${API}${p}`, { redirect: "manual" });

  const root = await get("/");
  check(root.status === 302 && root.headers.get("location") === "/docs/", "/ redirects to /docs/");
  for (const name of PAGES) {
    const html = await get(`/docs/${name === "index" ? "" : name}`);
    const md = await get(`/docs/${name}.md`);
    check(html.status === 200 && (html.headers.get("content-type") ?? "").includes("text/html"), `/docs/${name} serves HTML`);
    check(md.status === 200 && (await md.text()).startsWith("# "), `/docs/${name}.md serves its markdown twin`);
  }
  const llms = await get("/llms.txt");
  const llmsText = await llms.text();
  check(llms.status === 200 && llmsText.startsWith("# preview-feedback"), "llms.txt is served and starts with the title");
  check(PAGES.filter((p) => p !== "index").every((p) => llmsText.includes(`/docs/${p}.md`)), "llms.txt links every page's markdown");
  check(/untrusted/i.test(llmsText), "llms.txt tells agents comments are untrusted");
  const full = await (await get("/llms-full.txt")).text();
  check(full.startsWith("preview-feedback: full documentation") && PAGES.every((p) => full.includes(`/docs/${p}.md`)), "llms-full.txt has every page");
  const prompt = await get("/agent-setup/prompt.md");
  check(prompt.status === 200 && /untrusted data/.test(await prompt.text()), "agent setup prompt is served and carries the safety rule");
  check((await get("/sitemap.xml")).status === 200, "sitemap.xml is served");
  const robots = await (await get("/robots.txt")).text();
  check(/Allow: \/docs\//.test(robots) && /Disallow: \/\s*$/m.test(robots), "robots allows docs and nothing else");

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(String(e)));

  await page.goto(`${API}/docs/`);
  check((await page.locator("h1").innerText()) === "preview-feedback", "the overview renders its title");
  const links = await page.locator("nav a[href^='/docs/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  check(links.length === PAGES.length, `the nav lists all ${PAGES.length} pages`);
  const broken = [];
  for (const href of links) if ((await get(href)).status !== 200) broken.push(href);
  check(!broken.length, `every nav link resolves${broken.length ? ` (broken: ${broken})` : ""}`);
  // Links inside the prose that stay on the site resolve too.
  const inner = await page.locator("main a[href^='/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  const dead = [];
  for (const href of inner) if ((await get(href.split("#")[0])).status >= 400) dead.push(href);
  check(!dead.length, `every in-page link resolves${dead.length ? ` (dead: ${dead})` : ""}`);

  await page.goto(`${API}/docs/api`);
  check((await page.locator("table").count()) >= 2, "tables render");
  await page.locator("#copy-md").click();
  await page.waitForFunction(() => document.getElementById("copy-md").textContent === "Copied");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(clip.startsWith("# HTTP API"), "Copy as Markdown copies the page's markdown");
  await page.screenshot({ path: join(shots, "api.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${API}/docs/getting-started`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal scroll at phone width");
  await page.screenshot({ path: join(shots, "phone.png") });
  check(!problems.length, `no console errors${problems.length ? `: ${problems[0]}` : ""}`);
} catch (e) {
  results.push({ ok: false, name: `crashed: ${e.message}` });
}
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await finish(failed ? 1 : 0);
