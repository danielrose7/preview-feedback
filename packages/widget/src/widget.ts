import { html, nothing, render as litRender, type TemplateResult } from "lit";
import { live } from "lit/directives/live.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { anchorFor, findAnchor, sectionLabel, type Anchor } from "./anchor";
import { FeedbackApi, type Comment, type NewComment } from "./api";
import { chooseVertical, locatePin, nudgePins, numberPins, placePopover, rotatePos, scrollDeltaFor, toolbarFractions, toolbarPos, type Located, type Pt } from "./layout";
import { loadToolbar, loadUi, saveToolbar, saveUi, setPending, takePending, type Ui } from "./session";
import { CSS } from "./styles";
import { breakpoint, buildThreads, canDelete, groupByPage, messages, openCount, pageName, type Thread } from "./threads";

export interface MountOptions {
  endpoint: string;
  slug: string;
  siteKey: string;
  build?: string;
  /** The site's nav hrefs, so the inbox lists pages in the order visitors know them. */
  pages?: string[];
}

const NAME_KEY = "preview-feedback-name";
const PHONE = 640; // at or below this width the panel is a bottom sheet instead of a popover

function nameStore(op: "get" | "set", v = ""): string {
  try {
    if (op === "set") localStorage.setItem(NAME_KEY, v);
    else return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    // Private windows and blocked storage: the widget asks for the name again.
  }
  return "";
}

type Kid = Node | string | null | false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...(kids.filter(Boolean) as (Node | string)[]));
  return e;
}

/** A text button. `label` sets an aria-label for glyph-only text such as "×". */
function btn(text: string, cls: string, onClick: () => void, extra: { label?: string; disabled?: boolean } = {}): TemplateResult {
  return html`<button type="button" class=${cls} aria-label=${extra.label ?? nothing} ?disabled=${extra.disabled ?? false} @click=${onClick}>${text}</button>`;
}

const ICONS = {
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  comment: '<path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.8A8 8 0 1121 12z"/><path d="M12 9v6M9 12h6"/>',
  inbox: '<path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>',
  minimize: '<path d="M5 12h14"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  circleCheck: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.8M6.5 7.6A17 17 0 002 12s4 7 10 7a9.6 9.6 0 004-.9"/>',
} as const;

function svg(icon: keyof typeof ICONS, size = 18): TemplateResult {
  return html`<svg viewBox="0 0 24 24" width=${size} height=${size} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${unsafeSVG(ICONS[icon])}</svg>`;
}

/** A small icon-only button. The label doubles as the tooltip and the accessible name. */
function iconBtn(icon: keyof typeof ICONS, label: string, onClick: () => void, cls = ""): TemplateResult {
  return html`<button type="button" class=${`icon ${cls}`.trim()} aria-label=${label} title=${label} @click=${(e: Event) => { e.stopPropagation(); onClick(); }}>${svg(icon)}</button>`;
}

function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Top edge for a pin whose tip is at `y`. Normally the pin sits just above its spot; within 30px of the
 * top of the screen it is held just inside so it is not clipped, and once the spot itself scrolls
 * above the screen the pin moves up and away with it (never sticks to the edge).
 */
export function pinTop(y: number): number {
  return Math.round(Math.max(y - 28, Math.min(2, y)));
}

function snippet(s: string, n = 90): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/**
 * Builds the feedback UI inside `host` (a shadow root is attached, or reused) and returns a function
 * that tears it all down: every listener, observer and timer registered on the document or window is
 * removed, so removing the element from a page leaves nothing behind.
 */
