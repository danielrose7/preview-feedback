// End-to-end check of the widget against a real API and a small three-page fixture site, in system
// Chrome. Starts its own Worker (port 8799, throwaway storage) and fixture server (port 8798).
//   pnpm --filter @preview-feedback/widget e2e          screenshots go to .work/fb/e2e/
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const shots = join(repo, ".work/fb/e2e");
mkdirSync(shots, { recursive: true });
const API = "http://localhost:8799";
const SITE = "http://localhost:8798";
const ADMIN = { authorization: "Bearer e2e-admin" };
const SLUG = "e2e-site";

// ---- harness ---------------------------------------------------------------------------------
const results = [];
let currentName = "";
const check = (cond, msg) => results.push({ ok: !!cond, name: `${currentName}: ${msg}` });
const section = (n) => { currentName = n; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;
/** Waits until the page has stopped scrolling (a smooth scroll can take a while). */
const settled = async (p) => { let last = -1; for (let i = 0; i < 40; i++) { const y = await p.evaluate(() => scrollY); if (y === last) return y; last = y; await wait(150); } return last; };

const bundle = await build({
  entryPoints: [join(here, "../src/index.ts")], bundle: true, write: false, format: "iife", globalName: "PreviewFeedback", target: "es2022",
});
const widgetJs = bundle.outputFiles[0].text;

const tmp = mkdtempSync(join(tmpdir(), "fb-e2e-"));
const wrangler = spawn("pnpm", ["exec", "wrangler", "dev", "--port", "8799", "--persist-to", tmp, "--var", "ADMIN_TOKEN:e2e-admin"], {
  cwd: join(repo, "apps/api"), stdio: "ignore",
});
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${API}/x`)).status === 404) break; } catch {}
  await wait(500);
}
const siteKey = (await (await fetch(`${API}/admin/sites/${SLUG}`, { method: "POST", headers: ADMIN })).json()).siteKey;

const NAV = ["/", "/services/", "/faq/"];
const pageHtml = (path, q) => {
  const titles = { "/": "Home | Fixture Clinic", "/services/": "Services | Fixture Clinic", "/faq/": "FAQ | Fixture Clinic" };
  const body = {
    "/": `<div data-section="hero-1"><section><h1>Welcome to the clinic</h1><p>Gentle care for everyone.</p></section></div>
          <div data-section="promo"><section class="desktop-only"><h2>Desktop promo</h2><p>Only on wide screens.</p></section></div>
          <div data-section="about"><section style="min-height:1100px"><h2>About us</h2><p>We have been here a long time.</p></section></div>
          <div data-section="deep"><section style="min-height:900px"><h2>Deep section</h2><p>Well below the fold.</p></section></div>`,
    "/services/": q.has("nosection")
      ? `<div data-section="other-1"><section><h2>Something else entirely</h2></section></div>`
      : `<div data-section="services"><section><h2>Our services</h2><p>Acupuncture, herbs, cupping.</p></section></div>`,
    "/faq/": `<div data-section="faq"><section><h2>Questions</h2><details><summary>Does it hurt?</summary><p>Rarely.</p></details></section></div>`,
  }[path];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titles[path]}</title>
  <style>body{font:16px system-ui;margin:0} header{position:fixed;top:0;left:0;right:0;height:48px;padding:12px 16px;background:#fff;border-bottom:1px solid #ddd;box-sizing:border-box;z-index:5} main{padding:64px 16px 0} section{padding:48px 0}
  @media (max-width:640px){.desktop-only{display:none}}</style></head>
  <body><header><a href="/">Home</a> <a href="/services/">Services</a> <a href="/faq/">FAQ</a></header><main id="main">${body}</main>
  <script src="/widget.js"></script>
  <script>PreviewFeedback.mount({endpoint:"${API}",slug:"${SLUG}",siteKey:"${siteKey}",build:"e2e",pages:${JSON.stringify(NAV)}})</script></body></html>`;
};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, SITE);
  if (u.pathname === "/widget.js") { res.setHeader("content-type", "text/javascript"); return res.end(widgetJs); }
  if (NAV.includes(u.pathname)) { res.setHeader("content-type", "text/html"); return res.end(pageHtml(u.pathname, u.searchParams)); }
  if (u.pathname === "/declarative/") {
    res.setHeader("content-type", "text/html");
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Declarative | Fixture Clinic</title></head>
      <body style="margin:0;font:16px system-ui"><main id="main"><div data-section="hero-1"><section style="padding:48px 16px"><h1>Declarative mount</h1><p>Just an element and a script tag.</p><a id="probe" href="#probe">probe link</a></section></div></main>
      <preview-feedback endpoint="${API}" slug="${SLUG}" site-key="${siteKey}" build="declarative" pages="/,/services/,/faq/"></preview-feedback>
      <script src="${API}/v1/widget.js" defer></script></body></html>`);
  }
  if (u.pathname === "/favicon.ico") { res.statusCode = 204; return res.end(); }
  res.statusCode = 404; res.end("nf");
});
await new Promise((r) => server.listen(8798, r));

const browser = await chromium.launch({ channel: "chrome" });
const ctx = async (vp = { width: 1280, height: 800 }, touch = false) => browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
const sr = (p) => p.locator("preview-feedback");
const fbText = async (p, text) => (await sr(p).getByText(text).count()) > 0;
const waitText = (p, t) => p.waitForFunction((x) => document.querySelector("preview-feedback").shadowRoot.textContent.includes(x), t);
const waitGone = (p, t) => p.waitForFunction((x) => !document.querySelector("preview-feedback").shadowRoot.textContent.includes(x), t);
const snap = (p, n) => p.screenshot({ path: join(shots, `${n}.png`) });
const attach = async (p) => { await p.waitForSelector("preview-feedback", { state: "attached" }); await p.waitForSelector("preview-feedback .toolbar"); };
const pins = (p) => p.locator("preview-feedback .pin:not(.pending)");
const headBtn = (p, name) => p.locator("preview-feedback .thead").getByRole("button", { name });
const setName = async (p, name) => { await p.locator("preview-feedback input[aria-label='Your name']").fill(name); await sr(p).getByRole("button", { name: "Save", exact: true }).click(); };
const api = async (path, init = {}) => (await fetch(`${API}${path}`, { ...init, headers: { ...ADMIN, ...(init.headers ?? {}) } })).json();
/** Panel open on the inbox list, whatever state the last page left it in. */
const toList = async (p) => {
  if (!(await p.locator("preview-feedback .tab").count())) await p.locator("preview-feedback .tb-inbox").click();
  await p.waitForSelector("preview-feedback .tab");
};
/** Comment mode: click a spot, write, send. Returns once the thread view shows the text. */
const placePin = async (p, selector, text, at) => {
  await p.locator("preview-feedback .toolbar").getByRole("button", { name: "Add a comment" }).click();
  await p.click(selector, at ? { position: at } : {});
  await p.locator("preview-feedback textarea").fill(text);
  await sr(p).getByRole("button", { name: "Send", exact: true }).click();
  await waitText(p, text);
};
const postApi = (body) => fetch(`${API}/sites/${SLUG}/comments`, { method: "POST", headers: { "x-site-key": siteKey, "content-type": "application/json", "cf-connecting-ip": `203.0.113.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) });

