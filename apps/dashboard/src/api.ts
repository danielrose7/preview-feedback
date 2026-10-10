import type { Comment } from "@preview-feedback/widget/api";

export interface SiteInfo {
  slug: string;
  preview_url: string | null;
  created_at: string;
  open: number;
  resolved: number;
  comments: number;
  last_activity: string | null;
}

export class AdminError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** The admin API, called from the same origin the dashboard is served from. The token is the credential. */
export class Admin {
  constructor(private token: string, private base = "") {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${this.token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
      });
    } catch {
      throw new AdminError("Could not reach the server.", 0);
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new AdminError(res.status === 401 ? "That admin token was not accepted." : body.error ?? `Request failed (${res.status}).`, res.status);
    return body as T;
  }

  sites = () => this.call<{ sites: SiteInfo[] }>("/admin/sites").then((r) => r.sites);
  comments = (slug: string) => this.call<{ comments: Comment[] }>(`/admin/sites/${slug}/export`).then((r) => r.comments);
  reply = (slug: string, parent_id: number, author: string, body: string) =>
    this.call(`/admin/sites/${slug}/comments`, { method: "POST", body: JSON.stringify({ parent_id, author, body }) });
  resolve = (slug: string, id: number, by: string, note: string | null) =>
    this.call(`/admin/sites/${slug}/threads/${id}/resolve`, { method: "POST", body: JSON.stringify({ by, note }) });
  reopen = (slug: string, id: number, by: string) =>
    this.call(`/admin/sites/${slug}/threads/${id}/reopen`, { method: "POST", body: JSON.stringify({ by }) });
  remove = (slug: string, id: number) => this.call(`/admin/sites/${slug}/comments/${id}`, { method: "DELETE" });
  setPreviewUrl = (slug: string, previewUrl: string) =>
    this.call(`/admin/sites/${slug}`, { method: "PUT", body: JSON.stringify({ previewUrl }) });
}
