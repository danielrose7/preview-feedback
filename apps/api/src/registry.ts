import { DurableObject } from "cloudflare:workers";

export interface SiteRecord {
  slug: string;
  /** Where the site's preview lives, e.g. https://molly.preview.example.com. Lets the dashboard link to a pin. */
  preview_url: string | null;
  created_at: string;
}

/**
 * One object for the whole deployment: the list of sites the dashboard shows. The comments themselves
 * stay in each site's own object; this holds only the slug, the preview URL and when it was added.
 */
export class Registry extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS sites (slug TEXT PRIMARY KEY, preview_url TEXT, created_at TEXT NOT NULL)");
  }

  /** Adds the site if it is new; sets the preview URL only when one is given. */
  async upsert(slug: string, previewUrl: string | null): Promise<SiteRecord> {
    const sql = this.ctx.storage.sql;
    sql.exec("INSERT OR IGNORE INTO sites (slug, preview_url, created_at) VALUES (?, NULL, ?)", slug, new Date().toISOString());
    if (previewUrl !== null) sql.exec("UPDATE sites SET preview_url = ? WHERE slug = ?", previewUrl || null, slug);
    return this.get(slug)!;
  }

  get(slug: string): SiteRecord | null {
    return (this.ctx.storage.sql.exec("SELECT slug, preview_url, created_at FROM sites WHERE slug = ?", slug).toArray()[0] as unknown as SiteRecord) ?? null;
  }

  async all(): Promise<SiteRecord[]> {
    return this.ctx.storage.sql.exec("SELECT slug, preview_url, created_at FROM sites ORDER BY slug").toArray() as unknown as SiteRecord[];
  }
}
