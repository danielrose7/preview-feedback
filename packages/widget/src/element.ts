import { html, LitElement, type PropertyValues } from "lit";
import { mountInto, type MountOptions } from "./widget";

export const TAG = "preview-feedback";

/**
 * `<preview-feedback endpoint="https://feedback.example.com" slug="my-site" site-key="…">`
 *
 * Everything the widget draws lives in this element's shadow root, so the host page's CSS cannot
 * touch it. Connecting the element mounts the widget; removing it tears every listener, observer and
 * timer down again. Changing an attribute remounts it (Lit batches several changes into one). Properties set through `config` win over
 * attributes, for pages that build the element in script.
 */
export class PreviewFeedbackElement extends LitElement {
  static override properties = {
    endpoint: { type: String },
    slug: { type: String },
    siteKey: { type: String, attribute: "site-key" },
    build: { type: String },
    pages: { converter: (v: string | null) => parsePages(v) },
    config: { attribute: false },
  };
  /** The one mounted widget on the page; a second element is ignored so pins are never drawn twice. */
  private static active: PreviewFeedbackElement | null = null;

  endpoint?: string;
  slug?: string;
  siteKey?: string;
  build?: string;
  pages?: string[];
  /** Set through script; wins over the attributes. */
  config: Partial<MountOptions> = {};

  private destroy: (() => void) | null = null;

  // The widget draws into this one container, inside the shadow root Lit provides.
  protected override render() {
    return html`<div id="fb"></div>`;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.requestUpdate(); // re-attached: mount again
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.teardown();
  }

  /** Attributes can change together (and on upgrade); Lit batches them, so this mounts once. */
  protected override updated(changed: PropertyValues): void {
    if (changed.size || !this.destroy) this.remount();
  }

  private options(): MountOptions | null {
    const c = this.config ?? {};
    const endpoint = c.endpoint ?? this.endpoint;
    const slug = c.slug ?? this.slug;
    const siteKey = c.siteKey ?? this.siteKey;
    if (!endpoint || !slug || !siteKey) {
      console.warn(`<${TAG}> needs endpoint, slug and site-key; nothing was mounted.`);
      return null;
    }
    return { endpoint, slug, siteKey, build: c.build ?? this.build, pages: c.pages ?? this.pages };
  }

  private remount(): void {
    this.teardown();
    if (!this.isConnected) return;
    const opts = this.options();
    if (!opts) return;
    const other = PreviewFeedbackElement.active;
    if (other && other !== this && other.isConnected) {
      console.warn(`<${TAG}> is already on this page; the second one is ignored.`);
      return;
    }
    const container = this.renderRoot.querySelector<HTMLElement>("#fb");
    if (!container) return;
    PreviewFeedbackElement.active = this;
    this.destroy = mountInto(this, opts, container);
  }

  private teardown(): void {
    this.destroy?.();
    this.destroy = null;
    if (PreviewFeedbackElement.active === this) PreviewFeedbackElement.active = null;
  }
}

/** The `pages` attribute: a JSON array, or hrefs separated by commas. */
export function parsePages(v: string | null): string[] | undefined {
  if (!v) return undefined;
  const t = v.trim();
  if (t.startsWith("[")) {
    try {
      const a = JSON.parse(t) as unknown;
      return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : undefined;
    } catch {
      return undefined;
    }
  }
  return t.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Registers the element once; safe to call again, and safe if another copy of the script got there first. */
export function define(tag = TAG): void {
  if (!customElements.get(tag)) customElements.define(tag, PreviewFeedbackElement);
}

/** Imperative mounting for pages that would rather call a function. Returns an undo. */
export function mount(opts: MountOptions): () => void {
  define();
  const el = document.createElement(TAG) as PreviewFeedbackElement;
  el.config = opts;
  document.body.append(el);
  return () => el.remove();
}

declare global {
  interface HTMLElementTagNameMap {
    "preview-feedback": PreviewFeedbackElement;
  }
}
