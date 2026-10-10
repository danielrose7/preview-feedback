import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const worker = (exports as unknown as { default: Fetcher }).default;
const ORIGIN = "http://localhost:4321";
const admin = { authorization: "Bearer test-admin" };
let n = 0;
let slug: string;

const call = (path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`https://fb.test${path}`, init));

async function register(s = slug): Promise<string> {
  const res = await call(`/admin/sites/${s}`, { method: "POST", headers: admin });
  return ((await res.json()) as { siteKey: string }).siteKey;
}

const comment = (over: Record<string, unknown> = {}) => ({
  author: "Molly",
  body: "Love the hero, but the phone number is hard to see.",
  page: "/",
  anchor_id: "hero",
  anchor_path: "main > div#hero > h1",
  anchor_text: "Acupuncture in Portland",
  viewport_w: 390,
  viewport_h: 800,
  scroll_y: 0,
  build: "b1",
  user_agent: "test",
  ...over,
});

const post = (key: string | null, body: unknown, headers: Record<string, string> = {}) =>
  call(`/sites/${slug}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(key ? { "x-site-key": key } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const list = (key: string, qs = "") =>
  call(`/sites/${slug}/comments${qs}`, { headers: { "x-site-key": key, origin: ORIGIN } });

beforeEach(() => {
  slug = `test-site-${++n}`;
});

describe("comments", () => {
  it("creates and lists a comment", async () => {
    const key = await register();
    const res = await post(key, comment());
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const { comment: c } = (await res.json()) as { comment: { id: number; created_at: string } };
    expect(c.id).toBe(1);
    expect(Date.parse(c.created_at)).not.toBeNaN();

    const all = (await (await list(key)).json()) as { comments: { body: string; anchor_id: string }[] };
    expect(all.comments).toHaveLength(1);
    expect(all.comments[0]!.anchor_id).toBe("hero");
  });

  it("filters by page and orders oldest first", async () => {
    const key = await register();
    await post(key, comment({ page: "/", body: "one" }));
    await post(key, comment({ page: "/services/", body: "two" }));
    await post(key, comment({ page: "/services/", body: "three" }));
    const res = (await (await list(key, "?page=/services/")).json()) as { comments: { body: string }[] };
    expect(res.comments.map((c) => c.body)).toEqual(["two", "three"]);
  });

  it("accepts a general comment with no anchor", async () => {
    const key = await register();
    const res = await post(key, comment({ anchor_id: null, anchor_path: null, anchor_text: null }));
    expect(res.status).toBe(201);
  });

  it("rejects bad input", async () => {
    const key = await register();
    expect((await post(key, comment({ body: "  " }))).status).toBe(400);
    expect((await post(key, comment({ author: "" }))).status).toBe(400);
    expect((await post(key, comment({ body: "x".repeat(2001) }))).status).toBe(400);
    expect((await post(key, comment({ page: "services" }))).status).toBe(400);
    expect((await post(key, "not json")).status).toBe(400);
    expect((await post(key, "x".repeat(9000))).status).toBe(413);
  });

  it("clips overlong optional fields instead of rejecting", async () => {
    const key = await register();
    const res = await post(key, comment({ anchor_text: "y".repeat(500), user_agent: "u".repeat(500) }));
    const { comment: c } = (await res.json()) as { comment: { anchor_text: string; user_agent: string } };
    expect(c.anchor_text).toHaveLength(120);
    expect(c.user_agent).toHaveLength(200);
  });
});

describe("access", () => {
  it("404s a site that was never registered", async () => {
    expect((await post("anything", comment())).status).toBe(404);
    expect((await list("anything")).status).toBe(404);
  });

  it("401s a wrong or missing key, and keys do not cross sites", async () => {
    const key = await register();
    expect((await post("wrong", comment())).status).toBe(401);
    expect((await post(null, comment())).status).toBe(401);
    expect((await list("wrong")).status).toBe(401);
    const otherSlug = `${slug}-other`;
    await register(otherSlug);
    const res = await call(`/sites/${otherSlug}/comments`, { headers: { "x-site-key": key, origin: ORIGIN } });
    expect(res.status).toBe(401);
  });

  it("rotating the key revokes the old one", async () => {
    const first = await register();
    const second = await register();
    expect(second).not.toBe(first);
    expect((await post(first, comment())).status).toBe(401);
    expect((await post(second, comment())).status).toBe(201);
  });

  it("refuses unknown origins and answers preflight only for allowed ones", async () => {
    const key = await register();
    const bad = await post(key, comment(), { origin: "https://evil.example" });
    expect(bad.status).toBe(403);
    const ok = await call(`/sites/${slug}/comments`, {
      method: "OPTIONS",
      headers: { origin: ORIGIN, "access-control-request-method": "POST" },
    });
    expect(ok.status).toBe(204);
    const no = await call(`/sites/${slug}/comments`, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    expect(no.status).toBe(403);
  });

  it("rejects an invalid slug", async () => {
    const res = await call("/sites/Bad_Slug/comments", { headers: { "x-site-key": "k" } });
    expect(res.status).toBe(400);
  });
});

describe("limits", () => {
  it("rate-limits one client after 20 posts an hour", async () => {
    const key = await register();
    const headers = { "cf-connecting-ip": "203.0.113.9" };
    for (let i = 0; i < 20; i++) expect((await post(key, comment(), headers)).status).toBe(201);
    expect((await post(key, comment(), headers)).status).toBe(429);
    expect((await post(key, comment(), { "cf-connecting-ip": "203.0.113.10" })).status).toBe(201);
  });
});

describe("admin", () => {
  it("requires the admin token", async () => {
    expect((await call(`/admin/sites/${slug}`, { method: "POST" })).status).toBe(401);
    expect((await call(`/admin/sites/${slug}/export`, { headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });

  it("exports and deletes", async () => {
    const key = await register();
    await post(key, comment({ body: "keep" }));
    await post(key, comment({ body: "drop" }));
    const exp = (await (await call(`/admin/sites/${slug}/export`, { headers: admin })).json()) as {
      comments: { id: number; body: string }[];
    };
    expect(exp.comments.map((c) => c.body)).toEqual(["keep", "drop"]);

    const del = await call(`/admin/sites/${slug}/comments/${exp.comments[1]!.id}`, { method: "DELETE", headers: admin });
    expect(del.status).toBe(200);
    const again = await call(`/admin/sites/${slug}/comments/${exp.comments[1]!.id}`, { method: "DELETE", headers: admin });
    expect(again.status).toBe(404);
    const after = (await (await list(key)).json()) as { comments: unknown[] };
    expect(after.comments).toHaveLength(1);
  });
});

it("has the binding", () => {
  expect((env as unknown as Record<string, unknown>).FEEDBACK_SITE).toBeDefined();
});

describe("dashboard admin routes", () => {
  const get = (path: string, headers: Record<string, string> = admin) => call(path, { headers });

  it("lists registered sites with counts, and refuses without the admin token", async () => {
    const key = await register();
    await post(key, comment());
    const second = await post(key, comment({ body: "second" }));
    const id = ((await second.json()) as { comment: { id: number } }).comment.id;
    await call(`/admin/sites/${slug}/threads/${id}/resolve`, { method: "POST", headers: admin, body: JSON.stringify({ by: "Daniel", note: "done" }) });

    expect((await get("/admin/sites", {})).status).toBe(401);
    const res = await get("/admin/sites");
    expect(res.status).toBe(200);
    const mine = ((await res.json()) as { sites: { slug: string; open: number; resolved: number; comments: number; last_activity: string | null }[] }).sites.find((s) => s.slug === slug);
    expect(mine).toMatchObject({ open: 1, resolved: 1, comments: 2 });
    expect(mine!.last_activity).toBeTruthy();
  });

  it("remembers a preview URL on register, changes it without rotating the key, and clears it", async () => {
    const reg = await call(`/admin/sites/${slug}`, { method: "POST", headers: admin, body: JSON.stringify({ previewUrl: "https://molly.preview.example.com/" }) });
    const key = ((await reg.json()) as { siteKey: string }).siteKey;
    const find = async () => ((await (await get("/admin/sites")).json()) as { sites: { slug: string; preview_url: string | null }[] }).sites.find((s) => s.slug === slug)!;
    expect((await find()).preview_url).toBe("https://molly.preview.example.com");

    const put = await call(`/admin/sites/${slug}`, { method: "PUT", headers: admin, body: JSON.stringify({ previewUrl: "http://localhost:4322/molly/" }) });
    expect(put.status).toBe(200);
    expect((await find()).preview_url).toBe("http://localhost:4322/molly");
    expect((await list(key)).status).toBe(200); // the key still works

    await call(`/admin/sites/${slug}`, { method: "PUT", headers: admin, body: JSON.stringify({ previewUrl: "" }) });
    expect((await find()).preview_url).toBeNull();
  });

  it("refuses preview URLs that are not plain http(s)", async () => {
    for (const bad of ["javascript:alert(1)", "https://user:pw@example.com", "not a url", 5]) {
      const res = await call(`/admin/sites/${slug}`, { method: "PUT", headers: admin, body: JSON.stringify({ previewUrl: bad }) });
      expect(res.status, String(bad)).toBe(400);
    }
  });

  it("records who resolved and reopened when the dashboard names itself", async () => {
    const key = await register();
    const id = ((await (await post(key, comment())).json()) as { comment: { id: number } }).comment.id;
    const r = await call(`/admin/sites/${slug}/threads/${id}/resolve`, { method: "POST", headers: admin, body: JSON.stringify({ by: "Daniel", note: "Fees page added" }) });
    expect(((await r.json()) as { comment: { resolved_by: string; resolution_note: string } }).comment).toMatchObject({ resolved_by: "Daniel", resolution_note: "Fees page added" });
    const o = await call(`/admin/sites/${slug}/threads/${id}/reopen`, { method: "POST", headers: admin, body: "{}" });
    expect(((await o.json()) as { comment: { reopened_by: string } }).comment.reopened_by).toBe("admin");
  });
});
