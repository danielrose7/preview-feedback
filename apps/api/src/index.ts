import { FeedbackSite } from "./site";
import type { Fail } from "./site";
import { MAX_BODY_BYTES, originAllowed, parseComment, parseName, parseNote, validSlug } from "./validate";

export { FeedbackSite };

interface Env {
  FEEDBACK_SITE: DurableObjectNamespace<FeedbackSite>;
  ALLOWED_ORIGINS: string;
  ADMIN_TOKEN?: string;
}

const HEADERS = "content-type, x-site-key, x-author";

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...cors },
  });
}

/** One place that turns a refusal from the Durable Object into an HTTP answer. */
function refuse(reason: Fail | "not_found" | "forbidden", cors: Record<string, string>): Response {
  switch (reason) {
    case "unregistered": return json({ error: "unknown site" }, 404, cors);
    case "key": return json({ error: "bad site key" }, 401, cors);
    case "rate": return json({ error: "too many comments, try later" }, 429, cors);
    case "cap": return json({ error: "comment limit reached" }, 429, cors);
    case "no_parent":
    case "not_found": return json({ error: "thread not found" }, 404, cors);
    case "reply_to_reply": return json({ error: "replies cannot have replies" }, 400, cors);
    case "resolved": return json({ error: "thread is resolved; reopen it to reply" }, 409, cors);
    case "forbidden": return json({ error: "only the author can delete a thread nobody else has replied to" }, 403, cors);
  }
}

/** Names travel in a header percent-encoded (headers cannot carry non-ASCII); a bad escape reads as empty. */
function decodeHeader(v: string | null): string {
  try {
    return decodeURIComponent(v ?? "");
  } catch {
    return "";
  }
}

async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; res: Response }> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { ok: false, res: json({ error: "body too large" }, 413, {}) };
  try {
    return { ok: true, value: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, res: json({ error: "invalid JSON" }, 400, {}) };
  }
}

function corsFor(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !originAllowed(origin, env.ALLOWED_ORIGINS)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": HEADERS,
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    vary: "origin",
  };
}

