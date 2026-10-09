// Panel state survives page loads (the site is multi-page) through sessionStorage. Every access is
// wrapped: private windows and blocked storage just mean the panel starts closed on each page.

export interface Ui {
  open: boolean;
  tab: "page" | "all";
  filter: "open" | "resolved";
  view: "list" | "thread" | "compose";
  threadId: number | null;
  /** Pins hidden from the page (the toolbar's eye button). */
  hidden: boolean;
}

const UI_KEY = "preview-feedback-ui";
const PENDING_KEY = "preview-feedback-reveal";
const DEFAULT: Ui = { open: false, tab: "page", filter: "open", view: "list", threadId: null, hidden: false };

export function loadUi(): Ui {
  try {
    const raw = sessionStorage.getItem(UI_KEY);
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<Ui>) };
  } catch {}
  return { ...DEFAULT };
}

export function saveUi(ui: Ui): void {
  try {
    sessionStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {}
}

/** Remember which thread to open on the next page load. */
export function setPending(id: number): void {
  try {
    sessionStorage.setItem(PENDING_KEY, String(id));
  } catch {}
}

/** `?fb=N` (a shared deep link, or the fallback when storage is blocked), else the stored id. Consumed once. */
export function takePending(): number | null {
  let id: number | null = null;
  const url = new URL(location.href);
  const q = url.searchParams.get("fb");
  if (q !== null) {
    url.searchParams.delete("fb");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    if (/^\d+$/.test(q)) id = Number(q);
  }
  try {
    const s = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    if (id === null && s && /^\d+$/.test(s)) id = Number(s);
  } catch {}
  return id;
}

// ---- toolbar placement: per device, so it lives in localStorage, not sessionStorage -----------------

export interface ToolbarState {
  fx: number;
  fy: number;
  collapsed: boolean;
  /** Standing on its side, after being dropped against a left or right edge. */
  vertical: boolean;
}

const TB_KEY = "preview-feedback-toolbar";
/** Bottom centre, expanded. */
export const DEFAULT_TOOLBAR: ToolbarState = { fx: 0.5, fy: 1, collapsed: false, vertical: false };

export function loadToolbar(): ToolbarState {
  try {
    const raw = JSON.parse(localStorage.getItem(TB_KEY) ?? "null") as Partial<ToolbarState> | null;
    if (raw && typeof raw.fx === "number" && typeof raw.fy === "number" && Number.isFinite(raw.fx + raw.fy)) {
      return { fx: Math.min(Math.max(raw.fx, 0), 1), fy: Math.min(Math.max(raw.fy, 0), 1), collapsed: raw.collapsed === true, vertical: raw.vertical === true };
    }
  } catch {}
  return { ...DEFAULT_TOOLBAR };
}

export function saveToolbar(s: ToolbarState): void {
  try {
    localStorage.setItem(TB_KEY, JSON.stringify(s));
  } catch {}
}
