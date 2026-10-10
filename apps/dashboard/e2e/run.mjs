// End-to-end check of the dashboard against a real Worker (port 8797, throwaway storage), in system
// Chrome. Screenshots go to .work/fb/dash/.
//   pnpm --filter @preview-feedback/dashboard e2e
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const shots = join(repo, ".work/fb/dash");
mkdirSync(shots, { recursive: true });
const API = "http://localhost:8797";
const TOKEN = "dash-admin";
const ADMIN = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

const results = [];
let currentName = "";
const check = (cond, msg) => results.push({ ok: !!cond, name: `${currentName}: ${msg}` });
const section = (n) => { currentName = n; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), "fb-dash-"));
const wrangler = spawn("pnpm", ["exec", "wrangler", "dev", "--port", "8797", "--persist-to", tmp, "--var", `ADMIN_TOKEN:${TOKEN}`], { cwd: join(repo, "apps/api"), stdio: "ignore", detached: true });
let browser;
const finish = async (code) => {
  await browser?.close().catch(() => {});
  try { process.kill(-wrangler.pid, "SIGKILL"); } catch {} // the whole group: wrangler spawns workerd
  process.exit(code);
};
process.on("SIGINT", () => finish(1));

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${API}/x`)).status === 404) break; } catch {}
    await wait(500);
  }
  const post = (path, body, headers = ADMIN, method = "POST") => fetch(`${API}${path}`, { method, headers, body: JSON.stringify(body) }).then((r) => r.json());

  // Two sites: "molly" with threads on three pages, and "empty" with none.
  await wait(1500); // the Worker answers before its objects are ready to be created
  const molly = (await post("/admin/sites/molly", { previewUrl: "https://molly.preview.test/" })).siteKey;
  await post("/admin/sites/empty", {});
  const base = { author: "Molly", page: "/", page_title: "Home | Molly", viewport_w: 1280, viewport_h: 800, scroll_y: 0, build: "b3", user_agent: "e2e", anchor_path: null, anchor_dx: null, anchor_dy: null };
  const add = (over) => post("/sites/molly/comments", { ...base, ...over }, { "content-type": "application/json", "x-site-key": molly }).then((r) => r.comment?.id ?? Promise.reject(new Error(`seeding failed: ${JSON.stringify(r)}`)));
  const headline = await add({ body: "Headline could be warmer.", anchor_id: "hero", anchor_text: "Molly Gibson, L.Ac - Durango Acupuncture" });
  await post("/admin/sites/molly/comments", { parent_id: headline, body: 'Trying "Welcome home" in build 3.' });
  const phone = await add({ body: "Make the call button bigger.", viewport_w: 390, viewport_h: 800 });
  const prices = await add({ body: "Services need prices.", page: "/services/", page_title: "Services | Molly", anchor_id: "services", anchor_text: "Our services" });
  const faq = await add({ body: "Add a question about cost.", page: "/faq/", page_title: "FAQ | Molly" });
  await post(`/admin/sites/molly/threads/${faq}/resolve`, { by: "Daniel", note: "added" });
  const xss = await add({ body: '<img src=x onerror="window.__pwned=1"> and <b>bold</b>', page: "/faq/", page_title: "FAQ | Molly" });

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await ctx.newPage();
  globalThis.__page = page;
  const problems = [];
  page.on("console", (m) => m.type() === "error" && !/status of (400|401)/.test(m.text()) && problems.push(m.text())); // the refused token and URL are on purpose
  page.on("pageerror", (e) => problems.push(String(e)));
  const $ = (sel, opts) => page.locator(sel, opts);
  const text = (sel) => page.locator(sel).first().innerText();

  // ---- sign in -----------------------------------------------------------------------------------
  section("sign in");
  await page.goto(`${API}/studio/`);
  await page.getByLabel("Admin token").waitFor();
  check(true, "the gate shows first");
  check(!(await page.evaluate(() => document.body.innerText.includes("molly"))), "and no site data is visible");
  await page.getByLabel("Admin token").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("was not accepted").waitFor();
  check(true, "a wrong token is refused with a message");
  check(await page.evaluate(() => !localStorage.getItem("preview-feedback-admin-token") && !sessionStorage.getItem("preview-feedback-admin-token")), "and is not kept");
  await page.getByLabel("Admin token").fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await $(".site").first().waitFor();

  // ---- lists ---------------------------------------------------------------------------------------
  section("sites and threads");
  const sites = await $(".site").allInnerTexts();
  check(sites.length === 2 && sites[0].includes("empty") && sites[1].includes("molly"), `both sites are listed (${sites.map((s) => s.replace(/\s+/g, " ")).join(" | ")})`);
  await page.getByRole("button", { name: /^molly/ }).click();
  await $(".li").first().waitFor();
  check((await $(".site.on .badge").innerText()) === "4", "the open count is on the site");
  const groups = await $(".grp").allInnerTexts();
  check(groups.join(",").toLowerCase() === "home,faq,services", `open threads are grouped by page (${groups.join(",")})`);
  check((await $(".li").count()) === 4, "four open threads");
  await $(".pill", { hasText: "Resolved" }).first().click();
  const resolvedRows = await $(".li").allInnerTexts();
  check(resolvedRows.length === 1 && /resolved by Daniel/.test(resolvedRows[0]), "the resolved filter shows what Daniel resolved");
  await $(".pill", { hasText: "Open" }).first().click();
  await page.screenshot({ path: join(shots, "list.png") });

  // ---- filters -----------------------------------------------------------------------------------------
  section("filters");
  await page.getByLabel("Width").selectOption("phone");
  check((await $(".li").count()) === 1 && /call button/.test(await text(".li")), "width: phone keeps only the phone comment");
  await page.getByLabel("Width").selectOption("any");
  await page.getByLabel("Page", { exact: true }).selectOption("/services/");
  check((await $(".li").count()) === 1 && /prices/.test(await text(".li")), "page: services keeps only its threads");
  await page.getByLabel("Page", { exact: true }).selectOption("");

  // ---- reading a thread -----------------------------------------------------------------------------------
  section("thread");
  await $(".li", { hasText: "Headline" }).click();
  await $(".detail .msg").first().waitFor();
  check((await $(".detail .msg").count()) === 2, "both messages show");
  check(/Molly Gibson, L.Ac/.test(await text(".pinned")), "the pinned text shows");
  check(/written on desktop at 1280px/.test(await text(".detail .meta")), "where and how it was written shows");
  check(/build b3/.test(await text(".detail .meta")), "and the build");
  const open = await $("a.btn.pri").getAttribute("href");
  check(open === `https://molly.preview.test/?fb=${headline}`, `Open on preview lands on the pin (${open})`);
  check(page.url().endsWith(`#/molly/${headline}`), "the address holds the thread");
  await page.screenshot({ path: join(shots, "thread.png") });

  // ---- reply, resolve, reopen -----------------------------------------------------------------------------------
  section("actions");
  await page.getByLabel("Reply", { exact: true }).fill("Thanks, changing it now.");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByText("Thanks, changing it now.").waitFor();
  check((await $(".detail .msg").last().innerText()).includes("Daniel"), "a reply posts as Daniel");
  check((await page.getByLabel("Reply", { exact: true }).inputValue()) === "", "and the draft clears");
  await page.getByLabel("Resolution note").fill("Now says Welcome home");
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await page.getByText("Resolved by Daniel").waitFor();
  check(/Now says Welcome home/.test(await text(".status")), "resolve records the note");
  check(await page.getByRole("button", { name: "Reopen" }).isVisible(), "a resolved thread offers Reopen, not a reply box");
  check((await $("textarea").count()) === 0, "and no textarea");
  check((await $(".site.on .badge").innerText()) === "3", "the site count dropped");
  await page.getByRole("button", { name: "Reopen" }).click();
  await page.getByLabel("Reply", { exact: true }).waitFor();
  check(/Reopened by Daniel/.test(await text(".detail")), "reopen is recorded");

  // ---- untrusted text -----------------------------------------------------------------------------------
  section("untrusted text");
  await $(".pill", { hasText: "Open" }).first().click();
  await page.getByLabel("Page", { exact: true }).selectOption("/faq/");
  await $(".li", { hasText: "onerror" }).click();
  await $(".detail .msg").first().waitFor();
  check((await page.evaluate(() => !!window.__pwned)) === false, "markup in a comment does not run");
  check(await page.evaluate(() => (document.querySelector("fb-studio").shadowRoot.querySelector(".detail .msg p").textContent.includes("<img src=x"))), "it shows as plain text");
  check((await page.evaluate(() => document.querySelector("fb-studio").shadowRoot.querySelectorAll(".detail .msg img, .detail .msg b").length)) === 0, "with no elements made from it");
  await page.getByLabel("Page", { exact: true }).selectOption("");

  // ---- preview URL, deep link, delete ---------------------------------------------------------------------------------
  section("settings and links");
  await page.getByRole("button", { name: /^empty/ }).click();
  check(/not set/.test(await text(".detail")), "a site with no preview URL says so");
  check((await $("a.btn.pri").count()) === 0, "and offers no preview link");
  await page.getByRole("button", { name: "set" }).click();
  await page.getByLabel(/Preview URL for empty/).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText(/must be an http/).first().waitFor();
  check(true, "a javascript: preview URL is refused");
  await page.getByLabel(/Preview URL for empty/).fill("http://localhost:4322/empty/");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("http://localhost:4322/empty", { exact: false }).first().waitFor();
  check(true, "a plain URL is saved");

  await page.goto(`${API}/studio/#/molly/${prices}`);
  await $(".detail .msg").first().waitFor();
  check(/Services need prices/.test(await text(".detail")), "a link opens that thread directly");
  await page.reload();
  await $(".detail .msg").first().waitFor();
  check(/Services need prices/.test(await text(".detail")), "a reload keeps your place");
  check(await page.evaluate(() => !!sessionStorage.getItem("preview-feedback-admin-token") && !localStorage.getItem("preview-feedback-admin-token")), "the token is in session storage unless you ask to remember it");

  await page.getByRole("button", { name: "Delete thread" }).click();
  await page.getByRole("button", { name: "Keep" }).click();
  check((await $(".li").count()) === 4, "Keep leaves the thread alone");
  await page.getByRole("button", { name: "Delete thread" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await page.waitForFunction(() => !location.hash.match(/\/\d+$/));
  check((await $(".li", { hasText: "prices" }).count()) === 0, "a confirmed delete removes the thread");
  const gone = await fetch(`${API}/admin/sites/molly/export`, { headers: ADMIN }).then((r) => r.json());
  check(!gone.comments.some((c) => c.id === prices), "from the server too");

  // ---- phone width ---------------------------------------------------------------------------------------
  section("phone width");
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${API}/studio/#/molly`);
  await $(".li").first().waitFor();
  check(!(await $(".detail").first().isVisible()), "the list has the screen to itself");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal scroll");
  await $(".li").first().click();
  await $(".detail .msg").first().waitFor();
  check(!(await $(".list").first().isVisible()), "opening a thread replaces the list");
  check(await page.getByRole("button", { name: "← Back to list" }).isVisible(), "with a way back");
  await page.screenshot({ path: join(shots, "phone-thread.png") });
  await page.getByRole("button", { name: "← Back to list" }).click();
  check(await $(".list").first().isVisible(), "back returns to the list");
  await page.setViewportSize({ width: 1280, height: 820 });

  // ---- remember, sign out ---------------------------------------------------------------------------------------
  section("remember and sign out");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Admin token").waitFor();
  check(await page.evaluate(() => !sessionStorage.getItem("preview-feedback-admin-token")), "sign out clears the token");
  await page.getByLabel("Admin token").fill(TOKEN);
  await page.getByLabel("Remember on this device").check();
  await page.getByRole("button", { name: "Sign in" }).click();
  await $(".site").first().waitFor();
  await page.reload();
  await $(".site").first().waitFor();
  check(true, "a remembered token survives closing and reopening");
  await page.getByRole("button", { name: "Sign out" }).click();
  check(await page.evaluate(() => !localStorage.getItem("preview-feedback-admin-token")), "and sign out removes it");

  section("console");
  check(problems.length === 0, `no console or page errors (${problems.join(" | ") || "none"})`);
} catch (e) {
  await globalThis.__page?.screenshot({ path: join(shots, "crash.png") }).catch(() => {});
  results.push({ ok: false, name: `crashed: ${e.stack || e}` });
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}`);
console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots: ${shots}`);
await finish(failed.length ? 1 : 0);
