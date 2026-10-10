import type { Thread } from "@preview-feedback/widget/threads";

export function ago(iso: string, now = Date.now()): string {
  const s = (now - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** The link that opens the preview on the exact pin: the widget reads `?fb=<thread id>`. Null without a preview URL. */
export function previewLink(previewUrl: string | null, t: Thread): string | null {
  if (!previewUrl) return null;
  const page = t.root.page.startsWith("/") ? t.root.page : `/${t.root.page}`;
  const joiner = page.includes("?") ? "&" : "?";
  return `${previewUrl.replace(/\/+$/, "")}${page}${joiner}fb=${t.root.id}`;
}

export function snippet(s: string, n = 110): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export type Width = "any" | "phone" | "tablet" | "desktop";

/** Everything a list filter can narrow by. */
export interface Filters {
  status: "open" | "resolved";
  page: string; // "" = all pages
  width: Width;
}

export function matches(t: Thread, f: Filters, bp: (w: number) => string | null): boolean {
  if (t.root.status !== f.status) return false;
  if (f.page && t.root.page !== f.page) return false;
  if (f.width !== "any" && bp(t.root.viewport_w) !== f.width) return false;
  return true;
}
