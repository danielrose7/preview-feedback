import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import { live } from "lit/directives/live.js";
import { sectionLabel } from "@preview-feedback/widget/anchor";
import type { Comment } from "@preview-feedback/widget/api";
import { breakpoint, buildThreads, groupByPage, messages, pageName, type Thread } from "@preview-feedback/widget/threads";
import { Admin, AdminError, type SiteInfo } from "./api";
import { ago, matches, previewLink, snippet, type Filters, type Width } from "./format";
import { styles } from "./styles";

const TOKEN_KEY = "preview-feedback-admin-token";
const NAME_KEY = "preview-feedback-admin-name";
const POLL_MS = 30_000;

function store(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return null; // blocked storage: the token lives in memory for this visit
  }
}

function readToken(): { token: string; remembered: boolean } {
  const local = store("local")?.getItem(TOKEN_KEY);
  if (local) return { token: local, remembered: true };
  return { token: store("session")?.getItem(TOKEN_KEY) ?? "", remembered: false };
}

/** `#/<slug>/<thread id>` so a thread has a link and reload keeps your place. */
function readHash(): { slug: string; id: number | null } {
  const [, slug = "", id = ""] = location.hash.split("/");
  return { slug: decodeURIComponent(slug), id: /^\d+$/.test(id) ? Number(id) : null };
}

export class Studio extends LitElement {
  static override styles = styles;
  static override properties = {
    token: { state: true },
    sites: { state: true },
    slug: { state: true },
    threads: { state: true },
    selected: { state: true },
    filters: { state: true },
    loading: { state: true },
    error: { state: true },
    busy: { state: true },
    reply: { state: true },
    note: { state: true },
    confirmDelete: { state: true },
    editingPreview: { state: true },
    name: { state: true },
    reading: { state: true },
  };

  token = "";
  private remembered = false;
  private admin: Admin | null = null;
  sites: SiteInfo[] = [];
  slug = "";
  threads: Thread[] = [];
  selected: number | null = null;
  filters: Filters = { status: "open", page: "", width: "any" };
  loading = false;
  error = "";
  busy = false;
  reply = "";
  note = "";
  confirmDelete = false;
  editingPreview = false;
  name = store("local")?.getItem(NAME_KEY) || "Daniel";
  /** On a narrow screen the detail replaces the list. */
  reading = false;
  private poll = 0;
  private tokenDraft = "";
  private rememberDraft = false;

  override connectedCallback(): void {
    super.connectedCallback();
    const saved = readToken();
    this.remembered = saved.remembered;
    if (saved.token) this.signIn(saved.token, saved.remembered);
    window.addEventListener("hashchange", this.onHash);
    this.poll = window.setInterval(() => {
      if (document.visibilityState === "visible" && this.admin && !this.busy) void this.refresh(true);
    }, POLL_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.onHash);
    clearInterval(this.poll);
  }

  // ---- data ----------------------------------------------------------------------------------
  private signIn(token: string, remember: boolean): void {
    this.admin = new Admin(token);
    this.token = token;
    this.remembered = remember;
    this.error = "";
    void this.loadSites(true);
  }

  private signOut(): void {
    store("local")?.removeItem(TOKEN_KEY);
    store("session")?.removeItem(TOKEN_KEY);
    this.admin = null;
    this.token = "";
    this.sites = [];
    this.threads = [];
    this.slug = "";
    this.selected = null;
  }

  private fail(e: unknown): void {
    if (e instanceof AdminError && e.status === 401) {
      this.signOut();
      this.error = e.message;
      return;
    }
    this.error = e instanceof Error ? e.message : "Something went wrong.";
  }

  private async loadSites(first = false): Promise<void> {
    if (!this.admin) return;
    try {
      this.sites = await this.admin.sites();
      if (first) {
        // Keep the token only once the server has accepted it.
        const keep = store(this.remembered ? "local" : "session");
        keep?.setItem(TOKEN_KEY, this.token);
        const want = readHash();
        const slug = this.sites.find((s) => s.slug === want.slug)?.slug ?? this.sites[0]?.slug ?? "";
        if (slug) await this.pick(slug, want.slug === slug ? want.id : null);
      }
    } catch (e) {
      this.fail(e);
    }
  }

  private async pick(slug: string, id: number | null = null): Promise<void> {
    this.slug = slug;
    this.selected = id;
    this.reading = id !== null;
    this.filters = { status: "open", page: "", width: "any" };
    this.threads = [];
    this.resetDrafts();
    await this.refresh();
    const t = this.thread(id);
    if (t && t.root.status === "resolved") this.filters = { ...this.filters, status: "resolved" };
    this.writeHash();
  }

