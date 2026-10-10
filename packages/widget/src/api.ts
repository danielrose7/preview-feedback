export interface Comment {
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
  anchor_dx: number | null;
  anchor_dy: number | null;
  viewport_w: number;
  viewport_h: number;
  build: string;
  status: "open" | "resolved";
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
}

export interface NewComment {
  parent_id?: number | null;
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

export interface ApiOptions {
  endpoint: string;
  slug: string;
  siteKey: string;
}

export class FeedbackApi {
  constructor(private o: ApiOptions) {}

  private url(path: string): string {
    return `${this.o.endpoint.replace(/\/$/, "")}/sites/${encodeURIComponent(this.o.slug)}/${path}`;
  }

  private async send<T>(path: string, method: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const res = await fetch(this.url(path), {
      method,
      headers: { "x-site-key": this.o.siteKey, ...(body === undefined ? {} : { "content-type": "application/json" }), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `Something went wrong (${res.status}).`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {}
      throw new Error(msg);
    }
    return (await res.json()) as T;
  }

  /** Every comment and reply on the site; the widget groups them into threads. */
  async list(): Promise<Comment[]> {
    return (await this.send<{ comments: Comment[] }>("comments", "GET")).comments;
  }

  async add(input: NewComment): Promise<Comment> {
    return (await this.send<{ comment: Comment }>("comments", "POST", input)).comment;
  }

  async resolve(id: number, by: string, note: string | null): Promise<Comment> {
    return (await this.send<{ comment: Comment }>(`threads/${id}/resolve`, "POST", { by, note })).comment;
  }

  async reopen(id: number, by: string): Promise<Comment> {
    return (await this.send<{ comment: Comment }>(`threads/${id}/reopen`, "POST", { by })).comment;
  }

  /** Header values must be Latin-1 safe, so the name travels encoded. */
  async remove(id: number, author: string): Promise<void> {
    await this.send<unknown>(`threads/${id}`, "DELETE", undefined, { "x-author": encodeURIComponent(author) });
  }
}