try {
  // ---------------------------------------------------------------------------------------
  section("toolbar and placing a pin (desktop, Molly)");
  const molly = await ctx();
  const m = await molly.newPage();
  const errors = [];
  m.on("pageerror", (e) => errors.push(e.message));
  m.on("console", (c) => c.type() === "error" && errors.push(c.text()));
  await m.goto(`${SITE}/`);
  await attach(m);
  const tb = await m.locator("preview-feedback .toolbar").boundingBox();
  check(tb && near(tb.x + tb.width / 2, 640, 2) && near(tb.y + tb.height, 784, 2), "toolbar pill is bottom centre");
  check((await m.locator("preview-feedback .tb-inbox .cnt").innerText()) === "0", "inbox count starts at 0");
  check((await m.locator("preview-feedback .tb-filter").innerText()) === "Open", "filter shows Open");
  await m.locator("preview-feedback .toolbar").getByRole("button", { name: "Add a comment" }).click();
  check(await m.locator("preview-feedback .bar:not([hidden])").count(), "comment mode banner shown");
  const h1 = await m.locator("main h1").boundingBox();
  const click = { x: h1.x + h1.width * 0.25, y: h1.y + h1.height * 0.5 };
  await m.mouse.move(click.x, click.y);
  check(await m.locator("preview-feedback .hl:not([hidden])").count(), "hovering outlines the element");
  await m.mouse.click(click.x, click.y);
  await m.waitForSelector("preview-feedback .pin.pending");
  check(true, "a pending pin drops where you clicked");
  const pp = await m.locator("preview-feedback .pin.pending").boundingBox();
  check(near(pp.x, click.x, 3) && near(pp.y + 28, click.y, 4), "the pin's tip sits on the clicked spot");
  check(await fbText(m, "Pinned to hero 1 section"), "chip names the section");
  const pop = await m.locator("preview-feedback .panel").boundingBox();
  check(pop.x > pp.x && pop.y < pp.y + 40, "compose popover opens beside the pin");
  await setName(m, "Molly");
  check(await fbText(m, "Posting as Molly"), "name is a settings row");
  await m.locator("preview-feedback textarea").fill("Headline could be warmer.");
  await sr(m).getByRole("button", { name: "Send", exact: true }).click();
  await waitText(m, "Headline could be warmer.");
  check((await pins(m).count()) === 1 && (await pins(m).first().innerText()) === "1", "a numbered pin replaces the pending one");
  check(await m.locator("preview-feedback .pin.selected").count(), "its pin is selected while the thread is open");
  check(await fbText(m, "written on desktop"), "thread shows the breakpoint");
  check((await m.locator("preview-feedback .tb-inbox .cnt").innerText()) === "1", "inbox count updates");
  const stored = (await api(`/admin/sites/${SLUG}/export`)).comments[0];
  check(stored.anchor_dx > 0.15 && stored.anchor_dx < 0.35 && stored.anchor_dy > 0.2 && stored.anchor_dy < 0.8, `position inside the element is stored (dx ${stored.anchor_dx}, dy ${stored.anchor_dy})`);
  await snap(m, "01-pin-and-popover");
  const y0 = await m.evaluate(() => scrollY);
  await m.keyboard.press("Escape");
  check(await m.locator("preview-feedback .panel[hidden]").count(), "Escape closes the popover");
  await pins(m).first().click();
  check(await fbText(m, "Headline could be warmer."), "clicking the pin opens its thread");
  check((await m.evaluate(() => scrollY)) === y0, "clicking a visible pin does not scroll the page");

  // ---------------------------------------------------------------------------------------
  section("replies, resolve, reopen (Molly)");
  await m.locator("preview-feedback textarea").fill("Maybe 'Welcome home'?");
  await sr(m).getByRole("button", { name: "Reply", exact: true }).click();
  await waitText(m, "Welcome home");
  check((await m.locator("preview-feedback .msg").count()) === 2, "reply appears under the root");
  await headBtn(m, "Resolve").click();
  await m.locator("preview-feedback input[aria-label='Resolution note']").fill("Changed it");
  await sr(m).getByRole("button", { name: "Resolve thread" }).click();
  await waitText(m, "Resolved by Molly");
  check(await fbText(m, "Changed it"), "resolution note shown");
  check(!(await m.locator("preview-feedback textarea").count()), "no reply box while resolved");
  check(await fbText(m, "Reopen it to reply"), "explains why replying is off");
  await m.waitForFunction(() => document.querySelector("preview-feedback").shadowRoot.querySelectorAll(".pin:not(.pending)").length === 0);
  check(true, "a resolved thread's pin leaves the page");
  check((await m.locator("preview-feedback .tb-inbox .cnt").innerText()) === "0", "count drops to 0 when all are resolved");
  await m.locator("preview-feedback .tb-filter").click();
  check((await m.locator("preview-feedback .tb-filter").innerText()) === "Resolved", "toolbar filter switches to Resolved");
  await wait(250);
  check((await m.locator("preview-feedback .pin").count()) === 0, "even with Resolved on, a resolved thread has no pin");
  await toList(m);
  check((await m.locator("preview-feedback .num:not(.none)").count()) === 0, "and its inbox row carries no pin number");
  await m.locator("preview-feedback .row-btn").first().click();
  await waitText(m, "Resolved by Molly");
  check((await m.locator("preview-feedback .pin").count()) === 0, "opening it from the inbox draws no pin either");
  await snap(m, "02-resolved-no-pin");
  await m.locator("preview-feedback .tb-filter").click();
  await headBtn(m, "Reopen").click();
  await waitText(m, "Reopened by Molly");
  check(await m.locator("preview-feedback textarea").count(), "reply box is back after reopening");
  await m.waitForFunction(() => document.querySelector("preview-feedback").shadowRoot.querySelectorAll(".pin:not(.pending):not(.done)").length === 1);
  check(true, "its pin is back on the page");

  // ---------------------------------------------------------------------------------------
  section("anyone can resolve; delete is author-only (Daniel)");
  const daniel = await ctx();
  const d = await daniel.newPage();
  await d.goto(`${SITE}/`);
  await attach(d);
  await pins(d).first().click();
  await setName(d, "Daniel");
  check(!(await headBtn(d, "Delete thread").count()), "someone else cannot delete Molly's thread");
  await headBtn(d, "Resolve").click();
  await sr(d).getByRole("button", { name: "Resolve thread" }).click();
  await waitText(d, "Resolved by Daniel");
  check(true, "Daniel resolved Molly's thread");
  await headBtn(d, "Reopen").click();
  await waitText(d, "Reopened by Daniel");

  section("delete rule (Molly)");
  await m.reload();
  await attach(m);
  await m.waitForSelector("preview-feedback .msg");
  check(await fbText(m, "Headline could be warmer."), "popover and thread survive a reload");
  check(await headBtn(m, "Delete thread").count(), "author can delete while nobody else has posted (Daniel only resolved and reopened)");
  const rootId = (await api(`/admin/sites/${SLUG}/export`)).comments.find((c) => c.parent_id === null).id;
  await d.locator("preview-feedback textarea").fill("On it.");
  await sr(d).getByRole("button", { name: "Reply", exact: true }).click();
  await waitText(d, "On it.");
  await m.locator("preview-feedback .back").click();
  await m.locator("preview-feedback .row-btn").first().click();
  await waitText(m, "On it.");
  check(!(await headBtn(m, "Delete thread").count()), "no Delete once someone else has replied");
  const refused = await fetch(`${API}/sites/${SLUG}/threads/${rootId}`, { method: "DELETE", headers: { "x-site-key": siteKey, "x-author": "Molly" } });
  check(refused.status === 403, "the server refuses it too");
  await m.locator("preview-feedback .back").click();
  await sr(m).getByRole("button", { name: "Page comment" }).click();
  check(!(await fbText(m, "Pinned to")), "a page comment has no pin chip");
  await m.locator("preview-feedback textarea").fill("Typo, ignore me");
  await sr(m).getByRole("button", { name: "Send", exact: true }).click();
  await waitText(m, "Typo, ignore me");
  check((await pins(m).count()) === 1, "a page comment adds no pin");
  await headBtn(m, "Delete thread").click();
  check(await fbText(m, "can't be undone"), "asks to confirm");
  await sr(m).getByRole("button", { name: "Delete", exact: true }).click();
  await waitGone(m, "Typo, ignore me");
  check(true, "single-author thread deleted and gone from the list");

  // ---------------------------------------------------------------------------------------
  section("pins: fixed header, overlap, popover bounds");
  await m.keyboard.press("Escape");
  await placePin(m, "header a:nth-of-type(2)", "Add a Blog link?");
  const fixedBefore = await pins(m).filter({ hasText: "2" }).boundingBox();
  await m.evaluate(() => scrollTo(0, 500));
  await wait(150);
  const fixedAfter = await pins(m).filter({ hasText: "2" }).boundingBox();
  check(fixedBefore && fixedAfter && near(fixedBefore.y, fixedAfter.y, 1) && near(fixedBefore.x, fixedAfter.x, 1), "a pin on a fixed header stays put while the page scrolls");
  const hero = await pins(m).filter({ hasText: "1" }).boundingBox();
  check(hero && hero.y < 0, "a pin on scrolled content scrolls away with it");
  await m.evaluate(() => scrollTo(0, 0));
  for (const n of [1, 2]) {
    await postApi({ author: "Molly", body: `Stack ${n}`, page: "/", page_title: "Home", anchor_id: "about", anchor_path: "section > h2", anchor_text: "About us", anchor_dx: 0.5, anchor_dy: 0.5, viewport_w: 1280, viewport_h: 800 });
  }
  await m.locator("preview-feedback .tb-inbox").click();
  await m.locator("preview-feedback .back").click().catch(() => {});
  await m.reload(); await attach(m);
  await m.evaluate(() => scrollTo(0, 100));
  await wait(300);
  const xs = await m.locator("preview-feedback .pin:not(.pending)").evaluateAll((els) => els.map((e) => ({ t: e.textContent, x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y })));
  const stacked = xs.filter((p) => ["3", "4"].includes(p.t));
  check(stacked.length === 2 && Math.abs(stacked[0].x - stacked[1].x) >= 18, `two comments on the same spot get separate pins (${stacked.map((s) => Math.round(s.x)).join(" vs ")})`);
  await snap(m, "03-overlapping-pins");
  await m.evaluate(() => scrollTo(0, 0));
  const vw = 1280, vh = 800;
  await m.keyboard.press("Escape");
  await m.locator("preview-feedback .toolbar").getByRole("button", { name: "Add a comment" }).click();
  await m.mouse.click(vw - 20, vh / 2);
  const edge = await m.locator("preview-feedback .panel").boundingBox();
  check(edge.x >= 0 && edge.x + edge.width <= vw && edge.y >= 0 && edge.y + edge.height <= vh - 56, `a popover near the right edge stays on screen (${Math.round(edge.x)}..${Math.round(edge.x + edge.width)})`);
  await m.locator("preview-feedback").getByRole("button", { name: "Cancel" }).click();

  // ---------------------------------------------------------------------------------------
  section("opening a thread scrolls its pin into view");
  await m.evaluate(() => scrollTo(0, 0));
  const deepRes = await (await postApi({ author: "Molly", body: "Deep note.", page: "/", page_title: "Home", anchor_id: "deep", anchor_path: "section > h2", anchor_text: "Deep section", anchor_dx: 0.1, anchor_dy: 0.5, viewport_w: 1280, viewport_h: 800 })).json();
  await m.reload(); await attach(m);
  await toList(m);
  check((await m.evaluate(() => scrollY)) === 0, "page starts at the top");
  await m.locator("preview-feedback .row-btn", { hasText: "Deep note." }).click();
  await m.waitForFunction(() => scrollY > 500, null, { timeout: 5000 });
  const yAfter = await settled(m);
  const sel = await m.locator("preview-feedback .pin.selected").boundingBox();
  check(sel && sel.y > 60 && sel.y + 28 < 800 - 100, `the thread's pin was scrolled into the comfortable part of the screen (pin at y ${Math.round(sel?.y ?? -1)})`);
  const popDeep = await m.locator("preview-feedback .panel").boundingBox();
  check(popDeep.y >= 0 && popDeep.y + popDeep.height <= 800, "and its popover followed it and is fully on screen");
  await m.locator("preview-feedback .back").click();
  await m.locator("preview-feedback .row-btn", { hasText: "Deep note." }).click();
  await wait(600);
  check((await settled(m)) === yAfter, "opening a thread whose pin is already on screen does not move the page");
  await m.keyboard.press("Escape");
  await m.evaluate(() => scrollTo(0, 0));
  await m.goto(`${SITE}/?fb=${deepRes.comment.id}`);
  await attach(m);
  await m.waitForFunction(() => scrollY > 500, null, { timeout: 5000 });
  await settled(m);
  const sel2 = await m.locator("preview-feedback .pin.selected").boundingBox();
  check(sel2 && sel2.y > 60 && sel2.y + 28 < 800 - 100, "a deep link to a thread scrolls its pin into view on arrival");
  await m.evaluate(() => scrollTo(0, 0));
  await m.keyboard.press("Escape");

  // ---------------------------------------------------------------------------------------
  section("inbox across pages (Molly)");
  for (const [path, text, pin] of [["/services/", "Services need prices.", "main h2"], ["/faq/", "Add a question about cost.", null]]) {
    await m.goto(`${SITE}${path}`);
    await attach(m);
    if (pin) await placePin(m, pin, text);
    else {
      await toList(m);
      await sr(m).getByRole("button", { name: "Page comment" }).click();
      await m.locator("preview-feedback textarea").fill(text);
      await sr(m).getByRole("button", { name: "Send", exact: true }).click();
      await waitText(m, text);
    }
  }
  await m.goto(`${SITE}/`);
  await attach(m);
  await toList(m);
  await m.locator("preview-feedback .tab", { hasText: "All pages" }).click();
  const heads = await m.locator("preview-feedback .group h3").evaluateAll((els) => els.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()));
  check(heads.join(",") === "Home,Services,FAQ", `pages listed in nav order (got ${heads.join(" | ")})`);
  check((await m.locator("preview-feedback .here").count()) === 1, "current page is marked");
  const openAll = await m.locator("preview-feedback .tab").nth(1).innerText();
  check(/\((\d+)\)/.exec(openAll)?.[1] === "7", `All pages counts open threads site-wide (${openAll})`);
  await snap(m, "04-inbox-all");
  const nums = await m.locator("preview-feedback .group").first().locator(".num:not(.none)").allInnerTexts();
  check(nums.length >= 1 && nums[0] === "1", "inbox rows on this page carry their pin numbers");
  await m.locator("preview-feedback .row-btn", { hasText: "Services need prices." }).click();
  await m.waitForURL(/\/services\/$/);
  check(!m.url().includes("fb="), "?fb= is stripped from the URL after landing");
  await m.waitForSelector("preview-feedback .msg");
  check(await fbText(m, "Services need prices."), "opened the thread on the other page");
  await wait(500);
  check((await pins(m).count()) === 1, "its pin is on the page");
  const pinBox = await pins(m).first().boundingBox();
  const popBox = await m.locator("preview-feedback .panel").boundingBox();
  check(popBox.x > pinBox.x, "thread popover is beside the pin");
  await snap(m, "05-cross-page");

  section("deep link and a changed page");
  const rows = (await api(`/admin/sites/${SLUG}/export`)).comments;
  const svc = rows.find((c) => c.body === "Services need prices.");
  await m.goto(`${SITE}/services/?nosection=1&fb=${svc.id}`);
  await m.waitForSelector("preview-feedback .msg");
  check(await fbText(m, "Services need prices."), "?fb= deep link opens the thread");
  check(await fbText(m, "This spot on the page has changed"), "names it when its spot is gone");
  check((await pins(m).count()) === 0, "and draws no pin for it");
  const other = await ctx();
  const o = await other.newPage();
  await o.goto(`${SITE}/faq/?fb=${rows.find((c) => c.body.startsWith("Add a question")).id}`);
  await o.waitForSelector("preview-feedback .msg");
  check(await fbText(o, "Add a question about cost."), "a stranger's deep link works with no storage");
  check(!(await fbText(o, "This spot on the page has changed")), "a page comment never warns about its spot");

  section("resolved elsewhere removes the pin here");
  await m.goto(`${SITE}/`);
  await attach(m);
  await m.waitForSelector("preview-feedback .pin");
  const live = (await api(`/admin/sites/${SLUG}/export`)).comments.find((c) => c.parent_id === null && c.status === "open" && c.page === "/" && c.body === "Add a Blog link?");
  const beforeN = await pins(m).count();
  await api(`/admin/sites/${SLUG}/threads/${live.id}/resolve`, { method: "POST", body: JSON.stringify({ note: "Blog link added" }) });
  await m.locator("preview-feedback .tb-inbox").click(); // opening the inbox refreshes, like coming back to the tab
  await m.waitForFunction((n) => document.querySelector("preview-feedback").shadowRoot.querySelectorAll(".pin:not(.pending)").length === n, beforeN - 1);
  check(true, "a thread resolved by someone else loses its pin here");
  await m.keyboard.press("Escape");

  section("resolved filter and states");
  await m.goto(`${SITE}/`);
  await attach(m);
  await api(`/admin/sites/${SLUG}/threads/${rootId}/resolve`, { method: "POST", body: JSON.stringify({ note: "done" }) });
  await m.reload();
  await attach(m);
  await toList(m);
  await m.locator("preview-feedback .tab", { hasText: "All pages" }).click();
  await m.locator("preview-feedback .seg button", { hasText: "Resolved" }).click();
  check(await fbText(m, "Resolved by admin"), "resolved filter shows resolved threads with who resolved them");
  check((await m.locator("preview-feedback .row-btn", { hasText: "Services need prices." }).count()) === 0, "open threads are hidden under Resolved");

  section("gate and hide");
  await m.evaluate(() => document.documentElement.classList.add("gated"));
  await wait(120);
  check(await m.evaluate(() => getComputedStyle(document.querySelector("preview-feedback")).display === "none"), "everything is hidden while gated");
  await m.evaluate(() => document.documentElement.classList.remove("gated"));
  await m.locator("preview-feedback .tb-filter").click(); // back to Open
  await m.locator("preview-feedback .tb-hide").click();
  await wait(100);
  check((await m.locator("preview-feedback .pins[hidden]").count()) === 1 && (await m.locator("preview-feedback .panel[hidden]").count()) === 1, "the eye button hides pins and the popover");
  await m.locator("preview-feedback .tb-hide").click();

  // ---------------------------------------------------------------------------------------
  section("served script and declarative element");
  const script = await fetch(`${API}/v1/widget.js`);
  check(script.status === 200 && /javascript/.test(script.headers.get("content-type") ?? ""), `the Worker serves the built widget at /v1/widget.js (${script.status}, ${script.headers.get("content-type")})`);
  check((await script.text()).includes("preview-feedback"), "and it is the real bundle");
  const robots = await fetch(`${API}/robots.txt`);
  check(robots.status === 200 && (await robots.text()).includes("Disallow: /"), "the API host asks not to be indexed");
  const dctx = await ctx();
  const dp = await dctx.newPage();
  const warns = [];
  dp.on("console", (c) => c.type() === "warning" && warns.push(c.text()));
  const derrors = [];
  dp.on("pageerror", (e) => derrors.push(e.message));
  await dp.goto(`${SITE}/declarative/`);
  await attach(dp);
  check(await dp.evaluate(() => typeof PreviewFeedback.mount === "function" && !!customElements.get("preview-feedback")), "loading the script registers <preview-feedback> and a global");
  check(/^\d+$/.test(await dp.locator("preview-feedback .tb-inbox .cnt").innerText()), "a plain element with attributes mounts and reaches the API");
  await dp.locator("preview-feedback .toolbar").getByRole("button", { name: "Add a comment" }).click();
  check(await dp.locator("preview-feedback .bar:not([hidden])").count(), "comment mode is on");
  check(await dp.evaluate(() => [...document.head.querySelectorAll("style")].some((s) => s.textContent.includes("crosshair"))), "and it has put a cursor style on the page");

  // Removing the element must undo everything it registered on the page.
  await dp.evaluate(() => document.querySelector("preview-feedback").remove());
  check(await dp.evaluate(() => ![...document.head.querySelectorAll("style")].some((s) => s.textContent.includes("crosshair"))), "removing it removes the cursor style");
  await dp.click("#probe");
  check((await dp.evaluate(() => location.hash)) === "#probe", "and its click interception: a link click is no longer swallowed");
  await dp.evaluate(() => { scrollTo(0, 50); dispatchEvent(new Event("resize")); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  await wait(100);
  check(derrors.length === 0, `scroll, resize and keys after removal run no leftover handlers (${derrors.join(" | ") || "no errors"})`);

  // Putting one back mounts again, from properties instead of attributes.
  await dp.evaluate(([endpoint, slug, siteKey]) => { const el = document.createElement("preview-feedback"); el.config = { endpoint, slug, siteKey }; document.body.append(el); }, [API, SLUG, siteKey]);
  await attach(dp);
  check(true, "a new element given its config as properties mounts");

  // Changing config remounts against the new value.
  const unknownSite = () => dp.waitForFunction(() => document.querySelector("preview-feedback").shadowRoot.textContent.includes("unknown site"), null, { timeout: 5000 });
  const siteOk = () => dp.waitForFunction(() => { const t = document.querySelector("preview-feedback").shadowRoot.textContent; return t.includes("All pages") && !t.includes("unknown site"); }, null, { timeout: 5000 });
  await dp.evaluate(() => { const el = document.querySelector("preview-feedback"); el.config = { ...el.config, slug: "no-such-site" }; });
  await wait(300);
  await dp.locator("preview-feedback .tb-inbox").click();
  await unknownSite();
  check(true, "changing config remounts it against the new site (an unknown one says so)");
  await dp.evaluate(([slug]) => { const el = document.querySelector("preview-feedback"); el.config = { ...el.config, slug }; }, [SLUG]);
  await siteOk();
  check(true, "and changing it back recovers");

  // A purely declarative element: attributes alone, and changing one remounts.
  await dp.evaluate(([endpoint, slug, key]) => {
    document.querySelector("preview-feedback").remove();
    const el = document.createElement("preview-feedback");
    el.setAttribute("endpoint", endpoint); el.setAttribute("slug", slug); el.setAttribute("site-key", key);
    document.body.append(el);
  }, [API, SLUG, siteKey]);
  await attach(dp);
  await dp.locator("preview-feedback .tb-inbox").click().catch(() => {});
  await siteOk().catch(async () => { await dp.locator("preview-feedback .tb-inbox").click(); await siteOk(); });
  check(true, "an element built with attributes only mounts, three attributes causing one mount");
  await dp.evaluate(() => document.querySelector("preview-feedback").setAttribute("slug", "no-such-site"));
  await wait(300);
  await unknownSite().catch(async () => { await dp.locator("preview-feedback .tb-inbox").click(); await unknownSite(); });
  check(true, "changing the slug attribute remounts it");
  await dp.evaluate(([slug]) => document.querySelector("preview-feedback").setAttribute("slug", slug), [SLUG]);
  await siteOk();
  check(true, "and changing the attribute back recovers");

  // Misuse is loud, not silent and not broken.
  await dp.evaluate(() => { document.body.append(document.createElement("preview-feedback")); });
  await wait(150);
  check(warns.some((w) => /already on this page/.test(w)) || warns.some((w) => /needs endpoint/.test(w)), `a second element is refused with a console warning (${warns.at(-1) ?? "none"})`);
  check(await dp.evaluate(() => [...document.querySelectorAll("preview-feedback")].filter((e) => (e.shadowRoot?.querySelector("#fb")?.childElementCount ?? 0) > 0).length === 1), "so only one widget is ever drawn");
  await dp.evaluate(() => { document.querySelector("preview-feedback").remove(); const e = document.createElement("preview-feedback"); e.setAttribute("endpoint", "http://x"); document.body.append(e); });
  await wait(150);
  check(warns.some((w) => /needs endpoint, slug and site-key/.test(w)), "an element missing attributes says what it needs and mounts nothing");
  await dctx.close();

  // ---------------------------------------------------------------------------------------
  section("movable toolbar (fresh browser)");
  const fresh = await ctx();
  const t = await fresh.newPage();
  await t.goto(`${SITE}/`);
  await attach(t);
  const rect = async () => t.locator("preview-feedback .toolbar").boundingBox();
  const dragBy = async (locator, dx, dy) => {
    const b = await locator.boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await t.mouse.move(x, y); await t.mouse.down();
    await t.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
    await t.mouse.move(x + dx, y + dy, { steps: 5 });
    await t.mouse.up();
  };
  const grip = t.locator("preview-feedback .tb-grip");
  const isVert = async () => (await t.locator("preview-feedback .toolbar.vertical").count()) === 1;
  const r0 = await rect();
  await dragBy(grip, -250, -300);
  const r1 = await rect();
  check(near(r1.x, r0.x - 250, 3) && near(r1.y, r0.y - 300, 3), `dragging the grip moves the toolbar anywhere (${Math.round(r0.x)},${Math.round(r0.y)} to ${Math.round(r1.x)},${Math.round(r1.y)})`);
  check((await t.locator("preview-feedback .panel[hidden]").count()) === 1, "a drag does not click the buttons");
  check(!(await isVert()), "dropped in the open, it stays horizontal");

  // Against a side edge it stands up, keeping the edge it was against.
  await dragBy(grip, -5000, -5000);
  const rCorner = await rect();
  check(rCorner.x >= 15 && rCorner.y >= 15, `it cannot be dragged off the screen (${Math.round(rCorner.x)},${Math.round(rCorner.y)})`);
  check((await isVert()) && rCorner.height > rCorner.width * 3, `dropped in a corner it stands up (${Math.round(rCorner.width)}x${Math.round(rCorner.height)})`);
  check(near(rCorner.x, 16, 2), "and keeps hugging the left edge as it turns");
  await t.reload(); await attach(t);
  const rBack = await rect();
  check((await isVert()) && near(rBack.x, rCorner.x, 2) && near(rBack.y, rCorner.y, 2), "orientation and place are remembered across a reload");
  await t.locator("preview-feedback .tb-inbox").click();
  const pSide = await t.locator("preview-feedback .panel").boundingBox();
  check(pSide.x >= rBack.x + rBack.width, `from the left edge the inbox opens to the right of it (${Math.round(pSide.x)} >= ${Math.round(rBack.x + rBack.width)})`);
  await snap(t, "08-toolbar-vertical");
  await t.keyboard.press("Escape");

  // Dragged inward it stays vertical; only an edge changes it.
  await dragBy(grip, 400, 150);
  const rIn = await rect();
  check((await isVert()) && near(rIn.x, rBack.x + 400, 3), "dragged into the open it stays vertical");
  await dragBy(grip, 3000, 0);
  const rRight = await rect();
  check((await isVert()) && near(rRight.x + rRight.width, 1280 - 16, 2), "dropped on the right edge it stays vertical there");
  await t.locator("preview-feedback .tb-inbox").click();
  const pLeftOf = await t.locator("preview-feedback .panel").boundingBox();
  check(pLeftOf.x + pLeftOf.width <= rRight.x, "from the right edge the inbox opens to the left of it");
  await t.keyboard.press("Escape");

  // Against the bottom it lies down again, keeping the bottom gap.
  await dragBy(grip, -600, 3000);
  const rBottom = await rect();
  check(!(await isVert()) && rBottom.width > 200 && near(rBottom.y + rBottom.height, 800 - 16, 2), `dropped on the bottom it lies down there (${Math.round(rBottom.width)}x${Math.round(rBottom.height)})`);
  await dragBy(grip, 0, -3000);
  check(!(await isVert()), "and stays horizontal along the top");
  await t.locator("preview-feedback .tb-inbox").click();
  const pTop = await t.locator("preview-feedback .panel").boundingBox();
  const tbTop = await rect();
  check(pTop.y >= tbTop.y + tbTop.height, `along the top the inbox opens below the toolbar (panel top ${Math.round(pTop.y)}, toolbar bottom ${Math.round(tbTop.y + tbTop.height)})`);
  await snap(t, "08b-toolbar-top");
  await t.keyboard.press("Escape");
  await dragBy(grip, 0, 620);
  await t.locator("preview-feedback .tb-inbox").click();
  const pLow = await t.locator("preview-feedback .panel").boundingBox();
  const tbLow = await rect();
  check(pLow.y + pLow.height <= tbLow.y, "in the lower half it opens above the toolbar");
  check(pLow.x >= 0 && pLow.x + pLow.width <= 1280, "and stays on screen sideways");
  await t.keyboard.press("Escape");

  const before = await rect();
  await t.locator("preview-feedback .tb-min").click();
  const bub = await rect();
  check(near(bub.width, 48, 2) && near(bub.height, 48, 2), `minimize collapses it to a 48px bubble (${Math.round(bub.width)}x${Math.round(bub.height)})`);
  check(near(bub.x + bub.width / 2, before.x + before.width / 2, 3) && near(bub.y + bub.height / 2, before.y + before.height / 2, 3), "the bubble appears where the pill's centre was");
  check((await t.locator("preview-feedback .bcnt").innerText()) === (await api(`/admin/sites/${SLUG}/export`)).comments.filter((c) => c.parent_id === null && c.status === "open").length + "", "the bubble badge shows the open count");
  await snap(t, "09-bubble");
  await dragBy(t.locator("preview-feedback .bubble"), 200, -150);
  const moved = await rect();
  check(near(moved.x, bub.x + 200, 3) && near(moved.y, bub.y - 150, 3), "the bubble drags too");
  check((await t.locator("preview-feedback .toolbar.collapsed").count()) === 1, "and a drag does not expand it");
  await t.reload(); await attach(t);
  check((await t.locator("preview-feedback .toolbar.collapsed").count()) === 1, "it stays collapsed after a reload");
  const bub2 = await rect();
  check(near(bub2.x, moved.x, 2) && near(bub2.y, moved.y, 2), "at the same place");
  await t.locator("preview-feedback .bubble").click();
  const expanded = await rect();
  const clampX = (x, w) => Math.min(Math.max(x, 16), 1280 - w - 16);
  const clampY = (y, h) => Math.min(Math.max(y, 16), 800 - h - 16);
  const wantX = clampX(bub2.x + bub2.width / 2 - expanded.width / 2, expanded.width);
  const wantY = clampY(bub2.y + bub2.height / 2 - expanded.height / 2, expanded.height);
  check(expanded.width > 200 && near(expanded.x, wantX, 3) && near(expanded.y, wantY, 3), `clicking the bubble expands it around the same centre, kept inside the margin (got ${Math.round(expanded.x)},${Math.round(expanded.y)}, want ${Math.round(wantX)},${Math.round(wantY)})`);
  const k0 = await rect();
  await t.locator("preview-feedback .tb-grip").focus();
  await t.keyboard.press("ArrowRight");
  await t.keyboard.press("ArrowDown");
  const k1 = await rect();
  check(near(k1.x, clampX(k0.x + 24, k0.width), 2) && near(k1.y, clampY(k0.y + 24, k0.height), 2), `arrow keys on the grip move it 24px (${Math.round(k0.x)},${Math.round(k0.y)} to ${Math.round(k1.x)},${Math.round(k1.y)})`);
  await t.setViewportSize({ width: 600, height: 500 });
  await wait(200);
  const small = await rect();
  check(small.x >= 15 && small.y >= 15 && small.x + small.width <= 600 - 15 && small.y + small.height <= 500 - 15, `shrinking the window keeps it on screen (${Math.round(small.x)}..${Math.round(small.x + small.width)} of 600)`);

  // ---------------------------------------------------------------------------------------
  section("phone (390px)");
  const phone = await ctx({ width: 390, height: 800 }, true);
  const p = await phone.newPage();
  await p.goto(`${SITE}/`);
  await attach(p);
  const ptb = await p.locator("preview-feedback .toolbar").boundingBox();
  check(ptb && ptb.x >= 0 && ptb.x + ptb.width <= 390, `toolbar fits the screen (${Math.round(ptb.width)}px wide)`);
  check(!(await p.locator("preview-feedback .tb .lbl").first().isVisible()), "toolbar labels collapse to icons");
  await pins(p).first().waitFor({ state: "attached", timeout: 5000 }).catch(() => {}); // the first fetch and layout take a moment
  check((await pins(p).count()) >= 1, "pins are drawn on the phone too");
  await p.locator("preview-feedback .tb-inbox").tap();
  const box = await p.locator("preview-feedback .panel").boundingBox();
  check(box && near(box.width, 390, 2) && near(box.y + box.height, 800, 2), "the panel is a bottom sheet the full width of the screen");
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no horizontal scroll");
  await p.locator("preview-feedback .tab", { hasText: "This page" }).tap();
  check(await fbText(p, "not visible at this width") || true, "(row notes checked below)");
  await snap(p, "06-phone-inbox");
  await postApi({ author: "Molly", body: "Promo copy is long.", page: "/", page_title: "Home", anchor_id: "promo", anchor_path: "section > h2", anchor_text: "Desktop promo", anchor_dx: 0.2, anchor_dy: 0.5, viewport_w: 1280, viewport_h: 800 });
  await p.reload(); await attach(p); await toList(p);
  check(await fbText(p, "not visible at this width"), "a desktop-only spot is named in the inbox on a phone");
  await p.locator("preview-feedback .row-btn", { hasText: "Promo copy is long." }).tap();
  await p.waitForSelector("preview-feedback .msg");
  check(await fbText(p, "isn't visible at this screen width"), "and in its thread, with no pin drawn");
  await snap(p, "07-phone-thread");
  check(await p.locator("preview-feedback .back").count(), "thread view has a back arrow");

  check(errors.length === 0, `no console or page errors (${errors.join(" | ") || "none"})`);
} catch (e) {
  results.push({ ok: false, name: `${currentName}: threw ${e.message.split("\n").slice(0, 4).join(" / ")} @ ${(e.stack.match(/run.mjs:(\d+)/) ?? [])[1]}` });
} finally {
  await browser.close();
  server.close();
  wrangler.kill();
  await wait(300);
  rmSync(tmp, { recursive: true, force: true });
}

let failed = 0;
for (const r of results) { if (!r.ok) failed++; console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}`); }
console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${shots}`);
process.exit(failed ? 1 : 0);
