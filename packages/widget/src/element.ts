import { mountInto, type MountOptions } from "./widget";

export const TAG = "preview-feedback";

/**
 * `<preview-feedback endpoint="https://feedback.example.com" slug="my-site" site-key="…">`
 *
 * Everything the widget draws lives in this element's shadow root, so the host page's CSS cannot
 * touch it. Connecting the element mounts the widget; removing it tears every listener, observer and
 * timer down again. Changing an attribute remounts it. Properties set through `config` win over
 * attributes, for pages that build the element in script.
 */
export class PreviewFeedbackElement extends HTMLElement {
  static observedAttributes = ["endpoint", "slug", "site-key", "build", "pages"];
  /** The one mounted widget on the page; a second element is ignored so pins are never drawn twice. */
  private static active: PreviewFeedbackElement | null = null;

  private destroy: (() => void) | null = null;
  private props: Partial<MountOptions> = {};
  private queued = false;

  set config(v: Partial<MountOptions>) {
    this.props = v;
    this.queue();
  }
  get config(): Partial<MountOptions> {
    return this.props;
  }

  connectedCallback(): void {
    this.queue();
  }

  disconnectedCallback(): void {
    this.teardown();
  }

  attributeChangedCallback(): void {
    this.queue();
  }

  /** Several attributes can change in one tick (and on upgrade); mount once after all of them. */
  private queue(): void {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (this.isConnected) this.remount();
    });
  }

  private options(): MountOptions | null {
    const endpoint = this.props.endpoint ?? this.getAttribute("endpoint");
    const slug = this.props.slug ?? this.getAttribute("slug");
    const siteKey = this.props.siteKey ?? this.getAttribute("site-key");
    if (!endpoint || !slug || !siteKey) {
      console.warn(`<${TAG}> needs endpoint, slug and site-key; nothing was mounted.`);
      return null;
    }
    return {
      endpoint,
      slug,
      siteKey,
      build: this.props.build ?? this.getAttribute("build") ?? undefined,
      pages: this.props.pages ?? parsePages(this.getAttribute("pages")),
    };
  }

  private remount(): void {
    this.teardown();
    const opts = this.options();
    if (!opts) return;
    const other = PreviewFeedbackElement.active;
    if (other && other !== this && other.isConnected) {
      console.warn(`<${TAG}> is already on this page; the second one is ignored.`);
      return;
    }
    PreviewFeedbackElement.active = this;
    this.destroy = mountInto(this, opts);
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