async function rateKey(req: Request): Promise<string> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${day}`));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isAdmin(req: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) return false;
  return req.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsFor(req, env);
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: cors["access-control-allow-origin"] ? 204 : 403, headers: cors });
    }

    // Browser routes: /sites/:slug/comments. Cross-origin calls from unknown origins are refused.
    if (parts[0] === "sites" && parts[2] === "comments" && parts.length === 3) {
      const slug = parts[1]!;
      if (!validSlug(slug)) return json({ error: "bad slug" }, 400, cors);
      if (req.headers.get("origin") && !cors["access-control-allow-origin"]) {
        return json({ error: "origin not allowed" }, 403, {});
      }
      const key = req.headers.get("x-site-key") ?? "";
      const stub = env.FEEDBACK_SITE.get(env.FEEDBACK_SITE.idFromName(slug));

      if (req.method === "GET") {
        const res = await stub.list(key, url.searchParams.get("page"));
        return typeof res === "string" ? refuse(res, cors) : json({ comments: res }, 200, cors);
      }

      if (req.method === "POST") {
        const body = await readJson(req);
        if (!body.ok) return body.res;
        const parsed = parseComment(body.value);
        if (!parsed.ok) return json({ error: parsed.error }, 400, cors);
        const res = await stub.add(key, parsed.value, await rateKey(req));
        return res.ok ? json({ comment: res.comment }, 201, cors) : refuse(res.reason, cors);
      }
      return json({ error: "method not allowed" }, 405, cors);
    }

    // Browser thread routes: POST /sites/:slug/threads/:id/(resolve|reopen), DELETE /sites/:slug/threads/:id
    if (parts[0] === "sites" && parts[2] === "threads" && parts[3] && (parts.length === 4 || parts.length === 5)) {
      const slug = parts[1]!;
      const id = Number(parts[3]);
      if (!validSlug(slug)) return json({ error: "bad slug" }, 400, cors);
      if (!Number.isInteger(id) || id < 1) return json({ error: "bad id" }, 400, cors);
      if (req.headers.get("origin") && !cors["access-control-allow-origin"]) {
        return json({ error: "origin not allowed" }, 403, {});
      }
      const key = req.headers.get("x-site-key") ?? "";
      const stub = env.FEEDBACK_SITE.get(env.FEEDBACK_SITE.idFromName(slug));

      if (req.method === "DELETE" && parts.length === 4) {
        const res = await stub.deleteThread(key, id, decodeHeader(req.headers.get("x-author")));
        return res.ok ? json({ deleted: id }, 200, cors) : refuse(res.reason, cors);
      }
      if (req.method === "POST" && parts.length === 5 && (parts[4] === "resolve" || parts[4] === "reopen")) {
        const body = await readJson(req);
        if (!body.ok) return body.res;
        const b = (body.value ?? {}) as Record<string, unknown>;
        const by = parseName(b.by);
        if (!by) return json({ error: "by is required" }, 400, cors);
        const res = parts[4] === "resolve" ? await stub.resolve(key, id, by, parseNote(b.note)) : await stub.reopen(key, id, by);
        return res.ok ? json({ comment: res.comment }, 200, cors) : refuse(res.reason, cors);
      }
      return json({ error: "method not allowed" }, 405, cors);
    }

    // Admin routes (no CORS: used from the CLI, not the browser).
    if (parts[0] === "admin" && parts[1] === "sites" && parts[2]) {
      if (!isAdmin(req, env)) return json({ error: "unauthorized" }, 401, {});
      const slug = parts[2];
      if (!validSlug(slug)) return json({ error: "bad slug" }, 400, {});
      const stub = env.FEEDBACK_SITE.get(env.FEEDBACK_SITE.idFromName(slug));

      // POST /admin/sites/:slug -> register or rotate the site key
      if (parts.length === 3 && req.method === "POST") {
        return json({ slug, siteKey: await stub.register() }, 200, {});
      }
      // POST /admin/sites/:slug/comments -> reply as the admin (author defaults to "Daniel")
      if (parts.length === 4 && parts[3] === "comments" && req.method === "POST") {
        const body = await readJson(req);
        if (!body.ok) return body.res;
        const raw = { author: "Daniel", ...(body.value as object) };
        const parsed = parseComment(raw);
        if (!parsed.ok) return json({ error: parsed.error }, 400, {});
        if (parsed.value.parent_id === null) return json({ error: "admin comments must be replies (parent_id)" }, 400, {});
        const res = await stub.addAsAdmin(parsed.value);
        return res.ok ? json({ comment: res.comment }, 201, {}) : refuse(res.reason, {});
      }
      // POST /admin/sites/:slug/threads/:id/(resolve|reopen)
      if (parts.length === 6 && parts[3] === "threads" && req.method === "POST" && (parts[5] === "resolve" || parts[5] === "reopen")) {
        const id = Number(parts[4]);
        if (!Number.isInteger(id) || id < 1) return json({ error: "bad id" }, 400, {});
        const body = await readJson(req);
        if (!body.ok) return body.res;
        const note = parseNote(((body.value ?? {}) as Record<string, unknown>).note);
        const res = parts[5] === "resolve" ? await stub.resolveAsAdmin(id, note) : await stub.reopenAsAdmin(id);
        return res.ok ? json({ comment: res.comment }, 200, {}) : refuse(res.reason, {});
      }
      // GET /admin/sites/:slug/export
      if (parts.length === 4 && parts[3] === "export" && req.method === "GET") {
        return json({ slug, comments: await stub.exportAll() }, 200, {});
      }
      // DELETE /admin/sites/:slug/comments/:id
      if (parts.length === 5 && parts[3] === "comments" && req.method === "DELETE") {
        const id = Number(parts[4]);
        if (!Number.isInteger(id)) return json({ error: "bad id" }, 400, {});
        return (await stub.remove(id)) ? json({ deleted: id }, 200, {}) : json({ error: "not found" }, 404, {});
      }
    }

    return json({ error: "not found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
