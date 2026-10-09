// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { locatePin, nudgePins, numberPins, pinPoint, placePopover, toolbarFractions, toolbarPos, chooseVertical, isVertical, rotatePos, scrollDeltaFor } from "../src/layout";
import { pinTop } from "../src/widget";

const none = { anchor_id: null, anchor_path: null, anchor_text: null, anchor_dx: null, anchor_dy: null };
const rect = (l: number, t: number, w: number, h: number) =>
  ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON() {} }) as DOMRect;

describe("pinPoint", () => {
  it("places the pin that fraction across and down", () => {
    expect(pinPoint({ left: 100, top: 200, width: 400, height: 50 }, 0.5, 0.25)).toEqual({ x: 300, y: 212.5 });
  });
  it("uses the top-left for a comment from before pins existed", () => {
    expect(pinPoint({ left: 100, top: 200, width: 400, height: 50 }, null, null)).toEqual({ x: 100, y: 200 });
  });
});

describe("locatePin", () => {
  beforeEach(() => {
    document.body.innerHTML = `<main id="main"><div data-section="hero"><h1>Welcome</h1></div></main>`;
  });
  const hero = { anchor_id: "hero", anchor_path: "h1", anchor_text: "Welcome", anchor_dx: 0.5, anchor_dy: 0.5 };

  it("is none for a page comment", () => {
    expect(locatePin(document, none)).toEqual({ reason: "none" });
  });
  it("is missing when the spot is gone from the page", () => {
    document.querySelector("[data-section=hero]")!.remove();
    expect(locatePin(document, hero)).toEqual({ reason: "missing" });
  });
  it("is hidden when the element exists but has no box at this width", () => {
    document.querySelector("h1")!.getBoundingClientRect = () => rect(0, 0, 0, 0);
    expect(locatePin(document, hero)).toEqual({ reason: "hidden" });
  });
  it("gives the point when it can be drawn", () => {
    document.querySelector("h1")!.getBoundingClientRect = () => rect(10, 20, 100, 40);
    expect(locatePin(document, hero)).toEqual({ reason: "ok", pt: { x: 60, y: 40 } });
  });
});

describe("nudgePins", () => {
  it("keeps the first pin and slides later overlapping ones right until clear", () => {
    const m = nudgePins([{ id: 1, x: 100, y: 100 }, { id: 2, x: 102, y: 101 }, { id: 3, x: 105, y: 99 }]);
    expect(m.get(1)).toEqual({ x: 100, y: 100 });
    expect(m.get(2)!.x).toBeGreaterThanOrEqual(120);
    expect(m.get(3)!.x).toBeGreaterThan(m.get(2)!.x);
    const xs = [...m.values()].map((p) => p.x);
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) expect(Math.abs(xs[i]! - xs[j]!)).toBeGreaterThanOrEqual(20);
  });
  it("leaves pins that are far apart, or on different rows, alone", () => {
    const m = nudgePins([{ id: 1, x: 100, y: 100 }, { id: 2, x: 100, y: 160 }, { id: 3, x: 400, y: 100 }]);
    expect([...m.values()]).toEqual([{ x: 100, y: 100 }, { x: 100, y: 160 }, { x: 400, y: 100 }]);
  });
});

describe("numberPins", () => {
  it("numbers from 1 in the order given", () => {
    expect([...numberPins([7, 3, 9])]).toEqual([[7, 1], [3, 2], [9, 3]]);
  });
});

describe("placePopover", () => {
  const o = { vw: 1280, vh: 800, w: 340 };
  it("sits right of the pin", () => {
    const b = placePopover({ x: 300, y: 300 }, o);
    expect(b.left).toBe(336);
    expect(b.top).toBe(264);
    expect(b.bottom).toBeNull();
  });
  it("flips left when it would leave the screen", () => {
    const b = placePopover({ x: 1100, y: 300 }, o);
    expect(b.left).toBe(1100 - 340 - 8);
    expect(b.left + o.w).toBeLessThanOrEqual(o.vw - 12);
  });
  it("stays inside the viewport and above the toolbar", () => {
    const b = placePopover({ x: 5, y: 790 }, o);
    expect(b.left).toBeGreaterThanOrEqual(12);
    expect(b.top! + b.maxHeight).toBeLessThanOrEqual(o.vh - 72);
    const t = placePopover({ x: 600, y: -50 }, o);
    expect(t.top).toBe(12);
  });
  it("centres above the toolbar with no pin, and never overflows a small screen", () => {
    expect(placePopover(null, o)).toMatchObject({ left: 470, top: null, bottom: 72 });
    const small = placePopover({ x: 100, y: 100 }, { vw: 320, vh: 480, w: 340 });
    expect(small.left).toBe(12);
  });
});

