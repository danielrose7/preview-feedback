import { DurableObject } from "cloudflare:workers";
import type { CommentInput } from "./validate";

export const MAX_COMMENTS = 1000;
export const POSTS_PER_HOUR = 20;

/** What the browser and the CLI see. `author_key` stays inside the object. */
export interface CommentRow {
  id: number;
  created_at: string;
  parent_id: number | null;
  author: string;
  body: string;
  page: string;
  page_title: string;
  anchor_id: string | null;
  anchor_path: string | null;
  anchor_text: string | null;
  /** Where inside the anchor element the pin sits, 0 to 1 from its top-left. Null for old or page-level comments. */
  anchor_dx: number | null;
  anchor_dy: number | null;
  viewport_w: number;
  viewport_h: number;
  scroll_y: number;
  build: string;
  user_agent: string;
  status: "open" | "resolved";
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
}

const COLUMNS = `id, created_at, parent_id, author, body, page, page_title, anchor_id, anchor_path,
  anchor_text, anchor_dx, anchor_dy, viewport_w, viewport_h, scroll_y, build, user_agent, status, resolved_at, resolved_by,
  resolution_note, reopened_at, reopened_by`;

export type Fail = "unregistered" | "key" | "rate" | "cap" | "no_parent" | "reply_to_reply" | "resolved";
export type AddResult = { ok: true; comment: CommentRow } | { ok: false; reason: Fail };
export type ThreadResult = { ok: true; comment: CommentRow } | { ok: false; reason: "unregistered" | "key" | "not_found" };
export type DeleteResult = { ok: true } | { ok: false; reason: "unregistered" | "key" | "not_found" | "forbidden" };

/** Columns added after the first release. Existing objects get them via ALTER TABLE. */
const ADDED: [string, string][] = [
  ["parent_id", "INTEGER"],
  ["author_key", "TEXT NOT NULL DEFAULT ''"],
  ["page_title", "TEXT NOT NULL DEFAULT ''"],
  ["status", "TEXT NOT NULL DEFAULT 'open'"],
  ["resolved_at", "TEXT"],
  ["resolved_by", "TEXT"],
  ["resolution_note", "TEXT"],
  ["reopened_at", "TEXT"],
  ["reopened_by", "TEXT"],
  ["anchor_dx", "REAL"],
  ["anchor_dy", "REAL"],
];

