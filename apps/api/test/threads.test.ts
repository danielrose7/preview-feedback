import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { FeedbackSite } from "../src/site";

const ns = (env as unknown as { FEEDBACK_SITE: DurableObjectNamespace<FeedbackSite> }).FEEDBACK_SITE;
const worker = (exports as unknown as { default: Fetcher }).default;
const ORIGIN = "http://localhost:4321";
const admin = { authorization: "Bearer test-admin" };
let n = 0;
let slug: string;
let key: string;

const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://fb.test${path}`, init));
const json = async <T = any>(res: Response) => (await res.json()) as T;

async function register(): Promise<string> {
  return (await json(await call(`/admin/sites/${slug}`, { method: "POST", headers: admin }))).siteKey;
}

const base = (over: Record<string, unknown> = {}) => ({
  author: "Molly",
  body: "Make the phone number bigger.",
  page: "/services/",
  page_title: "Services",
  anchor_id: "services",
  anchor_path: "section > h2",
  anchor_text: "Services",
  anchor_dx: 0.25,
  anchor_dy: 0.5,
  viewport_w: 390,
  viewport_h: 800,
  scroll_y: 0,
  build: "b1",
  user_agent: "test",
  ...over,
});

let ip = 0;
const send = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  call(path, {
    method,
    headers: { origin: ORIGIN, "x-site-key": key, "content-type": "application/json", "cf-connecting-ip": `198.51.100.${++ip % 250}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const post = (body: unknown) => send(`/sites/${slug}/comments`, "POST", body);
const resolve = (id: number, by = "Daniel", note?: string) => send(`/sites/${slug}/threads/${id}/resolve`, "POST", { by, note });
const reopen = (id: number, by = "Daniel") => send(`/sites/${slug}/threads/${id}/reopen`, "POST", { by });
const del = (id: number, author: string) =>
  send(`/sites/${slug}/threads/${id}`, "DELETE", undefined, { "x-author": author.includes("%") ? author : encodeURIComponent(author) });
const all = async () => (await json<{ comments: any[] }>(await send(`/sites/${slug}/comments`, "GET"))).comments;

async function root(over = {}): Promise<number> {
  return (await json(await post(base(over)))).comment.id;
}

beforeEach(async () => {
  slug = `thread-site-${++n}`;
  key = await register();
});

describe("replies", () => {
  it("creates a reply that takes the root's page and anchor", async () => {
    const id = await root();
    const res = await post({ author: "Daniel", body: "Done in the next build.", parent_id: id, page: "/other/", anchor_id: "nope" });
    expect(res.status).toBe(201);
    const { comment: r } = await json(res);
    expect(r.parent_id).toBe(id);
    expect(r.page).toBe("/services/");
    expect(r.page_title).toBe("Services");
    expect(r.anchor_id).toBe("services");
  });

  it("does not need a page for a reply, but does for a root", async () => {
    const id = await root();
    const { page: _p, ...noPage } = base({ parent_id: id });
    expect((await post(noPage)).status).toBe(201);
    const { page: _q, ...rootNoPage } = base();
    expect((await post(rootNoPage)).status).toBe(400);
  });

  it("refuses a reply to a missing thread (404) and to a reply (400)", async () => {
    expect((await post(base({ parent_id: 9999 }))).status).toBe(404);
    const id = await root();
    const reply = (await json(await post(base({ parent_id: id, author: "Daniel" })))).comment.id;
    expect((await post(base({ parent_id: reply }))).status).toBe(400);
  });

  it("rejects a malformed parent_id", async () => {
    expect((await post(base({ parent_id: "1" }))).status).toBe(400);
    expect((await post(base({ parent_id: 0 }))).status).toBe(400);
  });

  it("lists replies in order with their parent", async () => {
    const id = await root();
    await post(base({ parent_id: id, body: "one", author: "Daniel" }));
    await post(base({ parent_id: id, body: "two" }));
    expect((await all()).map((c) => [c.body, c.parent_id])).toEqual([
      ["Make the phone number bigger.", null], ["one", id], ["two", id],
    ]);
  });
});

describe("pin position", () => {
  it("stores and returns where inside the element the pin sits", async () => {
    const c = (await json(await post(base({ anchor_dx: 0.3333333, anchor_dy: 0.9 })))).comment;
    expect(c.anchor_dx).toBe(0.3333);
    expect(c.anchor_dy).toBe(0.9);
  });

  it("clamps out-of-range values and nulls junk", async () => {
    const c = (await json(await post(base({ anchor_dx: 5, anchor_dy: -2 })))).comment;
    expect([c.anchor_dx, c.anchor_dy]).toEqual([1, 0]);
    const d = (await json(await post(base({ anchor_dx: "left", anchor_dy: null })))).comment;
    expect([d.anchor_dx, d.anchor_dy]).toEqual([null, null]);
  });

  it("is null for a page comment with no spot", async () => {
    const c = (await json(await post(base({ anchor_id: null, anchor_path: null, anchor_text: null, anchor_dx: null, anchor_dy: null })))).comment;
    expect(c).toMatchObject({ anchor_id: null, anchor_dx: null, anchor_dy: null });
  });

  it("is inherited by replies, ignoring what the reply sends", async () => {
    const id = await root({ anchor_dx: 0.1, anchor_dy: 0.2 });
    const r = (await json(await post(base({ parent_id: id, author: "Daniel", anchor_dx: 0.9, anchor_dy: 0.9 })))).comment;
    expect([r.anchor_dx, r.anchor_dy]).toEqual([0.1, 0.2]);
  });

  it("comes back null for a comment stored before pins existed", async () => {
    await runInDurableObject(ns.get(ns.idFromName(slug)), (_o: FeedbackSite, state: DurableObjectState) => {
      state.storage.sql.exec(
        `INSERT INTO comments (created_at, author, author_key, body, page, viewport_w, viewport_h, scroll_y, build, user_agent)
         VALUES ('2026-01-01T00:00:00Z','Old','old','b','/',0,0,0,'','')`,
      );
    });
    expect([(await all())[0].anchor_dx, (await all())[0].anchor_dy]).toEqual([null, null]);
  });
});

describe("resolve and reopen", () => {
  it("resolves the thread and records who, when and the note", async () => {
    const id = await root();
    const res = await resolve(id, "Daniel", "Made it 24px");
    expect(res.status).toBe(200);
    const { comment: c } = await json(res);
    expect(c).toMatchObject({ status: "resolved", resolved_by: "Daniel", resolution_note: "Made it 24px" });
    expect(Date.parse(c.resolved_at)).not.toBeNaN();
  });

  it("anyone with the key can resolve, and an owner can resolve their own", async () => {
    const id = await root();
    expect((await json(await resolve(id, "Molly"))).comment.resolved_by).toBe("Molly");
  });

  it("is idempotent: a second resolve keeps the first record", async () => {
    const id = await root();
    await resolve(id, "Daniel", "first");
    const again = (await json(await resolve(id, "Molly", "second"))).comment;
    expect(again).toMatchObject({ resolved_by: "Daniel", resolution_note: "first" });
  });

  it("reopens, records who, and clears the resolution", async () => {
    const id = await root();
    await resolve(id);
    const c = (await json(await reopen(id, "Molly"))).comment;
    expect(c).toMatchObject({ status: "open", reopened_by: "Molly", resolved_by: null, resolution_note: null });
  });

  it("blocks replies while resolved, allows them after reopening", async () => {
    const id = await root();
    await resolve(id);
    const blocked = await post(base({ parent_id: id }));
    expect(blocked.status).toBe(409);
    expect((await json(blocked)).error).toMatch(/reopen/);
    await reopen(id);
    expect((await post(base({ parent_id: id }))).status).toBe(201);
  });

  it("only works on a thread root, and needs a name", async () => {
    const id = await root();
    const reply = (await json(await post(base({ parent_id: id })))).comment.id;
    expect((await resolve(reply)).status).toBe(404);
    expect((await resolve(9999)).status).toBe(404);
    expect((await send(`/sites/${slug}/threads/${id}/resolve`, "POST", {})).status).toBe(400);
  });

  it("needs the site key", async () => {
    const id = await root();
    expect((await send(`/sites/${slug}/threads/${id}/resolve`, "POST", { by: "x" }, { "x-site-key": "wrong" })).status).toBe(401);
  });
});

describe("delete", () => {
  it("lets the author delete a thread nobody else has touched", async () => {
    const id = await root();
    await post(base({ parent_id: id, body: "more from me" }));
    expect((await del(id, "Molly")).status).toBe(200);
    expect(await all()).toHaveLength(0);
  });

  it("matches names ignoring case and spacing", async () => {
    const id = await root({ author: "Molly  Gibson" });
    expect((await del(id, " molly gibson ")).status).toBe(200);
  });

  it("accepts a percent-encoded non-ASCII name, and treats a malformed escape as no name", async () => {
    const id = await root({ author: "José Núñez" });
    expect((await del(id, "%E0%A4%A")).status).toBe(403);
    expect((await del(id, encodeURIComponent("josé núñez"))).status).toBe(200);
  });

  it("refuses another name, and an empty one", async () => {
    const id = await root();
    expect((await del(id, "Someone Else")).status).toBe(403);
    expect((await del(id, "")).status).toBe(403);
    expect(await all()).toHaveLength(1);
  });

  it("is locked once anyone else replies, for the author and for the replier", async () => {
    const id = await root();
    await post(base({ parent_id: id, author: "Daniel", body: "On it." }));
    expect((await del(id, "Molly")).status).toBe(403);
    expect((await del(id, "Daniel")).status).toBe(403);
    expect(await all()).toHaveLength(2);
  });

  it("works on a resolved single-author thread", async () => {
    const id = await root();
    await resolve(id, "Daniel");
    expect((await del(id, "Molly")).status).toBe(200);
  });

  it("404s a missing thread or a reply id, and needs the key", async () => {
    const id = await root();
    const reply = (await json(await post(base({ parent_id: id })))).comment.id;
    expect((await del(9999, "Molly")).status).toBe(404);
    expect((await del(reply, "Molly")).status).toBe(404);
    expect((await send(`/sites/${slug}/threads/${id}`, "DELETE", undefined, { "x-site-key": "no", "x-author": "Molly" })).status).toBe(401);
  });

  it("allows DELETE and x-author through CORS preflight", async () => {
    const res = await call(`/sites/${slug}/threads/1`, { method: "OPTIONS", headers: { origin: ORIGIN } });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("DELETE");
    expect(res.headers.get("access-control-allow-headers")).toContain("x-author");
  });
});

describe("admin", () => {
  it("replies as Daniel by default, resolves with a note, reopens, and can reply only to a thread", async () => {
    const id = await root();
    const rep = await call(`/admin/sites/${slug}/comments`, {
      method: "POST", headers: admin, body: JSON.stringify({ parent_id: id, body: "Fixed in build 2." }),
    });
    expect(rep.status).toBe(201);
    expect((await json(rep)).comment.author).toBe("Daniel");

    const top = await call(`/admin/sites/${slug}/comments`, { method: "POST", headers: admin, body: JSON.stringify({ body: "x" }) });
    expect(top.status).toBe(400);

    const res = await call(`/admin/sites/${slug}/threads/${id}/resolve`, { method: "POST", headers: admin, body: JSON.stringify({ note: "shipped" }) });
    expect((await json(res)).comment).toMatchObject({ status: "resolved", resolved_by: "admin", resolution_note: "shipped" });
    const re = await call(`/admin/sites/${slug}/threads/${id}/reopen`, { method: "POST", headers: admin });
    expect((await json(re)).comment.status).toBe("open");
  });

  it("deletes any thread with its replies, or a single reply", async () => {
    const a = await root();
    const r1 = (await json(await post(base({ parent_id: a, author: "Daniel" })))).comment.id;
    await post(base({ parent_id: a })); // second reply
    const b = await root({ body: "other" });
    expect((await call(`/admin/sites/${slug}/comments/${r1}`, { method: "DELETE", headers: admin })).status).toBe(200);
    expect(await all()).toHaveLength(3);
    expect((await call(`/admin/sites/${slug}/comments/${a}`, { method: "DELETE", headers: admin })).status).toBe(200);
    expect((await all()).map((c) => c.id)).toEqual([b]);
  });

  it("requires the token for thread actions", async () => {
    const id = await root();
    expect((await call(`/admin/sites/${slug}/threads/${id}/resolve`, { method: "POST" })).status).toBe(401);
    expect((await call(`/admin/sites/${slug}/comments`, { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("does not leak author_key", async () => {
    await root();
    const exp = (await json(await call(`/admin/sites/${slug}/export`, { headers: admin }))).comments[0];
    expect(exp).not.toHaveProperty("author_key");
    expect(exp).toHaveProperty("status", "open");
  });
});

describe("limits and migration", () => {
  it("counts replies toward the 1000-comment cap", async () => {
    const stub = ns.get(ns.idFromName(slug));
    await runInDurableObject(stub, (_o: FeedbackSite, state: DurableObjectState) => {
      for (let i = 0; i < 1000; i++) {
        state.storage.sql.exec(
          `INSERT INTO comments (created_at, author, author_key, body, page, viewport_w, viewport_h, scroll_y, build, user_agent)
           VALUES ('2026-01-01T00:00:00Z','a','a','b','/',0,0,0,'','')`,
        );
      }
    });
    const res = await post(base());
    expect(res.status).toBe(429);
    expect((await json(res)).error).toMatch(/limit/);
  });

  it("migrates a first-release database in place and keeps its comments", async () => {
    const stub = ns.get(ns.idFromName(slug));
    await runInDurableObject(stub, (obj: FeedbackSite, state: DurableObjectState) => {
      const sql = state.storage.sql;
      sql.exec("DROP TABLE comments");
      sql.exec(`CREATE TABLE comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL,
        page TEXT NOT NULL, anchor_id TEXT, anchor_path TEXT, anchor_text TEXT, viewport_w INTEGER NOT NULL,
        viewport_h INTEGER NOT NULL, scroll_y INTEGER NOT NULL, build TEXT NOT NULL, user_agent TEXT NOT NULL)`);
      sql.exec(`INSERT INTO comments (created_at, author, body, page, anchor_id, viewport_w, viewport_h, scroll_y, build, user_agent)
                VALUES ('2026-10-09T20:00:00Z','  MOLLY ','old comment','/','hero',390,800,0,'b0','ua')`);
      obj.migrate();
      obj.migrate(); // running twice must be harmless
    });
    const rows = await all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ body: "old comment", parent_id: null, status: "open", page_title: "", anchor_dx: null, anchor_dy: null });
    // The migrated row's author counts for the delete rule, normalised.
    expect((await del(rows[0].id, "molly")).status).toBe(200);
  });
});