export function mountInto(host: HTMLElement, opts: MountOptions, container?: HTMLElement): () => void {
  const api = new FeedbackApi(opts);
  let destroyed = false;
  const cleanups: (() => void)[] = [];
  /** addEventListener plus its undo, for anything outside the shadow root. */
  const listen = <T extends EventTarget>(target: T, type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  const page = location.pathname;

  // ---- state -------------------------------------------------------------------------------
  let comments: Comment[] = [];
  let threads: Thread[] = [];
  let loaded = false;
  let loadError = "";
  let ui: Ui = loadUi();
  let tb = loadToolbar();
  let name = nameStore("get");
  let editingName = false;
  let nameDraft = "";
  let anchor: Anchor | null = null; // the spot a new comment is being placed on
  let pendingPt: Pt | null = null;
  let placing = false;
  let busy = false;
  let notice = "";
  let resolving = false;
  let confirmingDelete = false;
  let confirmingRowDelete: number | null = null;
  let focusTextarea = false;
  const located = new Map<number, Located>();
  const drafts = { compose: "", resolveNote: "", replies: new Map<number, string>() };

  // ---- shell ------------------------------------------------------------------------------
  const root: ParentNode & { replaceChildren(...n: (Node | string)[]): void } = container ?? host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.replaceChildren(el("style", {}, CSS)); // a re-mount starts from a clean shadow root

  const pinsLayer = el("div", { class: "pins" });
  const panel = el("section", { class: "panel", role: "dialog", "aria-label": "Feedback", hidden: "" });
  const hl = el("div", { class: "hl", hidden: "" });
  const bar = el("div", { class: "bar", hidden: "", role: "status" });
  litRender(html`Click where you want to comment. ${btn("Cancel", "ghost", () => { stopPlacing(); render(); })}`, bar);
  const toolbar = el("div", { class: "toolbar", role: "toolbar", "aria-label": "Feedback tools" });
  root.append(pinsLayer, panel, hl, bar, toolbar);

  const persist = () => saveUi(ui);
  const thread = (id: number | null) => threads.find((t) => t.root.id === id) ?? null;
  const here = () => threads.filter((t) => t.root.page === page);
  /** Threads that get a pin: open ones on this page. A resolved thread never has a pin, whatever the filter. */
  const pinned = () => here().filter((t) => t.root.status === "open");
  const isSheet = () => window.innerWidth <= PHONE;

  function setData(rows: Comment[]): void {
    comments = rows;
    threads = buildThreads(rows);
    loaded = true;
    loadError = "";
  }

  async function refresh(): Promise<void> {
    try {
      const rows = await api.list();
      if (destroyed) return;
      setData(rows);
    } catch (e) {
      if (destroyed) return;
      loadError = e instanceof Error ? e.message : "Could not load comments.";
      loaded = true;
    }
    schedule();
  }

  // ---- pins and popover placement ------------------------------------------------------------
  let raf = 0;
  /** Coalesces scroll, resize and layout changes into one pass per frame. */
  function schedule(): void {
    if (!raf && !destroyed) raf = requestAnimationFrame(layout);
  }

  const pinEls = new Map<number, HTMLButtonElement>();
  let pendingEl: HTMLElement | null = null;
  let nums = new Map<number, number>();

  /** Finds each visible thread's spot on this page and numbers the pins. Cheap, so views call it before drawing. */
  function locateAll(): { id: number; x: number; y: number }[] {
    located.clear();
    const shown = pinned();
    const sel = ui.view === "thread" ? thread(ui.threadId) : null;
    const wanted = sel && sel.root.page === page && !shown.includes(sel) ? [...shown, sel] : shown;
    nums = numberPins(shown.map((t) => t.root.id));
    const pts: { id: number; x: number; y: number }[] = [];
    for (const t of wanted) {
      const loc = locatePin(document, t.root);
      located.set(t.root.id, loc);
      if (loc.reason === "ok" && shown.includes(t)) pts.push({ id: t.root.id, ...loc.pt });
    }
    return pts;
  }

  function layout(): void {
    raf = 0;
    if (destroyed) return;
    const pts = locateAll();
    const nudged = nudgePins(pts);

    const showPins = !ui.hidden && !host.hidden;
    pinsLayer.hidden = !showPins;
    const live = new Set<number>();
    for (const [id, p] of nudged) {
      const t = thread(id)!;
      live.add(id);
      let pin = pinEls.get(id);
      if (!pin) {
        pin = el("button", { type: "button", class: "pin" });
        pin.addEventListener("click", () => selectPin(id));
        pinEls.set(id, pin);
        pinsLayer.append(pin);
      }
      pin.textContent = String(nums.get(id) ?? "");
      pin.style.left = `${Math.round(p.x)}px`;
      pin.style.top = `${pinTop(p.y)}px`;
      pin.classList.toggle("selected", ui.open && ui.view === "thread" && ui.threadId === id);
      pin.setAttribute("aria-label", `Comment ${nums.get(id)}: ${snippet(t.root.body, 60)}`);
    }
    for (const [id, pin] of pinEls) if (!live.has(id)) { pin.remove(); pinEls.delete(id); }

    // The pin for a comment being placed follows its element too.
    if (anchor && (ui.view === "compose" || placing)) {
      const loc = anchor.anchor_id || anchor.anchor_text ? locatePin(document, anchor) : null;
      if (loc?.reason === "ok") pendingPt = loc.pt;
    }
    if (anchor && pendingPt && ui.view === "compose" && showPins) {
      pendingEl ??= pinsLayer.appendChild(el("span", { class: "pin pending", "aria-hidden": "true" }, "+"));
      pendingEl.style.left = `${Math.round(pendingPt.x)}px`;
      pendingEl.style.top = `${pinTop(pendingPt.y)}px`;
    } else if (pendingEl) {
      pendingEl.remove();
      pendingEl = null;
    }
    placePanel();
  }

  function placePanel(): void {
    if (panel.hidden) return;
    panel.classList.toggle("sheet", isSheet());
    if (isSheet()) {
      panel.removeAttribute("style");
      return;
    }
    const w = ui.view === "list" ? 380 : 340;
    let pin: Pt | null = null;
    if (ui.view === "thread") {
      const loc = located.get(ui.threadId ?? -1);
      if (loc?.reason === "ok") pin = loc.pt;
    } else if (ui.view === "compose" && anchor) pin = pendingPt;
    const r = toolbar.getBoundingClientRect();
    const b = placePopover(pin, { vw: window.innerWidth, vh: window.innerHeight, w, toolbar: { left: r.left, top: r.top, width: r.width, height: r.height } });
    Object.assign(panel.style, {
      width: `${w}px`,
      left: `${b.left}px`,
      top: b.top === null ? "auto" : `${b.top}px`,
      bottom: b.bottom === null ? "auto" : `${b.bottom}px`,
      maxHeight: `${b.maxHeight}px`,
    });
  }

  // ---- highlight and reveal -----------------------------------------------------------------
  function box(target: Element): void {
    const r = target.getBoundingClientRect();
    Object.assign(hl.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    hl.hidden = false;
  }

  /**
   * Brings the thread's pin into a comfortable part of the screen (only if it is not already there) and
   * outlines its element once the scroll settles. False when it was anchored but is gone.
   */
  function reveal(t: Thread): boolean {
    const r = t.root;
    if (!r.anchor_id && !r.anchor_text) return true; // a page comment has no spot
    const target = findAnchor(document, r);
    if (!target) return false;
    const loc = locatePin(document, r);
    const delta = loc.reason === "ok" ? scrollDeltaFor(loc.pt.y, window.innerHeight) : 0;
    const flash = () => {
      box(target);
      setTimeout(() => (hl.hidden = true), 1600);
    };
    if (!delta) {
      flash();
      return true;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let settled = false;
    const settle = () => {
      if (settled || destroyed) return;
      settled = true;
      window.removeEventListener("scrollend", settle);
      schedule(); // the popover follows the pin to its new place
      flash();
    };
    window.addEventListener("scrollend", settle);
    cleanups.push(() => window.removeEventListener("scrollend", settle));
    setTimeout(settle, reduced ? 50 : 900); // for browsers without scrollend
    window.scrollBy({ top: delta, behavior: reduced ? "auto" : "smooth" });
    return true;
  }

  // ---- navigation between views --------------------------------------------------------------
  function go(view: Ui["view"], threadId: number | null = null): void {
    ui = { ...ui, view, threadId };
    resolving = false;
    confirmingDelete = false;
    confirmingRowDelete = null;
    notice = "";
    if (view !== "compose") { anchor = null; pendingPt = null; }
    persist();
    render();
    // Other people post while this panel sits open; pick that up when moving around (not while composing).
    if (view !== "compose" && !busy) void refresh().then(render);
  }

  /** Opens a thread. `showSpot` also scrolls to and outlines it (the inbox does; clicking a pin does not). */
  function openThread(t: Thread, showSpot = true): void {
    if (t.root.page !== page) {
      // The site is multi-page: carry the request across the page load.
      ui = { ...ui, open: true, view: "thread", threadId: t.root.id };
      persist();
      setPending(t.root.id);
      location.assign(`${t.root.page}${t.root.page.includes("?") ? "&" : "?"}fb=${t.root.id}`);
      return;
    }
    if (showSpot) reveal(t);
    ui = { ...ui, open: true };
    go("thread", t.root.id);
  }

  function selectPin(id: number): void {
    const t = thread(id);
    if (t) openThread(t, false);
  }

  function setOpen(open: boolean): void {
    ui = { ...ui, open };
    persist();
    render();
    if (open) void refresh().then(render);
  }

  // ---- comment mode: click anywhere to drop a pin ---------------------------------------------
  const crosshair = el("style", {}, "html, html * { cursor: crosshair !important; }");
  const hover = (e: MouseEvent) => {
    const t = e.target as Element;
    if (t !== host) box(t);
  };
  const pick = (e: MouseEvent) => {
    const t = e.target as Element;
    if (t === host || host.contains(t)) return;
    e.preventDefault();
    e.stopPropagation();
    anchor = anchorFor(t, { x: e.clientX, y: e.clientY });
    pendingPt = { x: e.clientX, y: e.clientY };
    stopPlacing();
    ui = { ...ui, open: true, view: "compose", threadId: null };
    persist();
    focusTextarea = true;
    render();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (placing) { stopPlacing(); render(); }
    else if (ui.open) setOpen(false);
  };
  function startPlacing(): void {
    placing = true;
    bar.hidden = false;
    document.head.append(crosshair);
    listen(document, "mousemove", hover as EventListener, true);
    listen(document, "click", pick as EventListener, true);
    render();
  }
  function stopPlacing(): void {
    if (!placing) return;
    placing = false;
    bar.hidden = true;
    hl.hidden = true;
    crosshair.remove();
    document.removeEventListener("mousemove", hover, true);
    document.removeEventListener("click", pick, true);
  }

  // ---- actions -----------------------------------------------------------------------------
  /** Runs a server action, keeps drafts on failure, and refreshes the list on success. */
  async function act(fn: () => Promise<void>): Promise<boolean> {
    if (busy) return false;
    busy = true;
    notice = "";
    render();
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      notice = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      return false;
    } finally {
      busy = false;
      render();
    }
  }

  function needName(): boolean {
    if (name) return false;
    notice = "Please add your name first.";
    editingName = true;
    render();
    return true;
  }

  function payload(body: string, parent_id: number | null): NewComment {
    return {
      parent_id,
      author: name,
      body,
      page,
      page_title: document.title.slice(0, 120),
      anchor_id: anchor?.anchor_id ?? null,
      anchor_path: anchor?.anchor_path ?? null,
      anchor_text: anchor?.anchor_text ?? null,
      anchor_dx: anchor?.anchor_dx ?? null,
      anchor_dy: anchor?.anchor_dy ?? null,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      scroll_y: Math.round(window.scrollY),
      build: opts.build ?? "",
      user_agent: navigator.userAgent,
    };
  }

  async function sendNew(body: string): Promise<void> {
    if (needName()) return;
    let id = 0;
    const ok = await act(async () => {
      id = (await api.add(payload(body, null))).id;
    });
    if (ok) {
      drafts.compose = "";
      anchor = null;
      pendingPt = null;
      ui = { ...ui, filter: "open" };
      go("thread", id);
    }
  }

  async function sendReply(t: Thread, body: string): Promise<void> {
    if (needName()) return;
    const saved = anchor;
    anchor = null; // a reply takes its pin from the thread, never from a stale pending spot
    const ok = await act(async () => {
      await api.add(payload(body, t.root.id));
    });
    anchor = saved;
    if (ok) drafts.replies.delete(t.root.id);
  }

  // ---- views -------------------------------------------------------------------------------
  function nameRow(): TemplateResult {
    if (!name || editingName) {
      const save = () => {
        const v = (nameDraft || name).trim();
        if (!v) return;
        name = v;
        nameDraft = "";
        nameStore("set", v);
        editingName = false;
        notice = "";
        render();
      };
      return html`<div class="namerow">
        <input type="text" maxlength="80" autocomplete="name" placeholder="Your name" aria-label="Your name"
          .value=${live(nameDraft || name)}
          @input=${(e: Event) => (nameDraft = (e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} />
        ${btn("Save", "ghost small", save)}
      </div>`;
    }
    return html`<p class="who">Posting as ${name} · ${btn("change", "link", () => { editingName = true; render(); })}</p>`;
  }

  /** What to say when a comment on this page cannot be shown as a pin. */
  function spotNote(t: Thread): string {
    if (t.root.page !== page) return "";
    const r = located.get(t.root.id)?.reason;
    return r === "missing" ? "this spot has changed" : r === "hidden" ? "not visible at this width" : "";
  }

  const reopen = (id: number) => { if (!needName()) void act(async () => { await api.reopen(id, name); }); };

  function row(t: Thread): TemplateResult {
    const r = t.root;
    const where = sectionLabel(r.anchor_id);
    const bp = breakpoint(r.viewport_w);
    const note = spotNote(t);
    const meta = [r.author, ago(r.created_at), where, bp].filter(Boolean).join(" · ");
    const sub = [r.status === "resolved" ? `Resolved${r.resolved_by ? ` by ${r.resolved_by}` : ""}` : "", t.replies.length ? `${t.replies.length} repl${t.replies.length === 1 ? "y" : "ies"}` : "", note].filter(Boolean).join(" · ");
    const n = r.page === page ? nums.get(r.id) : undefined;
    const resolved = r.status === "resolved";
    const actions: TemplateResult[] = [];
    if (confirmingRowDelete === r.id) {
      actions.push(html`<span class="confirm">Delete?
        ${btn("Yes", "danger small", () => { void act(async () => { await api.remove(r.id, name); }).then(() => { confirmingRowDelete = null; render(); }); })}
        ${btn("No", "ghost small", () => { confirmingRowDelete = null; render(); })}</span>`);
    } else {
      actions.push(resolved
        ? iconBtn("undo", "Reopen", () => reopen(r.id))
        : iconBtn("check", "Resolve", () => { if (!needName()) void act(async () => { await api.resolve(r.id, name, null); }); }, "ok"));
      if (name && canDelete(t, name)) actions.push(iconBtn("trash", "Delete thread", () => { confirmingRowDelete = r.id; render(); }, "bad"));
    }
    return html`<li class=${`item${resolved ? " is-resolved" : ""}`}>
      <span class=${`num${n ? "" : " none"}`} aria-hidden="true">${n ? String(n) : ""}</span>
      <button type="button" class="row-btn" @click=${() => openThread(t)}>
        <span class="meta">${meta}</span>
        <span class="snip">${snippet(r.body)}</span>
        ${sub ? html`<span class="sub">${sub}</span>` : nothing}
      </button>
      <div class="acts">${actions}</div>
    </li>`;
  }

  function listView(): TemplateResult[] {
    const openHere = openCount(here());
    const openAll = openCount(threads);
    const tabs = html`<div class="tabs" role="tablist">
      ${(["page", "all"] as const).map((k) => html`<button type="button" role="tab" class="tab" aria-selected=${String(ui.tab === k)}
        @click=${() => { ui = { ...ui, tab: k }; persist(); render(); }}>${k === "page" ? `This page (${openHere})` : `All pages (${openAll})`}</button>`)}
    </div>`;
    const filter = html`<div class="seg">
      ${(["open", "resolved"] as const).map((k) => {
        const n = threads.filter((t) => (ui.tab === "page" ? t.root.page === page : true) && t.root.status === k).length;
        return html`<button type="button" aria-pressed=${String(ui.filter === k)}
          @click=${() => { ui = { ...ui, filter: k }; persist(); render(); schedule(); }}>${k === "open" ? "Open" : "Resolved"} (${n})</button>`;
      })}
    </div>`;

    const shown = (ui.tab === "page" ? here() : threads).filter((t) => t.root.status === ui.filter);
    let body: TemplateResult;
    if (!loaded) body = html`<p class="empty">Loading…</p>`;
    else if (loadError) body = html`<p class="err">${loadError}</p>`;
    else if (!shown.length) body = html`<p class="empty">No ${ui.filter} comments${ui.tab === "page" ? " on this page" : ""} yet.</p>`;
    else if (ui.tab === "page") body = html`<ul class="list" aria-live="polite">${shown.map(row)}</ul>`;
    else {
      body = html`<div>${groupByPage(shown, opts.pages).map((g) => html`<section class="group">
        <h3>${pageName(g)}${g.page === page ? html`<span class="here">this page</span>` : nothing}</h3>
        <ul class="list">${g.threads.map(row)}</ul></section>`)}</div>`;
    }
    return [tabs, filter, editingName || (!name && notice) ? nameRow() : html``, body,
      btn("Page comment", "ghost block", () => { anchor = null; pendingPt = null; focusTextarea = true; go("compose"); })];
  }

  function messageEl(m: Comment, isRoot: boolean): TemplateResult {
    return html`<div class=${`msg${isRoot ? " root" : ""}`}>
      <div class="meta"><strong>${m.author}</strong> · ${ago(m.created_at)}</div>
      <p>${m.body}</p></div>`;
  }

  function threadView(): TemplateResult[] {
    const t = thread(ui.threadId);
    if (!t) return [html`<p class="empty">${loaded ? "This thread is no longer there." : "Loading…"}</p>`, btn("Back", "ghost", () => go("list"))];
    const r = t.root;
    const resolved = r.status === "resolved";
    const where = sectionLabel(r.anchor_id);
    const bp = breakpoint(r.viewport_w);
    const note = spotNote(t);
    const mine = Boolean(name && canDelete(t, name));
    const send = () => {
      const v = (drafts.replies.get(r.id) ?? "").trim();
      if (!v) { notice = "Please write a reply."; render(); return; }
      void sendReply(t, v);
    };
    return [
      html`<div class="thead">
        <p class="where">${[pageName({ page: r.page, title: r.page_title }), where, bp && `written on ${bp}`].filter(Boolean).join(" · ")}</p>
        <div class="acts">
          ${r.anchor_id || r.anchor_text ? iconBtn("target", "Show on page", () => { if (r.page === page) reveal(t); else openThread(t); }) : nothing}
          ${resolved ? iconBtn("undo", "Reopen", () => reopen(r.id)) : iconBtn("check", "Resolve", () => { resolving = true; render(); }, "ok")}
          ${mine ? iconBtn("trash", "Delete thread", () => { confirmingDelete = true; render(); }, "bad") : nothing}
        </div>
      </div>`,
      note === "this spot has changed" ? html`<p class="warn">This spot on the page has changed, so it can't be pinned.</p>`
        : note ? html`<p class="warn">This spot isn't visible at this screen width, so it has no pin here.</p>` : html``,
      html`<div class="msgs">${messages(t).map((m, i) => messageEl(m, i === 0))}</div>`,
      resolved
        ? html`<p class="status ok">Resolved${r.resolved_by ? ` by ${r.resolved_by}` : ""}${r.resolved_at ? ` · ${ago(r.resolved_at)}` : ""}${r.resolution_note ? `: ${r.resolution_note}` : ""}</p>`
        : r.reopened_by ? html`<p class="status">Reopened by ${r.reopened_by}${r.reopened_at ? ` · ${ago(r.reopened_at)}` : ""}</p>` : html``,
      nameRow(),
      resolved
        ? html`<p class="note">This thread is resolved. Reopen it to reply.</p>${btn("Reopen", "primary block", () => reopen(r.id), { disabled: busy })}`
        : html`<textarea rows="3" maxlength="2000" placeholder="Reply…" aria-label="Reply"
            .value=${live(drafts.replies.get(r.id) ?? "")}
            @input=${(e: Event) => drafts.replies.set(r.id, (e.target as HTMLTextAreaElement).value)}></textarea>
          <div class="row end">${btn(busy ? "Sending…" : "Reply", "primary", send, { disabled: busy })}</div>
          ${resolving ? html`<div class="inline">
            <input type="text" maxlength="500" placeholder="Note (optional), e.g. what changed" aria-label="Resolution note"
              .value=${live(drafts.resolveNote)} @input=${(e: Event) => (drafts.resolveNote = (e.target as HTMLInputElement).value)} />
            <div class="row">
              ${btn("Cancel", "ghost small", () => { resolving = false; render(); })}
              ${btn("Resolve thread", "primary small", () => {
                if (needName()) return;
                void act(async () => { await api.resolve(r.id, name, drafts.resolveNote.trim() || null); }).then((ok) => {
                  if (ok) { resolving = false; drafts.resolveNote = ""; render(); }
                });
              })}
            </div></div>` : nothing}`,
      mine && confirmingDelete
        ? html`<div class="inline"><p class="note">Delete this thread for everyone? This can't be undone.</p><div class="row">
            ${btn("Keep", "ghost small", () => { confirmingDelete = false; render(); })}
            ${btn("Delete", "danger small", () => { void act(async () => { await api.remove(r.id, name); }).then((ok) => { if (ok) go("list"); }); })}
          </div></div>` : html``,
    ];
  }

  function composeView(): TemplateResult[] {
    const send = () => {
      const v = drafts.compose.trim();
      if (!v) { notice = "Please write a comment."; render(); return; }
      void sendNew(v);
    };
    return [
      nameRow(),
      anchor ? html`<div class="chip"><span>Pinned to ${sectionLabel(anchor.anchor_id) ?? "the page"}${anchor.anchor_text ? ` · “${anchor.anchor_text.slice(0, 40)}”` : ""}</span>
        ${btn("×", "link", () => { anchor = null; pendingPt = null; render(); schedule(); }, { label: "Remove pin" })}</div>` : html``,
      html`<textarea rows="5" maxlength="2000" aria-label="Your comment"
        placeholder=${anchor ? "What would you change, or what do you like here?" : "Your comment about this page"}
        .value=${live(drafts.compose)} @input=${(e: Event) => (drafts.compose = (e.target as HTMLTextAreaElement).value)}></textarea>`,
      html`<div class="row end">${btn("Cancel", "ghost", () => go("list"))}${btn(busy ? "Sending…" : "Send", "primary", send, { disabled: busy })}</div>`,
    ];
  }

  // ---- render ------------------------------------------------------------------------------
  function renderToolbar(): void {
    const open = openCount(threads);
    const f = ui.filter;
    litRender(html`
      <button type="button" class="tb tb-grip" aria-label="Move toolbar. Drag, or use the arrow keys." title="Drag to move" v-drag>${svg("grip")}</button>
      <button type="button" class=${`tb${placing ? " on" : ""}`} aria-pressed=${String(placing)} aria-label="Add a comment"
        @click=${() => (placing ? (stopPlacing(), render()) : startPlacing())}>${svg("comment")}<span class="lbl">Comment</span></button>
      <span class="sep"></span>
      <button type="button" class=${`tb tb-inbox${ui.open ? " on" : ""}`} aria-expanded=${String(ui.open)} aria-label=${`Inbox, ${open} open`}
        @click=${() => {
          if (ui.open && ui.view === "list") setOpen(false);
          else { ui = { ...ui, open: true, view: "list", threadId: null }; go("list"); void refresh().then(render); }
        }}>${svg("inbox")}<span class="lbl">Inbox</span><span class="cnt">${open}</span></button>
      <span class="sep"></span>
      <button type="button" class="tb tb-filter" title=${f === "open" ? "Showing open comments" : "Showing resolved comments"}
        aria-label=${`Showing ${f} comments. Switch to ${f === "open" ? "resolved" : "open"}.`}
        @click=${() => { ui = { ...ui, filter: f === "open" ? "resolved" : "open" }; persist(); render(); }}>
        <span class="ftxt">${f === "open" ? "Open" : "Resolved"}</span><span class="ficon">${svg(f === "open" ? "circle" : "circleCheck", 20)}</span></button>
      <span class="sep"></span>
      <button type="button" class="tb tb-hide" aria-label=${ui.hidden ? "Show comment pins" : "Hide comment pins"} aria-pressed=${String(ui.hidden)}
        @click=${() => { ui = { ...ui, hidden: !ui.hidden }; persist(); render(); }}>${svg(ui.hidden ? "eyeOff" : "eye")}</button>
      <span class="sep"></span>
      <button type="button" class="tb tb-min" aria-label="Minimize toolbar" title="Minimize" @click=${() => setCollapsed(true)}>${svg("minimize")}</button>
      <button type="button" class="bubble" aria-label="Open feedback toolbar. Drag, or use the arrow keys, to move it." v-drag
        @click=${() => { if (!suppressClick) setCollapsed(false); }}>${svg("comment", 22)}${open ? html`<span class="bcnt">${open}</span>` : nothing}</button>`, toolbar);
    for (const h of toolbar.querySelectorAll<HTMLElement>("[v-drag]")) wireDrag(h);
    toolbar.classList.toggle("collapsed", tb.collapsed);
    toolbar.classList.toggle("vertical", tb.vertical && !tb.collapsed);
    placeToolbar();
  }

  // ---- the movable toolbar: drag anywhere, collapse to a bubble -------------------------------------
  function placeToolbar(): void {
    const w = toolbar.offsetWidth;
    const h = toolbar.offsetHeight;
    if (!w) return; // not laid out yet (host not attached, or hidden by the gate)
    const p = toolbarPos(tb, { w, h }, window.innerWidth, window.innerHeight);
    Object.assign(toolbar.style, { left: `${p.left}px`, top: `${p.top}px`, bottom: "auto", transform: "none" });
  }

  function moveTo(left: number, top: number, save: boolean): void {
    const size = { w: toolbar.offsetWidth, h: toolbar.offsetHeight };
    tb = { ...tb, ...toolbarFractions(left, top, size, window.innerWidth, window.innerHeight) };
    if (save) saveToolbar(tb);
    placeToolbar();
    placePanel();
  }

  /**
   * After a drop (or an arrow-key move): stand up against a side edge, lie down against the top or
   * bottom, stay as it is anywhere else. The bubble has no orientation, so for it only the choice is
   * remembered, and it applies when the bubble expands.
   */
  function settleOrientation(): void {
    const r = toolbar.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    const v = chooseVertical(rect, window.innerWidth, window.innerHeight, tb.vertical);
    if (v === tb.vertical) return;
    tb = { ...tb, vertical: v };
    if (tb.collapsed) { saveToolbar(tb); return; }
    toolbar.classList.toggle("vertical", v);
    const pos = rotatePos(rect, v, { w: toolbar.offsetWidth, h: toolbar.offsetHeight }, window.innerWidth, window.innerHeight);
    moveTo(pos.left, pos.top, true); // keeps the edge it was against
    render();
  }

  /** Collapsing or expanding keeps the toolbar's centre where it was. */
  function setCollapsed(collapsed: boolean): void {
    const r = toolbar.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    tb = { ...tb, collapsed };
    toolbar.classList.toggle("collapsed", collapsed);
    toolbar.classList.toggle("vertical", tb.vertical && !collapsed);
    moveTo(cx - toolbar.offsetWidth / 2, cy - toolbar.offsetHeight / 2, true);
    render();
  }

  let drag: { id: number; sx: number; sy: number; left: number; top: number; moved: boolean } | null = null;
  let suppressClick = false;
  const wired = new WeakSet<HTMLElement>(); // Lit keeps these buttons between renders, so wire each once
  function wireDrag(handle: HTMLElement): void {
    if (wired.has(handle)) return;
    wired.add(handle);
    handle.style.touchAction = "none"; // so a touch drag moves the toolbar instead of scrolling the page
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const r = toolbar.getBoundingClientRect();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, left: r.left, top: r.top, moved: false };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return; // a click, not a drag
      drag.moved = true;
      toolbar.classList.add("dragging");
      moveTo(drag.left + dx, drag.top + dy, false);
    });
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const was = drag;
      drag = null;
      toolbar.classList.remove("dragging");
      if (was.moved) {
        saveToolbar(tb);
        settleOrientation();
        suppressClick = true; // the click that follows a drag must not expand or toggle anything
        setTimeout(() => (suppressClick = false), 0);
      }
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 96 : 24;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      const r = toolbar.getBoundingClientRect();
      moveTo(r.left + d[0]!, r.top + d[1]!, true);
      settleOrientation();
    });
  }
  function render(): void {
    if (destroyed) return;
    locateAll();
    renderToolbar();
    panel.hidden = !ui.open || placing || ui.hidden;
    if (panel.hidden) { schedule(); return; }

    const titles = { list: "Inbox", thread: "Thread", compose: "New comment" };
    const body = ui.view === "list" ? listView() : ui.view === "thread" ? threadView() : composeView();
    litRender(html`<header>
      ${ui.view !== "list" ? btn("←", "link back", () => go("list"), { label: "Back to inbox" }) : nothing}
      <h2>${titles[ui.view]}</h2>
      ${btn("×", "link x", () => setOpen(false), { label: "Close" })}
    </header>${notice ? html`<p class="err" role="alert">${notice}</p>` : nothing}${body}`, panel);
    if (focusTextarea) {
      panel.querySelector("textarea")?.focus(); // Lit keeps focus and scroll on its own otherwise
      focusTextarea = false;
    }
    placePanel(); // now, not next frame, so the popover never flashes at its default spot
    schedule();
  }

  // Hidden while the preview passphrase gate is up (it sets html.gated until unlocked).
  const docEl = document.documentElement;
  const syncGate = () => { host.hidden = docEl.classList.contains("gated"); schedule(); };
  syncGate();
  const gateObserver = new MutationObserver(syncGate);
  gateObserver.observe(docEl, { attributes: true, attributeFilter: ["class"] });
  cleanups.push(() => gateObserver.disconnect());
  listen(document, "visibilitychange", () => {
    if (document.visibilityState === "visible" && ui.open && !busy && !placing) void refresh().then(render);
  });
  listen(document, "keydown", key as EventListener);
  // Someone else resolving or replying should show up without reopening the inbox.
  const poll = setInterval(() => {
    if (document.visibilityState === "visible" && !busy && !placing && ui.view !== "compose" && !host.hidden) void refresh().then(render);
  }, 30_000);
  cleanups.push(() => clearInterval(poll));

  // Pins follow their elements: scroll, resize, late layout, fonts, and the page changing under them.
  listen(window, "scroll", schedule, { capture: true, passive: true });
  listen(window, "resize", () => render());
  listen(window, "load", schedule);
  void document.fonts?.ready.then(schedule);
  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(document.body);
  cleanups.push(() => resizeObserver.disconnect());
  const bodyObserver = new MutationObserver(schedule);
  bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "open"] });
  cleanups.push(() => bodyObserver.disconnect());

  render();

  const pending = takePending();
  void refresh().then(() => {
    if (destroyed) return;
    const t = pending !== null ? thread(pending) : null;
    if (t) {
      ui = { ...ui, open: true, view: "thread", threadId: t.root.id };
      persist();
      layout();
      reveal(t);
    } else if (ui.view === "thread" && !thread(ui.threadId)) {
      ui = { ...ui, view: "list", threadId: null };
      persist();
    }
    render();
  });

  return () => {
    if (destroyed) return;
    stopPlacing();
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    for (const undo of cleanups.splice(0)) undo();
    litRender(nothing, panel);
    litRender(nothing, toolbar);
    litRender(nothing, bar);
    root.replaceChildren();
    host.hidden = false;
  };
}
