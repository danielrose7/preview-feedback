import { findAnchor } from "./anchor";

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Box {
  left: number;
  top: number | null;
  bottom: number | null;
  maxHeight: number;
}

/** Why a comment has no pin on this page right now. `none` is a page comment: it never had a spot. */
export type Located = { reason: "ok"; pt: Pt } | { reason: "none" | "missing" | "hidden" };

interface Placed {
  anchor_id: string | null;
  anchor_path: string | null;
  anchor_text: string | null;
  anchor_dx: number | null;
  anchor_dy: number | null;
}

/** Viewport point for a pin: that fraction of the way across and down the element. Old comments have none, so top-left. */
export function pinPoint(r: { left: number; top: number; width: number; height: number }, dx: number | null, dy: number | null): Pt {
  return { x: r.left + (dx ?? 0) * r.width, y: r.top + (dy ?? 0) * r.height };
}

/** Finds the comment's spot on this page, or says why it cannot be drawn. Never silent. */
export function locatePin(doc: Document, c: Placed): Located {
  if (!c.anchor_id && !c.anchor_text) return { reason: "none" };
  const el = findAnchor(doc, c);
  if (!el) return { reason: "missing" };
  const r = el.getBoundingClientRect();
  // display:none, or a parent hidden at this width, gives the element no box at all.
  if (r.width === 0 && r.height === 0) return { reason: "hidden" };
  return { reason: "ok", pt: pinPoint(r, c.anchor_dx, c.anchor_dy) };
}

/**
 * Pins within `min` px of an earlier one slide right by `step` each until clear, so a stack stays
 * clickable. Input order decides who stays put (earliest first).
 */
export function nudgePins(pins: { id: number; x: number; y: number }[], min = 20, step = 18): Map<number, Pt> {
  const out = new Map<number, Pt>();
  const placed: Pt[] = [];
  for (const p of pins) {
    let x = p.x;
    for (let i = 0; i < 20 && placed.some((q) => Math.abs(q.x - x) < min && Math.abs(q.y - p.y) < min); i++) x += step;
    placed.push({ x, y: p.y });
    out.set(p.id, { x, y: p.y });
  }
  return out;
}

/** 1-based numbers in the order given. */
export function numberPins(ids: number[]): Map<number, number> {
  return new Map(ids.map((id, i) => [id, i + 1]));
}

const MARGIN = 12;
const GAP = 8;
const DEFAULT_RESERVE = 72; // with no toolbar rect: the default bottom-centre toolbar plus its gap

/**
 * Where a popover goes. With a pin: beside it (right, flipping left when it would leave the screen),
 * top aligned to the pin and clamped inside the viewport. Without one: centred on the toolbar. Either
 * way it stays clear of the toolbar: above it when the toolbar is in the lower half of the screen,
 * below it when it is in the upper half.
 */
export function placePopover(pin: Pt | null, o: { vw: number; vh: number; w: number; toolbar?: Rect | null }): Box {
  const tb = o.toolbar ?? null;
  if (tb && isVertical(tb)) return placeBesideColumn(pin, tb, o);
  let minTop = MARGIN;
  let maxBottom = o.vh - DEFAULT_RESERVE;
  let below = false;
  if (tb) {
    if (tb.top + tb.height / 2 > o.vh / 2) maxBottom = Math.min(o.vh - MARGIN, tb.top - GAP);
    else {
      maxBottom = o.vh - MARGIN;
      minTop = Math.max(MARGIN, tb.top + tb.height + GAP);
      below = true;
    }
  }
  if (!pin) {
    const cx = tb ? tb.left + tb.width / 2 : o.vw / 2;
    const left = Math.min(Math.max(Math.round(cx - o.w / 2), MARGIN), Math.max(MARGIN, o.vw - o.w - MARGIN));
    return below
      ? { left, top: minTop, bottom: null, maxHeight: Math.min(560, Math.max(160, maxBottom - minTop)) }
      : { left, top: null, bottom: o.vh - maxBottom, maxHeight: Math.min(560, Math.max(160, maxBottom - MARGIN)) };
  }
  let left = pin.x + 36;
  if (left + o.w > o.vw - MARGIN) left = pin.x - o.w - 8;
  left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, o.vw - o.w - MARGIN));
  const top = Math.min(Math.max(pin.y - 36, minTop), Math.max(minTop, maxBottom - 160));
  return { left: Math.round(left), top: Math.round(top), bottom: null, maxHeight: Math.max(160, maxBottom - top) };
}

/** A toolbar standing on its side is much taller than wide; the 48px bubble and the horizontal pill are not. */
export function isVertical(r: Rect): boolean {
  return r.height > r.width * 1.5;
}

