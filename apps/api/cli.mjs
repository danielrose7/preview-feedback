#!/usr/bin/env node
// pnpm feedback register <slug>          create (or rotate) the site key, print it once
// pnpm feedback pull <slug> [--open] [--out file]   export to .work/feedback/<slug>.json and summarise threads
// pnpm feedback reply <slug> <id> <text> [--as Name]  reply to a thread (default author: Daniel)
// pnpm feedback resolve <slug> <id> [note]           resolve a thread, with an optional note
// pnpm feedback reopen <slug> <id>                   reopen a resolved thread
// pnpm feedback delete <slug> <id>                   hard-delete a thread (and its replies), or one reply
//
// FEEDBACK_ENDPOINT     Worker origin (default http://localhost:8787)
// FEEDBACK_ADMIN_TOKEN  the Worker's ADMIN_TOKEN secret. Never commit it.
// FEEDBACK_PREVIEW_URL  the preview's origin, e.g. https://abc.pages.dev; adds a deep link per thread
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const endpoint = (process.env.FEEDBACK_ENDPOINT ?? "http://localhost:8787").replace(/\/$/, "");
const token = process.env.FEEDBACK_ADMIN_TOKEN;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// pnpm runs scripts from the package dir; relative paths should resolve from where the user ran it.
const cwd = process.env.INIT_CWD ?? process.cwd();

function die(msg) {
  console.error(msg);
  process.exit(1);
}

async function call(path, init = {}) {
  if (!token) die("Set FEEDBACK_ADMIN_TOKEN (the Worker's ADMIN_TOKEN secret).");
  let res;
  try {
    res = await fetch(`${endpoint}${path}`, { ...init, headers: { authorization: `Bearer ${token}` } });
  } catch (e) {
    die(`Could not reach ${endpoint}: ${e.message}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`${res.status} ${body.error ?? res.statusText}`);
  return body;
}

function bp(w) {
  return !w ? "" : w < 640 ? "phone" : w < 1024 ? "tablet" : "desktop";
}

function summarise(slug, comments, onlyOpen) {
  const roots = comments.filter((c) => c.parent_id === null && (!onlyOpen || c.status === "open"));
  const open = roots.filter((r) => r.status === "open").length;
  if (!roots.length) return `${slug}: no ${onlyOpen ? "open " : ""}threads.`;
  const base = (process.env.FEEDBACK_PREVIEW_URL ?? "").replace(/\/$/, "");
  const lines = [`${slug}: ${roots.length} thread${roots.length === 1 ? "" : "s"} (${open} open)`];
  for (const [page, rows] of Map.groupBy(roots, (r) => r.page)) {
    lines.push("", `${rows[0].page_title ? `${rows[0].page_title}  ` : ""}${page}`);
    for (const r of rows) {
      const where = r.anchor_id ? `[${r.anchor_id}${r.anchor_text ? `: “${r.anchor_text.slice(0, 40)}”` : ""}]` : "[general]";
      const state = r.status === "resolved" ? ` ✓ resolved by ${r.resolved_by}${r.resolution_note ? `: ${r.resolution_note}` : ""}` : "";
      lines.push(`  #${r.id} ${r.author} ${[bp(r.viewport_w)].filter(Boolean).join("")} ${where}${state}`.replace(/ +/g, " "), `     ${r.body.replace(/\n+/g, " ")}`);
      for (const c of comments.filter((x) => x.parent_id === r.id)) lines.push(`       ↳ ${c.author}: ${c.body.replace(/\n+/g, " ")}`);
      if (base) lines.push(`     ${base}${r.page}${r.page.includes("?") ? "&" : "?"}fb=${r.id}`);
    }
  }
  return lines.join("\n");
}

const [cmd, slug, ...rest] = process.argv.slice(2);
if (!cmd || !slug) die("usage: pnpm feedback <register|pull|reply|resolve|reopen|delete> <slug> [...]");

if (cmd === "register") {
  const { siteKey } = await call(`/admin/sites/${slug}`, { method: "POST" });
  console.log(`Site key for ${slug} (shown once; registering again rotates it and revokes this one):\n`);
  console.log(`  FEEDBACK_KEY=${siteKey}\n`);
  console.log(`Build the preview with FEEDBACK_KEY set and FEEDBACK_ENDPOINT=${endpoint}.`);
} else if (cmd === "pull") {
  const i = rest.indexOf("--out");
  const out = i >= 0 ? resolve(cwd, rest[i + 1] ?? die("--out needs a path")) : resolve(repoRoot, ".work/feedback", `${slug}.json`);
  const onlyOpen = rest.includes("--open");
  const data = await call(`/admin/sites/${slug}/export`);
  if (onlyOpen) {
    const keep = new Set(data.comments.filter((c) => c.parent_id === null && c.status === "open").map((c) => c.id));
    data.comments = data.comments.filter((c) => keep.has(c.id) || keep.has(c.parent_id));
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(data, null, 2) + "\n");
  console.log(summarise(slug, data.comments, onlyOpen));
  console.log(`\nWrote ${out}`);
} else if (cmd === "reply") {
  const [id, ...words] = rest;
  const asAt = words.indexOf("--as");
  const author = asAt >= 0 ? words.splice(asAt, 2)[1] ?? die("--as needs a name") : "Daniel";
  const text = words.join(" ").trim();
  if (!id || !text) die("usage: pnpm feedback reply <slug> <id> <text> [--as Name]");
  const { comment } = await call(`/admin/sites/${slug}/comments`, { method: "POST", body: JSON.stringify({ parent_id: Number(id), body: text, author }) });
  console.log(`Replied to #${id} as ${comment.author} (#${comment.id}).`);
} else if (cmd === "resolve") {
  const [id, ...note] = rest;
  if (!id) die("usage: pnpm feedback resolve <slug> <id> [note]");
  await call(`/admin/sites/${slug}/threads/${id}/resolve`, { method: "POST", body: JSON.stringify({ note: note.join(" ") || null }) });
  console.log(`Resolved #${id}.`);
} else if (cmd === "reopen") {
  const id = rest[0] ?? die("usage: pnpm feedback reopen <slug> <id>");
  await call(`/admin/sites/${slug}/threads/${id}/reopen`, { method: "POST", body: "{}" });
  console.log(`Reopened #${id}.`);
} else if (cmd === "delete") {
  const id = rest[0] ?? die("usage: pnpm feedback delete <slug> <id>");
  await call(`/admin/sites/${slug}/comments/${id}`, { method: "DELETE" });
  console.log(`Deleted #${id} from ${slug}.`);
} else {
  die(`unknown command: ${cmd}`);
}
