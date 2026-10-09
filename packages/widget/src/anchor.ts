// Where on a page a comment points. base wraps each section in <div data-section="..."> directly
// under <main> (the section's id, or `type-n` when it has none), so that name is the stable part; the path and text are for finding the exact
// element again and survive small edits.

export interface Anchor {
  anchor_id: string | null;
  anchor_path: string | null;
  anchor_text: string | null;
  /** Where inside the element the pin sits, 0 to 1 from its top-left. Null when not placed by a click. */
  anchor_dx: number | null;
  anchor_dy: number | null;
}

const clamp01 = (n: number) => Math.round(Math.min(Math.max(n, 0), 1) * 10000) / 10000;

const HOST_TAG = "preview-feedback";

function collapse(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Visible text with a space between elements (textContent would glue "Acupuncture" to "Molly"). */
export function textOf(el: Element): string {
  const parts: string[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.nodeValue ?? "");
  return collapse(parts.join(" "));
}

/** The section wrapper: the ancestor that is a direct child of <main> and carries data-section. */
function sectionOf(el: Element): Element | null {
  let cur: Element | null = el;
  while (cur && cur.parentElement) {
    if (cur.parentElement.tagName === "MAIN" && cur.hasAttribute("data-section")) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function segment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const same = [...(el.parentElement?.children ?? [])].filter((c) => c.tagName === el.tagName);
  return same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(el) + 1})` : tag;
}

/** `point` is the click in viewport coordinates; it becomes the pin's position inside `el`. */
export function anchorFor(el: Element, point?: { x: number; y: number }): Anchor {
  if (el.closest(HOST_TAG)) return { anchor_id: null, anchor_path: null, anchor_text: null, anchor_dx: null, anchor_dy: null };
  const root = sectionOf(el) ?? el.ownerDocument.body;
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== root) {
    parts.unshift(segment(cur));
    cur = cur.parentElement;
  }
  const text = textOf(el).slice(0, 120);
  const r = el.getBoundingClientRect();
  const placed = point && r.width > 0 && r.height > 0;
  return {
    anchor_dx: placed ? clamp01((point.x - r.left) / r.width) : null,
    anchor_dy: placed ? clamp01((point.y - r.top) / r.height) : null,
    anchor_id: root === el.ownerDocument.body ? null : root.getAttribute("data-section"),
    anchor_path: parts.length ? parts.join(" > ") : null,
    anchor_text: text || null,
  };
}

/** Best effort: path inside the section, then text match inside it, then the section itself. */
export function findAnchor(doc: Document, a: Anchor): Element | null {
  const root = a.anchor_id ? doc.querySelector(`[data-section="${CSS.escape(a.anchor_id)}"]`) : doc.body;
  if (!root) return null;
  if (a.anchor_path) {
    try {
      const hit = root.querySelector(`:scope > ${a.anchor_path}`);
      if (hit && (!a.anchor_text || textOf(hit).startsWith(a.anchor_text.slice(0, 40)))) {
        return hit;
      }
    } catch {
      // A malformed stored path falls through to the text match.
    }
  }
  if (a.anchor_text) {
    const needle = a.anchor_text.slice(0, 40);
    let best: Element | null = null;
    for (const el of root.querySelectorAll("*")) {
      if (textOf(el).startsWith(needle)) best = el; // keeps the deepest match
    }
    if (best) return best;
  }
  return a.anchor_id ? root : null;
}

/** "faq" -> "FAQ section"-style label from a section id, for lists. */
export function sectionLabel(id: string | null): string | null {
  if (!id) return null;
  const words = id.replace(/[-_]+/g, " ").trim();
  return words ? `${words} section` : null;
}