/** Same name = same author: trimmed, case-insensitive, inner whitespace collapsed. */
export function authorKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** One object per site slug. Holds the hashed site key and that site's threads. */
export class FeedbackSite extends DurableObject {
  private rate = new Map<string, number[]>();

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.migrate();
  }

  /** Idempotent: creates the first-release tables, then adds any missing columns. */
  migrate(): void {
    const sql = this.ctx.storage.sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        page TEXT NOT NULL,
        anchor_id TEXT,
        anchor_path TEXT,
        anchor_text TEXT,
        viewport_w INTEGER NOT NULL,
        viewport_h INTEGER NOT NULL,
        scroll_y INTEGER NOT NULL,
        build TEXT NOT NULL,
        user_agent TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS comments_page ON comments (page);
    `);
    const have = new Set(sql.exec("PRAGMA table_info(comments)").toArray().map((r) => r.name as string));
    for (const [name, def] of ADDED) {
      if (!have.has(name)) sql.exec(`ALTER TABLE comments ADD COLUMN ${name} ${def}`);
    }
    sql.exec("CREATE INDEX IF NOT EXISTS comments_parent ON comments (parent_id)");
    // Rows from before threads existed have no author_key; derive it once.
    for (const r of sql.exec("SELECT id, author FROM comments WHERE author_key = ''").toArray()) {
      sql.exec("UPDATE comments SET author_key = ? WHERE id = ?", authorKey(r.author as string), r.id);
    }
  }

  /** Sets (or rotates) the site key. Returns the new key; only its hash is kept. */
  async register(): Promise<string> {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const key = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const hash = await sha256(key);
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('key_hash', ?)", hash);
    return key;
  }

  private async keyState(key: string): Promise<"ok" | "unregistered" | "key"> {
    const row = this.ctx.storage.sql.exec("SELECT v FROM meta WHERE k = 'key_hash'").toArray()[0];
    if (!row) return "unregistered";
    return (await sha256(key)) === row.v ? "ok" : "key";
  }

  private get(id: number): CommentRow | null {
    const r = this.ctx.storage.sql.exec(`SELECT ${COLUMNS} FROM comments WHERE id = ?`, id).toArray()[0];
    return (r as unknown as CommentRow) ?? null;
  }

  /** The root of `id` (itself, if it is one). Replies are one level deep, so this is one hop. */
  private rootOf(id: number): CommentRow | null {
    const row = this.get(id);
    if (!row) return null;
    return row.parent_id === null ? row : this.get(row.parent_id);
  }

  private insert(input: CommentInput, admin: boolean): AddResult {
    const sql = this.ctx.storage.sql;
    const count = sql.exec("SELECT COUNT(*) AS n FROM comments").one().n as number;
    if (count >= MAX_COMMENTS && !admin) return { ok: false, reason: "cap" };

    let { page, page_title, anchor_id, anchor_path, anchor_text, anchor_dx, anchor_dy } = input;
    const parent = input.parent_id ?? null;
    if (parent !== null) {
      const root = this.get(parent);
      if (!root) return { ok: false, reason: "no_parent" };
      if (root.parent_id !== null) return { ok: false, reason: "reply_to_reply" };
      if (root.status === "resolved") return { ok: false, reason: "resolved" };
      // A reply belongs to its root's spot; whatever the client sent is ignored.
      ({ page, page_title, anchor_id, anchor_path, anchor_text, anchor_dx, anchor_dy } = root);
    }

    const created_at = new Date().toISOString();
    const id = sql
      .exec(
        `INSERT INTO comments (created_at, parent_id, author, author_key, body, page, page_title,
           anchor_id, anchor_path, anchor_text, anchor_dx, anchor_dy, viewport_w, viewport_h, scroll_y, build, user_agent)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        created_at, parent, input.author, authorKey(input.author), input.body, page, page_title,
        anchor_id, anchor_path, anchor_text, anchor_dx, anchor_dy, input.viewport_w, input.viewport_h, input.scroll_y,
        input.build, input.user_agent,
      )
      .one().id as number;
    return { ok: true, comment: this.get(id)! };
  }

  async add(key: string, input: CommentInput, rateKey: string): Promise<AddResult> {
    const state = await this.keyState(key);
    if (state !== "ok") return { ok: false, reason: state };

    const now = Date.now();
    const recent = (this.rate.get(rateKey) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= POSTS_PER_HOUR) return { ok: false, reason: "rate" };

    const res = this.insert(input, false);
    if (res.ok) {
      recent.push(now);
      this.rate.set(rateKey, recent);
    }
    return res;
  }

  /** The CLI: no site key, no rate limit, no cap. */
  async addAsAdmin(input: CommentInput): Promise<AddResult> {
    return this.insert(input, true);
  }

  private setStatus(id: number, status: "open" | "resolved", by: string, note: string | null): ThreadResult {
    const root = this.rootOf(id);
    if (!root || root.id !== id) return { ok: false, reason: "not_found" };
    // Idempotent: a second resolve (two people at once) leaves the first record in place.
    if (root.status !== status) {
      const at = new Date().toISOString();
      if (status === "resolved") {
        this.ctx.storage.sql.exec(
          "UPDATE comments SET status='resolved', resolved_at=?, resolved_by=?, resolution_note=? WHERE id=?",
          at, by, note, id,
        );
      } else {
        this.ctx.storage.sql.exec(
          "UPDATE comments SET status='open', reopened_at=?, reopened_by=?, resolved_at=NULL, resolved_by=NULL, resolution_note=NULL WHERE id=?",
          at, by, id,
        );
      }
    }
    return { ok: true, comment: this.get(id)! };
  }

  async resolve(key: string, id: number, by: string, note: string | null): Promise<ThreadResult> {
    const state = await this.keyState(key);
    if (state !== "ok") return { ok: false, reason: state };
    return this.setStatus(id, "resolved", by, note);
  }

  async reopen(key: string, id: number, by: string): Promise<ThreadResult> {
    const state = await this.keyState(key);
    if (state !== "ok") return { ok: false, reason: state };
    return this.setStatus(id, "open", by, null);
  }

  async resolveAsAdmin(id: number, note: string | null): Promise<ThreadResult> {
    return this.setStatus(id, "resolved", "admin", note);
  }

  async reopenAsAdmin(id: number): Promise<ThreadResult> {
    return this.setStatus(id, "open", "admin", null);
  }

  /** Hard delete. Allowed only when every message in the thread is by `author`. */
  async deleteThread(key: string, id: number, author: string): Promise<DeleteResult> {
    const state = await this.keyState(key);
    if (state !== "ok") return { ok: false, reason: state };
    const root = this.rootOf(id);
    if (!root || root.id !== id) return { ok: false, reason: "not_found" };
    const who = authorKey(author);
    const others = this.ctx.storage.sql
      .exec("SELECT COUNT(*) AS n FROM comments WHERE (id = ?1 OR parent_id = ?1) AND author_key != ?2", id, who)
      .one().n as number;
    if (!who || others > 0) return { ok: false, reason: "forbidden" };
    this.ctx.storage.sql.exec("DELETE FROM comments WHERE id = ?1 OR parent_id = ?1", id);
    return { ok: true };
  }

  async list(key: string, page: string | null): Promise<CommentRow[] | "unregistered" | "key"> {
    const state = await this.keyState(key);
    if (state !== "ok") return state;
    const cursor = page
      ? this.ctx.storage.sql.exec(`SELECT ${COLUMNS} FROM comments WHERE page = ? ORDER BY id`, page)
      : this.ctx.storage.sql.exec(`SELECT ${COLUMNS} FROM comments ORDER BY id`);
    return cursor.toArray() as unknown as CommentRow[];
  }

  async exportAll(): Promise<CommentRow[]> {
    return this.ctx.storage.sql.exec(`SELECT ${COLUMNS} FROM comments ORDER BY id`).toArray() as unknown as CommentRow[];
  }

  /** Admin delete of any one thread (root and replies) or a single reply. */
  async remove(id: number): Promise<boolean> {
    const row = this.get(id);
    if (!row) return false;
    this.ctx.storage.sql.exec(
      row.parent_id === null ? "DELETE FROM comments WHERE id = ?1 OR parent_id = ?1" : "DELETE FROM comments WHERE id = ?1",
      id,
    );
    return true;
  }
}