  /** Reloads the selected site's threads and the site list counts. `quiet` skips the spinner. */
  private async refresh(quiet = false): Promise<void> {
    if (!this.admin || !this.slug) return;
    if (!quiet) this.loading = true;
    try {
      const [rows, sites] = await Promise.all([this.admin.comments(this.slug), this.admin.sites()]);
      this.threads = buildThreads(rows as Comment[]);
      this.sites = sites;
      this.error = "";
    } catch (e) {
      this.fail(e);
    } finally {
      this.loading = false;
    }
  }

  private thread(id: number | null): Thread | null {
    return this.threads.find((t) => t.root.id === id) ?? null;
  }

  private get site(): SiteInfo | null {
    return this.sites.find((s) => s.slug === this.slug) ?? null;
  }

  private onHash = () => {
    const h = readHash();
    if (h.slug && h.slug !== this.slug && this.sites.some((s) => s.slug === h.slug)) void this.pick(h.slug, h.id);
    else if (h.slug === this.slug && h.id !== this.selected) this.select(h.id, false);
  };

  private writeHash(): void {
    if (!this.slug) return; // before the first load: leave the address alone, it says where to go
    const h = `#/${encodeURIComponent(this.slug)}${this.selected !== null ? `/${this.selected}` : ""}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  }

  private resetDrafts(): void {
    this.reply = "";
    this.note = "";
    this.confirmDelete = false;
    this.error = "";
  }

  private select(id: number | null, write = true): void {
    this.selected = id;
    this.reading = id !== null;
    this.resetDrafts();
    if (write) this.writeHash();
  }

  /** Runs a write, then reloads. Drafts survive a failure. */
  private async act(fn: (a: Admin) => Promise<unknown>): Promise<boolean> {
    if (!this.admin || this.busy) return false;
    this.busy = true;
    this.error = "";
    try {
      await fn(this.admin);
      await this.refresh(true);
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    } finally {
      this.busy = false;
    }
  }

  private saveName(v: string): void {
    this.name = v;
    store("local")?.setItem(NAME_KEY, v.trim());
  }

  // ---- views ---------------------------------------------------------------------------------
  protected override render(): TemplateResult {
    if (!this.token) return this.gate();
    const t = this.thread(this.selected);
    return html`<div class=${`app${this.reading && t ? " reading" : ""}`}>
      ${this.sidebar()}${this.listPane()}${this.detailPane(t)}
    </div>`;
  }

  private gate(): TemplateResult {
    const go = () => {
      const v = this.tokenDraft.trim();
      if (v) this.signIn(v, this.rememberDraft);
    };
    return html`<main class="gate">
      <h1>Feedback studio</h1>
      <p class="meta">Enter the admin token for this deployment. It stays in this browser and is sent only to this server.</p>
      <input type="password" aria-label="Admin token" autocomplete="current-password" placeholder="Admin token"
        @input=${(e: Event) => (this.tokenDraft = (e.target as HTMLInputElement).value)}
        @keydown=${(e: KeyboardEvent) => e.key === "Enter" && go()} />
      <label class="remember"><input type="checkbox" @change=${(e: Event) => (this.rememberDraft = (e.target as HTMLInputElement).checked)} /> Remember on this device</label>
      ${this.error ? html`<p class="err inline" role="alert">${this.error}</p>` : nothing}
      <button class="btn pri" type="button" @click=${go}>Sign in</button>
    </main>`;
  }

  private sidebar(): TemplateResult {
    return html`<nav class="side" aria-label="Sites">
      <div class="brand">Feedback</div>
      ${this.sites.map((s) => html`<button type="button" class=${`site${s.slug === this.slug ? " on" : ""}`} aria-current=${s.slug === this.slug ? "true" : "false"}
        @click=${() => this.pick(s.slug)}><span>${s.slug}</span><span class=${`badge${s.open ? "" : " zero"}`} aria-label=${`${s.open} open`}>${s.open}</span></button>`)}
      ${!this.sites.length ? html`<p class="meta pad">No sites yet. Run <code>pnpm feedback register &lt;slug&gt;</code>.</p>` : nothing}
      <div class="grow"></div>
      <div class="foot">
        <label class="meta">Replying as
          <input type="text" aria-label="Your name" maxlength="80" .value=${live(this.name)} @input=${(e: Event) => this.saveName((e.target as HTMLInputElement).value)} /></label>
        <span class="meta">Reads the admin API with your token. Nothing is stored here but the token, if you chose to remember it.</span>
        <button type="button" class="link" @click=${() => this.signOut()}>Sign out</button>
      </div>
    </nav>`;
  }

  private listPane(): TemplateResult {
    const site = this.site;
    const inSite = this.threads;
    const count = (status: "open" | "resolved") => inSite.filter((t) => t.root.status === status).length;
    const pages = groupByPage(inSite).map((g) => ({ page: g.page, label: pageName(g) }));
    const shown = inSite.filter((t) => matches(t, this.filters, breakpoint));
    const groups = groupByPage(shown);
    const setF = (patch: Partial<Filters>) => (this.filters = { ...this.filters, ...patch });
    return html`<section class="list" aria-label="Threads">
      <header>
        <div class="row-between"><h2>${site?.slug ?? "No site"}</h2>
          <button type="button" class="pill" ?disabled=${this.loading} @click=${() => this.refresh()}>${this.loading ? "Loading…" : "Refresh"}</button></div>
        <div class="pills">
          ${(["open", "resolved"] as const).map((k) => html`<button type="button" class="pill" aria-pressed=${String(this.filters.status === k)}
            @click=${() => setF({ status: k })}>${k === "open" ? "Open" : "Resolved"} (${count(k)})</button>`)}
          <select aria-label="Page" .value=${live(this.filters.page)} @change=${(e: Event) => setF({ page: (e.target as HTMLSelectElement).value })}>
            <option value="">All pages</option>${pages.map((p) => html`<option value=${p.page}>${p.label}</option>`)}</select>
          <select aria-label="Width" .value=${live(this.filters.width)} @change=${(e: Event) => setF({ width: (e.target as HTMLSelectElement).value as Width })}>
            <option value="any">Any width</option><option value="phone">Phone</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></select>
        </div>
        ${this.error ? html`<p class="err inline" role="alert">${this.error}</p>` : nothing}
      </header>
      <div class="scroll">
        ${!this.slug ? html`<p class="empty">Pick a site.</p>`
          : !shown.length ? html`<p class="empty">${this.loading ? "Loading…" : `No ${this.filters.status} comments${this.filters.page || this.filters.width !== "any" ? " match these filters" : ""}.`}</p>`
          : groups.map((g) => html`<div class="grp">${pageName(g)}</div>${g.threads.map((t) => this.row(t))}`)}
      </div>
    </section>`;
  }

  private row(t: Thread): TemplateResult {
    const r = t.root;
    const bits = [r.author, ago(r.created_at), sectionLabel(r.anchor_id), breakpoint(r.viewport_w),
      t.replies.length ? `${t.replies.length} repl${t.replies.length === 1 ? "y" : "ies"}` : "",
      r.status === "resolved" ? `resolved${r.resolved_by ? ` by ${r.resolved_by}` : ""}` : ""].filter(Boolean).join(" · ");
    return html`<button type="button" class=${`li${r.id === this.selected ? " sel" : ""}${r.status === "resolved" ? " done" : ""}`}
      aria-current=${r.id === this.selected ? "true" : "false"} @click=${() => this.select(r.id)}>
      <span class="dot"></span><span class="t"><div class="meta">${bits}</div><div>${snippet(r.body)}</div></span></button>`;
  }

  private detailPane(t: Thread | null): TemplateResult {
    if (!t) {
      return html`<section class="detail"><p class="none">${this.slug ? "Select a thread to read it and reply." : ""}</p>${this.settings()}</section>`;
    }
    const r = t.root;
    const resolved = r.status === "resolved";
    const link = previewLink(this.site?.preview_url ?? null, t);
    const meta = [pageName({ page: r.page, title: r.page_title }), sectionLabel(r.anchor_id), breakpoint(r.viewport_w) && `written on ${breakpoint(r.viewport_w)} at ${r.viewport_w}px`, r.build && `build ${r.build}`].filter(Boolean).join(" · ");
    const name = this.name.trim();
    const sendReply = () => {
      const v = this.reply.trim();
      if (!v) { this.error = "Please write a reply."; return; }
      if (!name) { this.error = "Add your name in the sidebar first."; return; }
      void this.act((a) => a.reply(this.slug, r.id, name, v)).then((ok) => ok && (this.reply = ""));
    };
    return html`<section class="detail" aria-label="Thread">
      <button type="button" class="btn back" @click=${() => this.select(null)}>← Back to list</button>
      <div class="row-between top">
        <div><h2>${snippet(r.body, 80)}</h2><div class="meta">${meta}</div></div>
        <div class="actions">
          <button type="button" class="btn" @click=${() => this.copyLink(t)}>Copy link</button>
          ${link ? html`<a class="btn pri" href=${link} target="_blank" rel="noopener noreferrer">Open on preview ↗</a>` : nothing}
        </div>
      </div>
      ${r.anchor_text ? html`<div class="pinned"><div class="meta">Pinned text</div>“${r.anchor_text}”</div>` : nothing}
      ${messages(t).map((m) => html`<div class="msg"><div class="meta"><strong>${m.author}</strong> · ${ago(m.created_at)}</div><p>${m.body}</p></div>`)}
      ${resolved ? html`<div class="status">Resolved${r.resolved_by ? ` by ${r.resolved_by}` : ""}${r.resolved_at ? ` · ${ago(r.resolved_at)}` : ""}${r.resolution_note ? `: ${r.resolution_note}` : ""}</div>`
        : r.reopened_by ? html`<div class="meta">Reopened by ${r.reopened_by}${r.reopened_at ? ` · ${ago(r.reopened_at)}` : ""}</div>` : nothing}
      <div class="grow"></div>
      ${this.error ? html`<p class="err inline" role="alert">${this.error}</p>` : nothing}
      ${resolved
        ? html`<div class="meta">This thread is resolved. Reopen it to reply.</div>
            <div class="controls"><button type="button" class="btn pri" ?disabled=${this.busy} @click=${() => this.act((a) => a.reopen(this.slug, r.id, name || "admin"))}>Reopen</button></div>`
        : html`<textarea aria-label="Reply" placeholder=${`Reply as ${name || "…"}`} .value=${live(this.reply)} @input=${(e: Event) => (this.reply = (e.target as HTMLTextAreaElement).value)}></textarea>
            <div class="controls">
              <input type="text" aria-label="Resolution note" maxlength="500" placeholder="Resolution note (optional), e.g. what changed" .value=${live(this.note)} @input=${(e: Event) => (this.note = (e.target as HTMLInputElement).value)} />
              <button type="button" class="btn" ?disabled=${this.busy} @click=${() => this.act((a) => a.resolve(this.slug, r.id, name || "admin", this.note.trim() || null)).then((ok) => ok && (this.note = ""))}>Resolve</button>
              <button type="button" class="btn pri" ?disabled=${this.busy} @click=${sendReply}>${this.busy ? "Working…" : "Reply"}</button>
            </div>`}
      <div class="meta">Admin delete is hard and removes the whole thread.
        ${this.confirmDelete
          ? html`Sure? <button type="button" class="link" @click=${() => this.act((a) => a.remove(this.slug, r.id)).then((ok) => { if (ok) this.select(null); })}>Yes, delete</button> · <button type="button" class="link" @click=${() => (this.confirmDelete = false)}>Keep</button>`
          : html`<button type="button" class="link bad" @click=${() => (this.confirmDelete = true)}>Delete thread</button>`}</div>
      ${this.settings()}
    </section>`;
  }

  /** Where the site's preview lives, so "Open on preview" can land on the pin. */
  private settings(): TemplateResult | typeof nothing {
    const site = this.site;
    if (!site) return nothing;
    if (!this.editingPreview) {
      return html`<div class="meta">Preview URL: ${site.preview_url ?? "not set"} · <button type="button" class="link" @click=${() => (this.editingPreview = true)}>${site.preview_url ? "change" : "set"}</button></div>`;
    }
    let draft = site.preview_url ?? "";
    return html`<div class="settings"><label class="meta" for="pu">Preview URL for ${site.slug} (where visitors open the preview)</label>
      <div class="controls"><input id="pu" type="url" placeholder="https://molly.preview.example.com" .value=${draft} @input=${(e: Event) => (draft = (e.target as HTMLInputElement).value)} />
        <button type="button" class="btn" @click=${() => (this.editingPreview = false)}>Cancel</button>
        <button type="button" class="btn pri" @click=${() => this.act((a) => a.setPreviewUrl(site.slug, draft.trim())).then((ok) => ok && (this.editingPreview = false))}>Save</button></div></div>`;
  }

  private async copyLink(t: Thread): Promise<void> {
    const url = `${location.origin}${location.pathname}#/${encodeURIComponent(this.slug)}/${t.root.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      this.error = "Could not copy. The address bar has the link.";
    }
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has("slug") || changed.has("selected")) this.writeHash();
  }
}

customElements.define("fb-studio", Studio);