/** Popover for a vertical toolbar: opens to its inboard side, never over it. */
function placeBesideColumn(pin: Pt | null, tb: Rect, o: { vw: number; vh: number; w: number }): Box {
  const onRight = tb.left + tb.width / 2 > o.vw / 2;
  const clampLeft = (l: number) => Math.min(Math.max(l, MARGIN), Math.max(MARGIN, o.vw - o.w - MARGIN));
  let left: number;
  let top: number;
  if (!pin) {
    left = onRight ? tb.left - GAP - o.w : tb.left + tb.width + GAP;
    top = tb.top;
  } else {
    left = pin.x + 36;
    if (left + o.w > o.vw - MARGIN) left = pin.x - o.w - 8;
    // If the popover would land on the toolbar, move it to the toolbar's inboard side.
    if (left < tb.left + tb.width + GAP && left + o.w > tb.left - GAP) left = onRight ? tb.left - GAP - o.w : tb.left + tb.width + GAP;
    top = pin.y - 36;
  }
  top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, o.vh - MARGIN - 160));
  return { left: Math.round(clampLeft(left)), top: Math.round(top), bottom: null, maxHeight: Math.max(160, Math.min(pin ? 640 : 560, o.vh - MARGIN - top)) };
}

// ---- the movable toolbar ----------------------------------------------------------------------

export const TB_MARGIN = 16;

/** Where the toolbar sits, as how far along its travel (0 to 1) in each direction, so a resize never strands it. */
export interface TbPlace {
  fx: number;
  fy: number;
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/** Pixel position for a toolbar of `size`: its travel is the viewport minus a margin on every side. */
export function toolbarPos(f: TbPlace, size: { w: number; h: number }, vw: number, vh: number): { left: number; top: number } {
  const rx = Math.max(0, vw - size.w - 2 * TB_MARGIN);
  const ry = Math.max(0, vh - size.h - 2 * TB_MARGIN);
  return { left: Math.round(TB_MARGIN + clamp01(f.fx) * rx), top: Math.round(TB_MARGIN + clamp01(f.fy) * ry) };
}

/** The inverse: fractions for a toolbar whose top-left corner is at (left, top), clamped to the travel. */
export function toolbarFractions(left: number, top: number, size: { w: number; h: number }, vw: number, vh: number): TbPlace {
  const rx = vw - size.w - 2 * TB_MARGIN;
  const ry = vh - size.h - 2 * TB_MARGIN;
  return { fx: rx > 0 ? clamp01((left - TB_MARGIN) / rx) : 0.5, fy: ry > 0 ? clamp01((top - TB_MARGIN) / ry) : 0.5 };
}

/**
 * Orientation after a drop: standing up when it hugs a side edge, lying down when it hugs the top or
 * bottom, unchanged anywhere else (so dragging a vertical toolbar inward does not flip it back). In a
 * corner the nearer edge wins; a tie goes to the side edge.
 */
export function chooseVertical(r: Rect, vw: number, vh: number, current: boolean, near = 48): boolean {
  const gx = Math.min(r.left, vw - (r.left + r.width));
  const gy = Math.min(r.top, vh - (r.top + r.height));
  if (gx <= near && gx <= gy) return true;
  if (gy <= near) return false;
  return current;
}

/**
 * Where the rotated toolbar's top-left goes: it keeps its gap to the edge it hugs and its centre along
 * the other axis, so a toolbar parked on the left edge stays on the left edge as it turns.
 */
export function rotatePos(r: Rect, toVertical: boolean, size: { w: number; h: number }, vw: number, vh: number): { left: number; top: number } {
  if (toVertical) {
    const hugRight = vw - (r.left + r.width) < r.left;
    return { left: hugRight ? r.left + r.width - size.w : r.left, top: r.top + r.height / 2 - size.h / 2 };
  }
  const hugBottom = vh - (r.top + r.height) < r.top;
  return { left: r.left + r.width / 2 - size.w / 2, top: hugBottom ? r.top + r.height - size.h : r.top };
}

/**
 * How far to scroll (positive = down) to bring a pin at viewport height `y` into a comfortable band:
 * clear of the top edge and of the bottom where the toolbar usually sits. Zero when it is already in
 * the band, so opening a thread whose pin is on screen never moves the page. Otherwise the pin ends
 * up at the middle of the screen.
 */
export function scrollDeltaFor(y: number, vh: number, top = 90, bottom = 140): number {
  if (y >= top && y <= vh - bottom) return 0;
  return Math.round(y - vh / 2);
}