describe("pinTop", () => {
  it("sits just above its spot in the middle of the screen", () => {
    expect(pinTop(300)).toBe(272);
  });
  it("is held just inside the top edge near it, so it is not clipped", () => {
    expect(pinTop(20)).toBe(2);
    expect(pinTop(5)).toBe(2);
  });
  it("moves up and away once its spot is above the screen, never sticking to the edge", () => {
    expect(pinTop(-10)).toBe(-10);
    expect(pinTop(-200)).toBe(-200);
    expect(pinTop(-200)).toBeLessThan(pinTop(-100));
  });
  it("never jumps: it moves by at most the spot's own movement", () => {
    for (let y = 60; y > -60; y--) expect(Math.abs(pinTop(y) - pinTop(y - 1))).toBeLessThanOrEqual(1);
  });
});

describe("toolbar placement", () => {
  const size = { w: 352, h: 48 };
  it("the default (centre, bottom) is 16px from the bottom and centred", () => {
    expect(toolbarPos({ fx: 0.5, fy: 1 }, size, 1280, 800)).toEqual({ left: 464, top: 736 });
  });
  it("reaches every corner with the margin", () => {
    expect(toolbarPos({ fx: 0, fy: 0 }, size, 1280, 800)).toEqual({ left: 16, top: 16 });
    expect(toolbarPos({ fx: 1, fy: 1 }, size, 1280, 800)).toEqual({ left: 1280 - 352 - 16, top: 800 - 48 - 16 });
  });
  it("round-trips a position, and clamps one outside the screen", () => {
    const f = toolbarFractions(300, 120, size, 1280, 800);
    expect(toolbarPos(f, size, 1280, 800)).toEqual({ left: 300, top: 120 });
    expect(toolbarFractions(-500, 5000, size, 1280, 800)).toEqual({ fx: 0, fy: 1 });
  });
  it("keeps its place proportionally when the window is resized, and never leaves the screen", () => {
    const f = { fx: 0.9, fy: 0.1 };
    const wide = toolbarPos(f, size, 1600, 900);
    const narrow = toolbarPos(f, size, 500, 600);
    expect(narrow.left + size.w).toBeLessThanOrEqual(500 - 16);
    expect(narrow.left).toBeGreaterThanOrEqual(16);
    expect(wide.left).toBeGreaterThan(narrow.left);
  });
  it("centres when the screen is narrower than the toolbar", () => {
    expect(toolbarFractions(0, 0, size, 300, 600).fx).toBe(0.5);
    expect(toolbarPos({ fx: 0.7, fy: 0 }, size, 300, 600).left).toBe(16);
  });
});

describe("placePopover around a moved toolbar", () => {
  const o = { vw: 1280, vh: 800, w: 340 };
  const lower = { left: 464, top: 736, width: 352, height: 48 };
  const upper = { left: 464, top: 16, width: 352, height: 48 };
  it("opens above a toolbar in the lower half, below one in the upper half", () => {
    const a = placePopover(null, { ...o, toolbar: lower });
    expect(a.top).toBeNull();
    expect(a.bottom).toBe(800 - (736 - 8));
    const b = placePopover(null, { ...o, toolbar: upper });
    expect(b.bottom).toBeNull();
    expect(b.top).toBe(16 + 48 + 8);
  });
  it("centres on the toolbar and clamps at the screen edges", () => {
    const left = { left: 16, top: 736, width: 48, height: 48 };
    expect(placePopover(null, { ...o, toolbar: left }).left).toBe(12);
    const right = { left: 1216, top: 736, width: 48, height: 48 };
    const r = placePopover(null, { ...o, toolbar: right });
    expect(r.left + o.w).toBeLessThanOrEqual(1280 - 12);
  });
  it("keeps a pinned popover clear of the toolbar on either side", () => {
    const a = placePopover({ x: 300, y: 780 }, { ...o, toolbar: lower });
    expect(a.top! + a.maxHeight).toBeLessThanOrEqual(736 - 8);
    const b = placePopover({ x: 300, y: 20 }, { ...o, toolbar: upper });
    expect(b.top).toBeGreaterThanOrEqual(16 + 48 + 8);
    expect(b.top! + b.maxHeight).toBeLessThanOrEqual(800 - 12);
  });
  it("behaves as before with no toolbar rect", () => {
    expect(placePopover(null, o)).toMatchObject({ left: 470, top: null, bottom: 72 });
  });
});

