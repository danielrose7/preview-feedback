export interface CommentInput {
  /** Set for a reply; the root's page and anchor are used instead of the fields below. */
  parent_id: number | null;
  author: string;
  body: string;
  page: string;
  page_title: string;
  anchor_id: string | null;
  anchor_path: string | null;
  anchor_text: string | null;
  anchor_dx: number | null;
  anchor_dy: number | null;
  viewport_w: number;
  viewport_h: number;
  scroll_y: number;
  build: string;
  user_agent: string;
}

export const MAX_BODY_BYTES = 8 * 1024;

type Result = { ok: true; value: CommentInput } | { ok: false; error: string };

function str(v: unknown, max: number, required: boolean, name: string): string | null | Error {
  if (v === undefined || v === null || v === "") {
    return required ? new Error(`${name} is required`) : null;
  }
  if (typeof v !== "string") return new Error(`${name} must be a string`);
  const t = v.trim();
  if (!t) return required ? new Error(`${name} is required`) : null;
  return t.slice(0, max) === t || !required ? t.slice(0, max) : new Error(`${name} is too long`);
}

/** A 0 to 1 fraction rounded to 4 places; anything else (missing, NaN, text) is null, out of range is clamped. */
function frac(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.round(Math.min(Math.max(v, 0), 1) * 10000) / 10000;
}

function int(v: unknown, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
  return Math.min(Math.max(n, 0), max);
}

export function parseComment(raw: unknown): Result {
  if (!raw || typeof raw !== "object") return { ok: false, error: "body must be a JSON object" };
  const r = raw as Record<string, unknown>;

  const author = str(r.author, 80, true, "author");
  if (author instanceof Error) return { ok: false, error: author.message };
  const body = str(r.body, 2000, true, "body");
  if (body instanceof Error) return { ok: false, error: body.message };
  let parent_id: number | null = null;
  if (r.parent_id !== undefined && r.parent_id !== null) {
    if (typeof r.parent_id !== "number" || !Number.isInteger(r.parent_id) || r.parent_id < 1) {
      return { ok: false, error: "parent_id must be a positive integer" };
    }
    parent_id = r.parent_id;
  }
  // A reply takes its page from the root, so a client need not send one.
  const page = str(r.page, 300, parent_id === null, "page") ?? "/";
  if (page instanceof Error) return { ok: false, error: page.message };
  if (!page.startsWith("/")) return { ok: false, error: "page must be a path" };

  // Optional descriptive fields are clipped rather than rejected.
  const opt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

  return {
    ok: true,
    value: {
      parent_id,
      author: author!,
      body: body!,
      page,
      page_title: opt(r.page_title, 120) ?? "",
      anchor_id: opt(r.anchor_id, 100),
      anchor_path: opt(r.anchor_path, 300),
      anchor_text: opt(r.anchor_text, 120),
      anchor_dx: frac(r.anchor_dx),
      anchor_dy: frac(r.anchor_dy),
      viewport_w: int(r.viewport_w, 10000),
      viewport_h: int(r.viewport_h, 10000),
      scroll_y: int(r.scroll_y, 1_000_000),
      build: opt(r.build, 64) ?? "",
      user_agent: opt(r.user_agent, 200) ?? "",
    },
  };
}

export function validSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug);
}

/** `*` in a pattern matches any run of characters except `/`. */
export function originAllowed(origin: string, patterns: string): boolean {
  return patterns
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .some((p) => {
      const re = new RegExp(
        "^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$",
      );
      return re.test(origin);
    });
}

/** A short free-text field such as a resolver's name or a resolution note. */
export function parseName(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null;
}

export function parseNote(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null;
}
