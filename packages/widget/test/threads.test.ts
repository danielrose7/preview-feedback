// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Comment } from "../src/api";
import { authorKey, breakpoint, buildThreads, canDelete, groupByPage, openCount, pageName } from "../src/threads";
import { DEFAULT_TOOLBAR, loadToolbar, loadUi, saveToolbar, saveUi, setPending, takePending } from "../src/session";

let id = 0;
const c = (over: Partial<Comment> = {}): Comment => ({
  id: ++id, created_at: "2026-10-09T20:00:00Z", parent_id: null, author: "Molly", body: "b", page: "/", page_title: "Home",
  anchor_id: null, anchor_path: null, anchor_text: null, anchor_dx: null, anchor_dy: null, viewport_w: 390, viewport_h: 800, status: "open",
  resolved_at: null, resolved_by: null, resolution_note: null, reopened_at: null, reopened_by: null, ...over,
});

beforeEach(() => {
  id = 0;
  sessionStorage.clear();
  history.replaceState(null, "", "/");
});

describe("buildThreads", () => {
  it("nests replies under their root in order, and drops orphans", () => {
    const a = c(), b = c(), r1 = c({ parent_id: a.id }), r2 = c({ parent_id: a.id }), orphan = c({ parent_id: 999 });
    const t = buildThreads([r2, a, orphan, b, r1].sort((x, y) => x.id - y.id));
    expect(t.map((x) => x.root.id)).toEqual([a.id, b.id]);
    expect(t[0]!.replies.map((r) => r.id)).toEqual([r1.id, r2.id]);
  });
  it("counts open threads, not messages", () => {
    const a = c(), r = c({ parent_id: a.id }), b = c({ status: "resolved" });
    expect(openCount(buildThreads([a, r, b]))).toBe(1);
  });
});

describe("canDelete", () => {
  it("needs every message to be by the same name, ignoring case and spacing", () => {
    const a = c({ author: "Molly Gibson" });
    const mine = buildThreads([a, c({ parent_id: a.id, author: " molly   gibson " })])[0]!;
    expect(canDelete(mine, "MOLLY GIBSON")).toBe(true);
    const mixed = buildThreads([a, c({ parent_id: a.id, author: "Daniel" })])[0]!;
    expect(canDelete(mixed, "Molly Gibson")).toBe(false);
    expect(canDelete(mixed, "Daniel")).toBe(false);
    expect(canDelete(mine, "")).toBe(false);
    expect(authorKey("  A   B ")).toBe("a b");
  });
});

describe("groupByPage", () => {
  it("orders by nav first, then alphabetically, and merges trailing-slash differences in the nav", () => {
    const ts = buildThreads([c({ page: "/faq/" }), c({ page: "/about/" }), c({ page: "/zeta/" }), c({ page: "/" }), c({ page: "/about/" })]);
    const g = groupByPage(ts, ["/", "/faq", "/about"]);
    expect(g.map((x) => x.page)).toEqual(["/", "/faq/", "/about/", "/zeta/"]);
    expect(g[2]!.threads).toHaveLength(2);
  });
});

describe("labels", () => {
  it("names a page from its title without the site suffix, else from the path", () => {
    expect(pageName({ page: "/services/", title: "Services | Ancient Roots" })).toBe("Services");
    expect(pageName({ page: "/first-visit/", title: "" })).toBe("first visit");
    expect(pageName({ page: "/", title: "" })).toBe("Home");
  });
  it("maps a viewport width to a breakpoint", () => {
    expect([breakpoint(390), breakpoint(800), breakpoint(1280), breakpoint(0)]).toEqual(["phone", "tablet", "desktop", null]);
  });
});

describe("toolbar state", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to bottom centre, expanded", () => {
    expect(loadToolbar()).toEqual(DEFAULT_TOOLBAR);
  });
  it("round-trips, and clamps or ignores junk", () => {
    saveToolbar({ fx: 0.2, fy: 0.8, collapsed: true, vertical: true });
    expect(loadToolbar()).toEqual({ fx: 0.2, fy: 0.8, collapsed: true, vertical: true });
    localStorage.setItem("preview-feedback-toolbar", JSON.stringify({ fx: 9, fy: -3, collapsed: "yes" }));
    expect(loadToolbar()).toEqual({ fx: 1, fy: 0, collapsed: false, vertical: false });
    localStorage.setItem("preview-feedback-toolbar", "{nope");
    expect(loadToolbar()).toEqual(DEFAULT_TOOLBAR);
    localStorage.setItem("preview-feedback-toolbar", JSON.stringify({ fx: "a" }));
    expect(loadToolbar()).toEqual(DEFAULT_TOOLBAR);
  });
});

describe("session", () => {
  it("round-trips panel state and falls back to defaults", () => {
    expect(loadUi()).toMatchObject({ open: false, tab: "page", filter: "open", view: "list" });
    saveUi({ open: true, tab: "all", filter: "resolved", view: "thread", threadId: 4, hidden: false });
    expect(loadUi()).toMatchObject({ open: true, tab: "all", threadId: 4 });
    sessionStorage.setItem("preview-feedback-ui", "{bad");
    expect(loadUi().open).toBe(false);
  });
  it("takes a pending id from ?fb= once, and strips it from the URL", () => {
    history.replaceState(null, "", "/services/?fb=12&x=1#top");
    expect(takePending()).toBe(12);
    expect(location.search).toBe("?x=1");
    expect(location.hash).toBe("#top");
    expect(takePending()).toBeNull();
  });
  it("takes a stored id once, and prefers the URL when both exist", () => {
    setPending(7);
    expect(takePending()).toBe(7);
    expect(takePending()).toBeNull();
    setPending(7);
    history.replaceState(null, "", "/?fb=9");
    expect(takePending()).toBe(9);
    expect(takePending()).toBeNull();
  });
  it("ignores a junk ?fb=", () => {
    history.replaceState(null, "", "/?fb=abc");
    expect(takePending()).toBeNull();
    expect(location.search).toBe("");
  });
});