describe("orientation", () => {
  const pill = (left: number, top: number) => ({ left, top, width: 352, height: 48 });
  const col = (left: number, top: number) => ({ left, top, width: 56, height: 330 });
  it("stands up against a side edge", () => {
    expect(chooseVertical(pill(16, 300), 1280, 800, false)).toBe(true);
    expect(chooseVertical(pill(1280 - 352 - 16, 300), 1280, 800, false)).toBe(true);
  });
  it("lies down against the top or bottom", () => {
    expect(chooseVertical(col(500, 16), 1280, 800, true)).toBe(false);
    expect(chooseVertical(col(500, 800 - 330 - 16), 1280, 800, true)).toBe(false);
  });
  it("keeps its orientation anywhere else, both ways", () => {
    expect(chooseVertical(pill(400, 300), 1280, 800, false)).toBe(false);
    expect(chooseVertical(col(400, 200), 1280, 800, true)).toBe(true);
  });
  it("in a corner the nearer edge wins, and a tie goes to the side", () => {
    expect(chooseVertical(pill(16, 16), 1280, 800, false)).toBe(true);
    expect(chooseVertical(pill(30, 16), 1280, 800, true)).toBe(false); // 16px from the top beats 30px from the side
    expect(chooseVertical(pill(300, 16), 1280, 800, true)).toBe(false);
  });
  it("tells a column from a pill and from the bubble", () => {
    expect(isVertical(col(16, 100))).toBe(true);
    expect(isVertical(pill(16, 100))).toBe(false);
    expect(isVertical({ left: 0, top: 0, width: 48, height: 48 })).toBe(false);
  });
  it("turning keeps the gap to the edge it hugs, left or right", () => {
    const left = rotatePos(pill(16, 300), true, { w: 56, h: 330 }, 1280, 800);
    expect(left.left).toBe(16);
    expect(left.top).toBe(300 + 24 - 165);
    const right = rotatePos(pill(1280 - 352 - 16, 300), true, { w: 56, h: 330 }, 1280, 800);
    expect(right.left + 56).toBe(1280 - 16);
  });
  it("turning back keeps the gap to the top or bottom, and the centre across", () => {
    const bottom = rotatePos(col(500, 800 - 330 - 16), false, { w: 352, h: 48 }, 1280, 800);
    expect(bottom.top + 48).toBe(800 - 16);
    expect(bottom.left).toBe(500 + 28 - 176);
    expect(rotatePos(col(500, 16), false, { w: 352, h: 48 }, 1280, 800).top).toBe(16);
  });
});

describe("popover beside a vertical toolbar", () => {
  const o = { vw: 1280, vh: 800, w: 380 };
  const leftCol = { left: 16, top: 200, width: 56, height: 330 };
  const rightCol = { left: 1280 - 16 - 56, top: 200, width: 56, height: 330 };
  it("opens to the right of a toolbar on the left, and to the left of one on the right", () => {
    const a = placePopover(null, { ...o, toolbar: leftCol });
    expect(a.left).toBe(16 + 56 + 8);
    expect(a.top).toBe(200);
    const b = placePopover(null, { ...o, toolbar: rightCol });
    expect(b.left + o.w).toBe(rightCol.left - 8);
  });
  it("keeps a pinned popover off the toolbar and on screen", () => {
    const a = placePopover({ x: 30, y: 300 }, { ...o, toolbar: leftCol });
    expect(a.left).toBeGreaterThanOrEqual(16 + 56 + 8);
    const b = placePopover({ x: 1250, y: 300 }, { ...o, toolbar: rightCol });
    expect(b.left + o.w).toBeLessThanOrEqual(rightCol.left - 8);
    for (const x of [b, a]) {
      expect(x.top! + x.maxHeight).toBeLessThanOrEqual(800 - 12);
      expect(x.left).toBeGreaterThanOrEqual(12);
    }
  });
  it("leaves a pin that is nowhere near the toolbar where it would normally go", () => {
    const a = placePopover({ x: 600, y: 300 }, { ...o, toolbar: leftCol });
    expect(a.left).toBe(636);
  });
});

describe("scrollDeltaFor", () => {
  it("does not move the page when the pin is already comfortably on screen", () => {
    expect(scrollDeltaFor(300, 800)).toBe(0);
    expect(scrollDeltaFor(90, 800)).toBe(0);
    expect(scrollDeltaFor(660, 800)).toBe(0);
  });
  it("scrolls down to centre a pin below the fold, up for one above it", () => {
    expect(scrollDeltaFor(1500, 800)).toBe(1100);
    expect(scrollDeltaFor(-600, 800)).toBe(-1000);
  });
  it("treats a pin hidden under the top edge or the toolbar band as out of view", () => {
    expect(scrollDeltaFor(40, 800)).toBe(-360);
    expect(scrollDeltaFor(700, 800)).toBe(300);
  });
});
