import type { Comment } from "./api";

export interface Thread {
  root: Comment;
  replies: Comment[];
}

export interface PageGroup {
  page: string;
  title: string;
  threads: Thread[];
}

/** Same rule as the server: trimmed, inner whitespace collapsed, case-insensitive. */
export function authorKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Roots in creation order, each with its replies in order. Orphan replies are dropped. */
export function buildThreads(comments: Comment[]): Thread[] {
  const byRoot = new Map<number, Thread>();
  for (const c of comments) if (c.parent_id === null) byRoot.set(c.id, { root: c, replies: [] });
  for (const c of comments) if (c.parent_id !== null) byRoot.get(c.parent_id)?.replies.push(c);
  return [...byRoot.values()].sort((a, b) => a.root.id - b.root.id);
}

export function messages(t: Thread): Comment[] {
  return [t.root, ...t.replies];
}

/** The author-only delete rule: every message in the thread is by `name`. */
export function canDelete(t: Thread, name: string): boolean {
  const me = authorKey(name);
  return !!me && messages(t).every((m) => authorKey(m.author) === me);
}

export function openCount(threads: Thread[]): number {
  return threads.filter((t) => t.root.status === "open").length;
}

function normPath(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/**
 * Threads grouped by page. `order` is the site's nav hrefs: pages listed there come first in that
 * order, the rest follow alphabetically. The current page is not moved; the inbox marks it instead.
 */
export function groupByPage(threads: Thread[], order: string[] = []): PageGroup[] {
  const groups = new Map<string, PageGroup>();
  for (const t of threads) {
    const g = groups.get(t.root.page) ?? { page: t.root.page, title: "", threads: [] };
    g.title = g.title || t.root.page_title;
    g.threads.push(t);
    groups.set(t.root.page, g);
  }
  const rank = (p: string) => {
    const i = order.map(normPath).indexOf(normPath(p));
    return i === -1 ? Infinity : i;
  };
  return [...groups.values()].sort((a, b) => rank(a.page) - rank(b.page) || a.page.localeCompare(b.page));
}

/** A readable page name: the stored title with the site suffix dropped, else the path. */
export function pageName(g: { page: string; title: string }): string {
  const t = g.title.split(/\s[|–—-]\s/)[0]?.trim();
  if (t) return t;
  return g.page === "/" ? "Home" : g.page.replace(/^\/|\/$/g, "").replace(/[-/]/g, " ");
}

/** "phone" under 640px, "tablet" under 1024px, else "desktop", from the viewport it was written at. */
export function breakpoint(w: number): "phone" | "tablet" | "desktop" | null {
  if (!w) return null;
  return w < 640 ? "phone" : w < 1024 ? "tablet" : "desktop";
}
